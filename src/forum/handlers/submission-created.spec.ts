import { clearTable } from '../../testutils/db';

const mockSend = jest.fn();

jest.mock('../../websocket-client', () => ({
  ...jest.requireActual('../../websocket-client'),
  wsClient: { send: mockSend },
}));

import { handleSubmissionCreated, SubmissionPayload } from './submission-created';
import { EventEnvelope } from '../../utils/lambda-eventbus-server';
import { ThreadSubscriptions } from '../../dbmodels/forum/thread-subscriptions';
import { dynamodb } from '../../dynamodb';

function createMockPayload(overrides?: Partial<SubmissionPayload>): SubmissionPayload {
  return {
    answer_id: '2370069782874587543',
    attempt_id: '0',
    author_id: '4830897401562438517',
    item_id: '6379723280369399253',
    participant_id: '4830897401562438517',
    ...overrides,
  };
}

function createMockEnvelope(payload: unknown = createMockPayload()): EventEnvelope {
  return {
    version: '1.0',
    type: 'submission_created',
    source_app: 'algoreabackend',
    instance: 'dev',
    time: '2026-01-23T14:36:20.392285135Z',
    request_id: '169.254.80.227/DB0MBqcJM6-000006',
    payload,
  };
}

describe('handleSubmissionCreated', () => {
  let threadSubs: ThreadSubscriptions;
  let consoleErrorSpy: jest.SpyInstance;

  const defaultPayload = createMockPayload();
  const threadId = { participantId: defaultPayload.participant_id, itemId: defaultPayload.item_id };

  beforeEach(async () => {
    threadSubs = new ThreadSubscriptions(dynamodb);
    await clearTable();
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    mockSend.mockImplementation((connectionIds) =>
      Promise.resolve(connectionIds.map((id: string) => ({ success: true, connectionId: id }))));
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('successful handling', () => {
    it('should notify all subscribers when submission is created', async () => {
      await threadSubs.subscribe(threadId, 'conn-1', 'user1');
      await threadSubs.subscribe(threadId, 'conn-2', 'user2');

      const envelope = createMockEnvelope();
      handleSubmissionCreated(envelope);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockSend).toHaveBeenCalledWith(
        expect.arrayContaining([ 'conn-1', 'conn-2' ]),
        expect.objectContaining({
          action: 'forum.submission.new',
          answerId: defaultPayload.answer_id,
          participantId: defaultPayload.participant_id,
          itemId: defaultPayload.item_id,
          attemptId: defaultPayload.attempt_id,
          authorId: defaultPayload.author_id,
          time: expect.any(Number),
        })
      );
    });

    it('should not call send when no subscribers exist', async () => {
      const envelope = createMockEnvelope();
      handleSubmissionCreated(envelope);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockSend).toHaveBeenCalledWith([], expect.any(Object));
    });

    it('should handle events with all required fields without throwing', () => {
      const envelope = createMockEnvelope();
      expect(() => handleSubmissionCreated(envelope)).not.toThrow();
    });
  });

  describe('cleanup of gone connections', () => {
    it('should remove gone subscribers after sending message', async () => {
      await threadSubs.subscribe(threadId, 'conn-1', 'user1');
      await threadSubs.subscribe(threadId, 'conn-gone', 'user2');
      await threadSubs.subscribe(threadId, 'conn-3', 'user3');

      mockSend.mockImplementation((connectionIds) => Promise.resolve(connectionIds.map((id: string) => {
        if (id === 'conn-gone') {
          const error = new Error('Gone');
          error.name = 'GoneException';
          return { success: false, connectionId: id, error };
        }
        return { success: true, connectionId: id };
      })));

      const envelope = createMockEnvelope();
      handleSubmissionCreated(envelope);

      // Wait for async operations and cleanup
      await new Promise(resolve => setTimeout(resolve, 200));

      const subscribers = await threadSubs.getSubscribers({ threadId });
      expect(subscribers).toHaveLength(2);
      expect(subscribers.map(s => s.connectionId)).not.toContain('conn-gone');
    });
  });

  describe('invalid payload handling', () => {
    it('should log error for missing required fields', () => {
      const envelope = createMockEnvelope({
        answer_id: '123',
        // missing other required fields
      });

      handleSubmissionCreated(envelope);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to parse submission_created payload:',
        expect.any(String)
      );
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should log error for completely invalid payload', () => {
      const envelope = createMockEnvelope('not an object');

      handleSubmissionCreated(envelope);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should log error for null payload', () => {
      const envelope = createMockEnvelope(null);

      handleSubmissionCreated(envelope);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});
