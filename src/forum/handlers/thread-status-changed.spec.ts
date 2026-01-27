import { handleThreadStatusChanged, ThreadStatusChangedPayload } from './thread-status-changed';
import { EventEnvelope } from '../../utils/lambda-eventbus-server';
import { ThreadFollows } from '../../dbmodels/forum/thread-follows';
import { dynamodb } from '../../dynamodb';
import { clearTable } from '../../testutils/db';
import { ThreadId } from '../../dbmodels/forum/thread';

function createMockPayload(overrides?: Partial<ThreadStatusChangedPayload>): ThreadStatusChangedPayload {
  return {
    participant_id: '3',
    item_id: '1000',
    new_status: 'waiting_for_trainer',
    former_status: 'not_started',
    helper_group_id: '100',
    updated_by: 'trainer-1',
    ...overrides,
  };
}

function createMockEnvelope(payload: unknown = createMockPayload()): EventEnvelope {
  return {
    version: '1.0',
    type: 'thread_status_changed',
    source_app: 'algoreabackend',
    instance: 'dev',
    time: '2026-01-23T14:36:20.392285135Z',
    request_id: 'test-request-123',
    payload,
  };
}

describe('handleThreadStatusChanged', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('successful parsing', () => {
    it('should log the parsed payload fields', async () => {
      const envelope = createMockEnvelope();

      await handleThreadStatusChanged(envelope);

      expect(consoleLogSpy).toHaveBeenCalledWith('Thread status changed:', {
        participantId: '3',
        itemId: '1000',
        newStatus: 'waiting_for_trainer',
        formerStatus: 'not_started',
        helperGroupId: '100',
        instance: 'dev',
        requestId: 'test-request-123',
      });
    });

    it('should handle events with all required fields without throwing', async () => {
      const envelope = createMockEnvelope();

      await expect(handleThreadStatusChanged(envelope)).resolves.not.toThrow();
    });

    it('should handle different status values', async () => {
      const envelope = createMockEnvelope(createMockPayload({
        new_status: 'closed',
        former_status: 'waiting_for_participant',
      }));

      await handleThreadStatusChanged(envelope);

      expect(consoleLogSpy).toHaveBeenCalledWith('Thread status changed:', expect.objectContaining({
        newStatus: 'closed',
        formerStatus: 'waiting_for_participant',
      }));
    });
  });

  describe('invalid payload handling', () => {
    it('should log error for missing required fields', async () => {
      const envelope = createMockEnvelope({
        participant_id: '3',
        // missing other required fields
      });

      await handleThreadStatusChanged(envelope);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to parse thread_status_changed payload:',
        expect.any(String)
      );
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should log error for null payload', async () => {
      const envelope = createMockEnvelope(null);

      await handleThreadStatusChanged(envelope);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });
});

