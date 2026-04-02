import { handleThreadStatusChanged, ThreadStatusChangedPayload } from './thread-status-changed';
import { ThreadFollows } from '../dbmodels/thread-follows';
import { docClient, dynamodb } from '../../dynamodb';
import { clearTable } from '../../testutils/db';
import { ThreadId } from '../dbmodels/thread';

function createMockPayload(overrides?: Partial<ThreadStatusChangedPayload>): ThreadStatusChangedPayload {
  return {
    participant_id: '3',
    item_id: '1000',
    new_status: 'waiting_for_trainer',
    former_status: 'not_started',
    helper_group_id: '100',
    updated_by: '301',
    ...overrides,
  };
}

describe('handleThreadStatusChanged', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('successful parsing', () => {
    it('should handle events with all required fields without throwing', async () => {
      const payload = createMockPayload();
      await expect(handleThreadStatusChanged(payload)).resolves.not.toThrow();
    });

    it('should handle different status values without throwing', async () => {
      const payload = createMockPayload({
        new_status: 'closed',
        former_status: 'waiting_for_participant',
      });
      await expect(handleThreadStatusChanged(payload)).resolves.not.toThrow();
    });
  });
});

describe('handleThreadStatusChanged - follower behavior', () => {
  let consoleLogSpy: jest.SpyInstance;
  let threadFollows: ThreadFollows;
  const threadId: ThreadId = { participantId: '3', itemId: '1000' };

  beforeEach(async () => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    threadFollows = new ThreadFollows(docClient);
    await clearTable();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('thread opening (not-open -> open)', () => {
    it('should add participant and updater as followers when thread opens', async () => {
      const payload = createMockPayload({
        participant_id: '201',
        updated_by: '301',
        former_status: 'not_started',
        new_status: 'waiting_for_trainer',
      });

      await handleThreadStatusChanged(payload);

      const followers = await threadFollows.getFollowers({ participantId: '201', itemId: '1000' });
      expect(followers.map(f => f.userId).sort()).toEqual([ '201', '301' ]);
    });

    it('should only add participant once when updater is the same as participant', async () => {
      const payload = createMockPayload({
        participant_id: '201',
        updated_by: '201',
        former_status: 'closed',
        new_status: 'waiting_for_participant',
      });

      await handleThreadStatusChanged(payload);

      const followers = await threadFollows.getFollowers({ participantId: '201', itemId: '1000' });
      expect(followers).toHaveLength(1);
      expect(followers[0]?.userId).toBe('201');
    });

    it('should remove TTL from existing followers and not create duplicates', async () => {
      const ttl = Math.floor(Date.now() / 1000) + 3600;
      const testThreadId = { participantId: '201', itemId: '1000' };

      await threadFollows.insert(testThreadId, '201', ttl);
      await threadFollows.insert(testThreadId, '401', ttl);

      const payload = createMockPayload({
        participant_id: '201',
        updated_by: '301',
        former_status: 'not_started',
        new_status: 'waiting_for_trainer',
      });

      await handleThreadStatusChanged(payload);

      const followers = await threadFollows.getFollowers(testThreadId);
      expect(followers.map(f => f.userId).sort()).toEqual([ '201', '301', '401' ]);

      const pk = 'THREAD#201#1000#FOLLOW';
      const result = await dynamodb.executeStatement({
        Statement: `SELECT ttl FROM "${process.env.TABLE_FORUM}" WHERE pk = ?`,
        Parameters: [{ S: pk }],
      });
      for (const item of result.Items ?? []) {
        expect(item.ttl).toBeUndefined();
      }
    });
  });

  describe('thread closing (open -> not-open)', () => {
    it('should set TTL on all followers when thread closes', async () => {
      const testThreadId = { participantId: '201', itemId: '1000' };

      await threadFollows.insert(testThreadId, '100');
      await threadFollows.insert(testThreadId, '200');

      const payload = createMockPayload({
        participant_id: '201',
        updated_by: '301',
        former_status: 'waiting_for_trainer',
        new_status: 'closed',
      });

      await handleThreadStatusChanged(payload);

      const pk = 'THREAD#201#1000#FOLLOW';
      const result = await dynamodb.executeStatement({
        Statement: `SELECT ttl FROM "${process.env.TABLE_FORUM}" WHERE pk = ?`,
        Parameters: [{ S: pk }],
      });
      expect(result.Items).toHaveLength(2);
      for (const item of result.Items ?? []) {
        expect(item.ttl?.N).toBeDefined();
        const ttlValue = parseInt(item.ttl?.N ?? '0', 10);
        const twoWeeksFromNow = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14;
        expect(ttlValue).toBeGreaterThan(twoWeeksFromNow - 60);
        expect(ttlValue).toBeLessThan(twoWeeksFromNow + 60);
      }
    });

    it('should handle closing thread with no followers gracefully', async () => {
      const payload = createMockPayload({
        participant_id: '201',
        updated_by: '301',
        former_status: 'waiting_for_participant',
        new_status: 'closed',
      });

      await expect(handleThreadStatusChanged(payload)).resolves.not.toThrow();
    });
  });

  describe('no-op transitions', () => {
    it('should not modify followers for open -> open transitions', async () => {
      const testThreadId = { participantId: '201', itemId: '1000' };
      await threadFollows.insert(testThreadId, '501');

      const payload = createMockPayload({
        participant_id: '201',
        updated_by: '301',
        former_status: 'waiting_for_participant',
        new_status: 'waiting_for_trainer',
      });

      await handleThreadStatusChanged(payload);

      const followers = await threadFollows.getFollowers(testThreadId);
      expect(followers).toHaveLength(1);
      expect(followers[0]?.userId).toBe('501');
    });

    it('should not modify followers for closed -> closed transitions', async () => {
      const testThreadId = { participantId: '201', itemId: '1000' };
      const ttl = Math.floor(Date.now() / 1000) + 3600;
      await threadFollows.insert(testThreadId, '501', ttl);

      const payload = createMockPayload({
        participant_id: '201',
        updated_by: '301',
        former_status: 'closed',
        new_status: 'closed',
      });

      await handleThreadStatusChanged(payload);

      const pk = 'THREAD#201#1000#FOLLOW';
      const result = await dynamodb.executeStatement({
        Statement: `SELECT ttl FROM "${process.env.TABLE_FORUM}" WHERE pk = ?`,
        Parameters: [{ S: pk }],
      });
      expect(result.Items).toHaveLength(1);
      expect(result.Items?.[0]?.ttl?.N).toBe(String(ttl));
    });
  });
});
