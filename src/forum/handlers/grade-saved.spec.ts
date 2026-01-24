import { clearTable } from '../../testutils/db';

const mockSend = jest.fn();

jest.mock('../../websocket-client', () => ({
  ...jest.requireActual('../../websocket-client'),
  wsClient: { send: mockSend },
}));

import { handleGradeSaved, GradeSavedPayload } from './grade-saved';
import { EventEnvelope } from '../../utils/lambda-eventbus-server';
import { ThreadSubscriptions } from '../../dbmodels/forum/thread-subscriptions';
import { dynamodb } from '../../dynamodb';

function createMockPayload(overrides?: Partial<GradeSavedPayload>): GradeSavedPayload {
  return {
    answer_id: '123',
    participant_id: '101',
    attempt_id: '0',
    item_id: '50',
    validated: true,
    caller_id: '101',
    score: 100,
    ...overrides,
  };
}

function createMockEnvelope(payload: unknown = createMockPayload()): EventEnvelope {
  return {
    version: '1.0',
    type: 'grade_saved',
    source_app: 'algoreabackend',
    instance: 'dev',
    time: '2026-01-23T14:36:20.392285135Z',
    request_id: 'test-request-456',
    payload,
  };
}

describe('handleGradeSaved', () => {
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
    it('should notify all subscribers when grade is saved', async () => {
      await threadSubs.subscribe(threadId, 'conn-1', 'user1');
      await threadSubs.subscribe(threadId, 'conn-2', 'user2');

      const envelope = createMockEnvelope();
      handleGradeSaved(envelope);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockSend).toHaveBeenCalledWith(
        expect.arrayContaining([ 'conn-1', 'conn-2' ]),
        expect.objectContaining({
          action: 'forum.grade.update',
          answerId: defaultPayload.answer_id,
          participantId: defaultPayload.participant_id,
          itemId: defaultPayload.item_id,
          attemptId: defaultPayload.attempt_id,
          score: defaultPayload.score,
          validated: defaultPayload.validated,
          time: expect.any(Number),
        })
      );
    });

    it('should not call send when no subscribers exist', async () => {
      const envelope = createMockEnvelope();
      handleGradeSaved(envelope);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockSend).toHaveBeenCalledWith([], expect.any(Object));
    });

    it('should handle events with all required fields without throwing', () => {
      const envelope = createMockEnvelope();
      expect(() => handleGradeSaved(envelope)).not.toThrow();
    });

    it('should handle validated=false and partial score', async () => {
      await threadSubs.subscribe(threadId, 'conn-1', 'user1');

      const envelope = createMockEnvelope(createMockPayload({
        validated: false,
        score: 50,
      }));
      handleGradeSaved(envelope);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockSend).toHaveBeenCalledWith(
        [ 'conn-1' ],
        expect.objectContaining({
          validated: false,
          score: 50,
        })
      );
    });

    it('should handle zero score', async () => {
      await threadSubs.subscribe(threadId, 'conn-1', 'user1');

      const envelope = createMockEnvelope(createMockPayload({
        validated: false,
        score: 0,
      }));
      handleGradeSaved(envelope);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockSend).toHaveBeenCalledWith(
        [ 'conn-1' ],
        expect.objectContaining({
          score: 0,
        })
      );
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
      handleGradeSaved(envelope);

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

      handleGradeSaved(envelope);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to parse grade_saved payload:',
        expect.any(String)
      );
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should log error for wrong type on validated field', () => {
      const envelope = createMockEnvelope({
        ...createMockPayload(),
        validated: 'true', // should be boolean
      });

      handleGradeSaved(envelope);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should log error for wrong type on score field', () => {
      const envelope = createMockEnvelope({
        ...createMockPayload(),
        score: '100', // should be number
      });

      handleGradeSaved(envelope);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should log error for null payload', () => {
      const envelope = createMockEnvelope(null);

      handleGradeSaved(envelope);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});