describe('handleThreadStatusChanged - follower behavior', () => {
  let consoleLogSpy: jest.SpyInstance;
  let threadFollows: ThreadFollows;
  const threadId: ThreadId = { participantId: '3', itemId: '1000' };

  beforeEach(async () => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    threadFollows = new ThreadFollows(dynamodb);
    await clearTable();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('thread opening (not-open -> open)', () => {
    it('should add participant and updater as followers when thread opens', async () => {
      const envelope = createMockEnvelope(createMockPayload({
        participant_id: 'participant-1',
        updated_by: 'trainer-1',
        former_status: 'not_started',
        new_status: 'waiting_for_trainer',
      }));

      await handleThreadStatusChanged(envelope);

      const followers = await threadFollows.getFollowers({ participantId: 'participant-1', itemId: '1000' });
      expect(followers.map(f => f.userId).sort()).toEqual([ 'participant-1', 'trainer-1' ]);
    });

    it('should only add participant once when updater is the same as participant', async () => {
      const envelope = createMockEnvelope(createMockPayload({
        participant_id: 'user-1',
        updated_by: 'user-1',
        former_status: 'closed',
        new_status: 'waiting_for_participant',
      }));

      await handleThreadStatusChanged(envelope);

      const followers = await threadFollows.getFollowers({ participantId: 'user-1', itemId: '1000' });
      expect(followers).toHaveLength(1);
      expect(followers[0]?.userId).toBe('user-1');
    });

    it('should remove TTL from existing followers and not create duplicates', async () => {
      const ttl = Math.floor(Date.now() / 1000) + 3600;
      const testThreadId = { participantId: 'participant-1', itemId: '1000' };

      // Pre-existing follower with TTL (e.g., from previous closure)
      await threadFollows.follow(testThreadId, 'participant-1', ttl);
      await threadFollows.follow(testThreadId, 'existing-follower', ttl);

      const envelope = createMockEnvelope(createMockPayload({
        participant_id: 'participant-1',
        updated_by: 'trainer-1',
        former_status: 'not_started',
        new_status: 'waiting_for_trainer',
      }));

      await handleThreadStatusChanged(envelope);

      const followers = await threadFollows.getFollowers(testThreadId);
      // Should have: participant-1 (existing, not duplicated), existing-follower, trainer-1 (new)
      expect(followers.map(f => f.userId).sort()).toEqual([ 'existing-follower', 'participant-1', 'trainer-1' ]);

      // Verify TTL is removed
      const pk = `${process.env.STAGE}#THREAD#participant-1#1000#FOLLOW`;
      const result = await dynamodb.executeStatement({
        Statement: `SELECT ttl FROM "${process.env.TABLE_NAME}" WHERE pk = ?`,
        Parameters: [{ S: pk }],
      });
      for (const item of result.Items ?? []) {
        expect(item.ttl).toBeUndefined();
      }
    });
  });

  describe('thread closing (open -> not-open)', () => {
    it('should set TTL on all followers when thread closes', async () => {
      const testThreadId = { participantId: 'participant-1', itemId: '1000' };

      // Add some followers
      await threadFollows.follow(testThreadId, 'user-1');
      await threadFollows.follow(testThreadId, 'user-2');

      const envelope = createMockEnvelope(createMockPayload({
        participant_id: 'participant-1',
        updated_by: 'trainer-1',
        former_status: 'waiting_for_trainer',
        new_status: 'closed',
      }));

      await handleThreadStatusChanged(envelope);

      // Verify TTL is set on all followers
      const pk = `${process.env.STAGE}#THREAD#participant-1#1000#FOLLOW`;
      const result = await dynamodb.executeStatement({
        Statement: `SELECT ttl FROM "${process.env.TABLE_NAME}" WHERE pk = ?`,
        Parameters: [{ S: pk }],
      });
      expect(result.Items).toHaveLength(2);
      for (const item of result.Items ?? []) {
        expect(item.ttl?.N).toBeDefined();
        // TTL should be approximately 2 weeks from now
        const ttlValue = parseInt(item.ttl?.N ?? '0', 10);
        const twoWeeksFromNow = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14;
        expect(ttlValue).toBeGreaterThan(twoWeeksFromNow - 60); // Allow 1 minute tolerance
        expect(ttlValue).toBeLessThan(twoWeeksFromNow + 60);
      }
    });

    it('should handle closing thread with no followers gracefully', async () => {
      const envelope = createMockEnvelope(createMockPayload({
        participant_id: 'participant-1',
        updated_by: 'trainer-1',
        former_status: 'waiting_for_participant',
        new_status: 'closed',
      }));

      await expect(handleThreadStatusChanged(envelope)).resolves.not.toThrow();
    });
  });

  describe('no-op transitions', () => {
    it('should not modify followers for open -> open transitions', async () => {
      const testThreadId = { participantId: 'participant-1', itemId: '1000' };
      await threadFollows.follow(testThreadId, 'existing-user');

      const envelope = createMockEnvelope(createMockPayload({
        participant_id: 'participant-1',
        updated_by: 'trainer-1',
        former_status: 'waiting_for_participant',
        new_status: 'waiting_for_trainer',
      }));

      await handleThreadStatusChanged(envelope);

      // Should still only have the existing user
      const followers = await threadFollows.getFollowers(testThreadId);
      expect(followers).toHaveLength(1);
      expect(followers[0]?.userId).toBe('existing-user');
    });

    it('should not modify followers for closed -> closed transitions', async () => {
      // Note: This transition might not happen in practice but should be handled
      const testThreadId = { participantId: 'participant-1', itemId: '1000' };
      const ttl = Math.floor(Date.now() / 1000) + 3600;
      await threadFollows.follow(testThreadId, 'existing-user', ttl);

      const envelope = createMockEnvelope(createMockPayload({
        participant_id: 'participant-1',
        updated_by: 'trainer-1',
        former_status: 'closed',
        new_status: 'closed',
      }));

      await handleThreadStatusChanged(envelope);

      // Should still only have the existing user with original TTL
      const pk = `${process.env.STAGE}#THREAD#participant-1#1000#FOLLOW`;
      const result = await dynamodb.executeStatement({
        Statement: `SELECT ttl FROM "${process.env.TABLE_NAME}" WHERE pk = ?`,
        Parameters: [{ S: pk }],
      });
      expect(result.Items).toHaveLength(1);
      expect(result.Items?.[0]?.ttl?.N).toBe(String(ttl));
    });
  });
});
