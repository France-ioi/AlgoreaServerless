import { clearTable } from '../../testutils/db';

const mockSend = jest.fn();

jest.mock('../../websocket-client', () => ({
  ...jest.requireActual('../../websocket-client'),
  wsClient: { send: mockSend },
}));

import { handleGradeSaved, GradeSavedPayload } from './grade-saved';
import { EventEnvelope } from '../../utils/lambda-eventbus-server';
import { ThreadSubscriptions } from '../dbmodels/thread-subscriptions';
import { UserConnections } from '../../dbmodels/user-connections';
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
    score_improved: true,
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
  let userConnections: UserConnections;

  const defaultPayload = createMockPayload();
  const threadId = { participantId: defaultPayload.participant_id, itemId: defaultPayload.item_id };

  beforeEach(async () => {
    threadSubs = new ThreadSubscriptions(dynamodb);
    userConnections = new UserConnections(dynamodb);
    await clearTable();
    jest.clearAllMocks();
    mockSend.mockImplementation((connectionIds) =>
      Promise.resolve(connectionIds.map((id: string) => ({ success: true, connectionId: id }))));
  });

  describe('successful handling', () => {
    it('should notify all subscribers when grade is saved', async () => {
      await threadSubs.insert(threadId, 'conn-1', 'user1');
      await threadSubs.insert(threadId, 'conn-2', 'user2');

      const payload = createMockPayload();
      const envelope = createMockEnvelope(payload);
      handleGradeSaved(payload, envelope);

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
          scoreImproved: defaultPayload.score_improved,
          validated: defaultPayload.validated,
          time: expect.any(Number),
        })
      );
    });

    it('should not call send when no subscribers exist', async () => {
      const payload = createMockPayload();
      const envelope = createMockEnvelope(payload);
      handleGradeSaved(payload, envelope);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should handle events with all required fields without throwing', () => {
      const payload = createMockPayload();
      const envelope = createMockEnvelope(payload);
      expect(() => handleGradeSaved(payload, envelope)).not.toThrow();
    });

    it('should handle validated=false and partial score', async () => {
      await threadSubs.insert(threadId, 'conn-1', 'user1');

      const payload = createMockPayload({
        validated: false,
        score: 50,
        score_improved: false,
      });
      const envelope = createMockEnvelope(payload);
      handleGradeSaved(payload, envelope);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockSend).toHaveBeenCalledWith(
        [ 'conn-1' ],
        expect.objectContaining({
          validated: false,
          score: 50,
          scoreImproved: false,
        })
      );
    });

    it('should handle zero score', async () => {
      await threadSubs.insert(threadId, 'conn-1', 'user1');

      const payload = createMockPayload({
        validated: false,
        score: 0,
      });
      const envelope = createMockEnvelope(payload);
      handleGradeSaved(payload, envelope);

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
      await userConnections.insert('conn-1', 'user1');
      await userConnections.insert('conn-gone', 'user2');
      await userConnections.insert('conn-3', 'user3');

      const subKeys1 = await threadSubs.insert(threadId, 'conn-1', 'user1');
      const subKeysGone = await threadSubs.insert(threadId, 'conn-gone', 'user2');
      const subKeys3 = await threadSubs.insert(threadId, 'conn-3', 'user3');

      await userConnections.updateConnectionInfo('conn-1', { subscriptionKeys: subKeys1 });
      await userConnections.updateConnectionInfo('conn-gone', { subscriptionKeys: subKeysGone });
      await userConnections.updateConnectionInfo('conn-3', { subscriptionKeys: subKeys3 });

      mockSend.mockImplementation((connectionIds) => Promise.resolve(connectionIds.map((id: string) => {
        if (id === 'conn-gone') {
          const error = new Error('Gone');
          error.name = 'GoneException';
          return { success: false, connectionId: id, error };
        }
        return { success: true, connectionId: id };
      })));

      const payload = createMockPayload();
      const envelope = createMockEnvelope(payload);
      handleGradeSaved(payload, envelope);

      await new Promise(resolve => setTimeout(resolve, 200));

      const subscribers = await threadSubs.getSubscribers({ threadId });
      expect(subscribers).toHaveLength(2);
      expect(subscribers.map(s => s.connectionId)).not.toContain('conn-gone');

      const goneUserConns = await userConnections.getAll('user2');
      expect(goneUserConns).toHaveLength(0);
    });
  });
});
