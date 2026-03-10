import { clearTable } from '../../testutils/db';

const mockSend = jest.fn();

jest.mock('../../websocket-client', () => ({
  ...jest.requireActual('../../websocket-client'),
  wsClient: { send: mockSend },
}));

import { handleSubmissionCreated, SubmissionPayload } from './submission-created';
import { EventEnvelope } from '../../utils/lambda-eventbus-server';
import { ThreadSubscriptions } from '../dbmodels/thread-subscriptions';
import { UserConnections } from '../../dbmodels/user-connections';
import { docClient } from '../../dynamodb';

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

// Valid base64 connectionIds (first byte must be non-zero for number encoding round-trip)
const connA = 'AQ==';
const connB = 'Ag==';
const connC = 'Aw==';
const connGone = 'BA==';

describe('handleSubmissionCreated', () => {
  let threadSubs: ThreadSubscriptions;
  let userConnections: UserConnections;

  const defaultPayload = createMockPayload();
  const threadId = { participantId: defaultPayload.participant_id, itemId: defaultPayload.item_id };

  beforeEach(async () => {
    threadSubs = new ThreadSubscriptions(docClient);
    userConnections = new UserConnections(docClient);
    await clearTable();
    jest.clearAllMocks();
    mockSend.mockImplementation((connectionIds) =>
      Promise.resolve(connectionIds.map((id: string) => ({ success: true, connectionId: id }))));
  });

  describe('successful handling', () => {
    it('should notify all subscribers when submission is created', async () => {
      await threadSubs.insert(threadId, connA, 'user1');
      await threadSubs.insert(threadId, connB, 'user2');

      const payload = createMockPayload();
      const envelope = createMockEnvelope(payload);
      handleSubmissionCreated(payload, envelope);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockSend).toHaveBeenCalledWith(
        expect.arrayContaining([ connA, connB ]),
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
      const payload = createMockPayload();
      const envelope = createMockEnvelope(payload);
      handleSubmissionCreated(payload, envelope);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should handle events with all required fields without throwing', () => {
      const payload = createMockPayload();
      const envelope = createMockEnvelope(payload);
      expect(() => handleSubmissionCreated(payload, envelope)).not.toThrow();
    });
  });

  describe('cleanup of gone connections', () => {
    it('should remove gone subscribers after sending message', async () => {
      await userConnections.insert(connA, 'user1');
      await userConnections.insert(connGone, 'user2');
      await userConnections.insert(connC, 'user3');

      await threadSubs.insert(threadId, connA, 'user1');
      await threadSubs.insert(threadId, connGone, 'user2');
      await threadSubs.insert(threadId, connC, 'user3');

      await userConnections.updateConnectionInfo(connA, { subscriptionThreadId: threadId });
      await userConnections.updateConnectionInfo(connGone, { subscriptionThreadId: threadId });
      await userConnections.updateConnectionInfo(connC, { subscriptionThreadId: threadId });

      mockSend.mockImplementation((connectionIds) => Promise.resolve(connectionIds.map((id: string) => {
        if (id === connGone) {
          const error = new Error('Gone');
          error.name = 'GoneException';
          return { success: false, connectionId: id, error };
        }
        return { success: true, connectionId: id };
      })));

      const payload = createMockPayload();
      const envelope = createMockEnvelope(payload);
      handleSubmissionCreated(payload, envelope);

      await new Promise(resolve => setTimeout(resolve, 200));

      const subscribers = await threadSubs.getSubscribers(threadId);
      expect(subscribers).toHaveLength(2);
      expect(subscribers.map(s => s.connectionId)).not.toContain(connGone);

      const goneUserConns = await userConnections.getAll('user2');
      expect(goneUserConns).toHaveLength(0);
    });
  });
});
