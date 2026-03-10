import { clearTable } from '../testutils/db';

const mockSend = jest.fn();

jest.mock('../websocket-client', () => ({
  ...jest.requireActual('../websocket-client'),
  wsClient: { send: mockSend },
}));

import { handleGradeSaved } from './task-validation-broadcast';
import { GradeSavedPayload } from '../events/grade-saved';
import { EventEnvelope } from '../utils/lambda-eventbus-server';
import { LiveActivitySubscriptions } from '../dbmodels/live-activity-subscriptions';
import { UserConnections } from '../dbmodels/user-connections';
import { docClient } from '../dynamodb';

function createMockPayload(overrides?: Partial<GradeSavedPayload>): GradeSavedPayload {
  return {
    answer_id: 'answer-1',
    participant_id: 'participant-1',
    attempt_id: 'attempt-1',
    item_id: 'item-1',
    validated: true,
    caller_id: 'caller-1',
    score: 100,
    score_improved: true,
    ...overrides,
  };
}

function createMockEnvelope(): EventEnvelope {
  return {
    version: '1.0',
    type: 'grade_saved',
    source_app: 'algoreabackend',
    instance: 'dev',
    time: '2026-01-23T14:36:20.392Z',
    request_id: 'test-request-456',
    payload: {},
  };
}

// Valid base64 connectionIds (first byte must be non-zero for number encoding round-trip)
const connA = 'AQ==';
const connB = 'Ag==';
const connGone = 'BA==';

describe('live-activity handleGradeSaved', () => {
  let liveActivitySubs: LiveActivitySubscriptions;
  let userConnections: UserConnections;

  beforeEach(async () => {
    liveActivitySubs = new LiveActivitySubscriptions(docClient);
    userConnections = new UserConnections(docClient);
    await clearTable();
    jest.clearAllMocks();
    mockSend.mockImplementation((connectionIds) =>
      Promise.resolve(connectionIds.map((id: string) => ({ success: true, connectionId: id }))));
  });

  it('should skip when validated is false', async () => {
    await liveActivitySubs.insert(connA);
    await handleGradeSaved(createMockPayload({ validated: false }), createMockEnvelope());
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should skip when score_improved is false', async () => {
    await liveActivitySubs.insert(connA);
    await handleGradeSaved(createMockPayload({ score_improved: false }), createMockEnvelope());
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should not call send when no subscribers exist', async () => {
    await handleGradeSaved(createMockPayload(), createMockEnvelope());
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should notify all live activity subscribers on validation', async () => {
    await liveActivitySubs.insert(connA);
    await liveActivitySubs.insert(connB);

    const payload = createMockPayload();
    await handleGradeSaved(payload, createMockEnvelope());

    expect(mockSend).toHaveBeenCalledWith(
      expect.arrayContaining([ connA, connB ]),
      expect.objectContaining({
        action: 'liveActivity.validation.new',
        participantId: 'participant-1',
        itemId: 'item-1',
        answerId: 'answer-1',
        time: expect.any(Number),
      })
    );
  });

  it('should clean up gone connections after broadcast', async () => {
    await userConnections.insert(connA, 'user1');
    await userConnections.insert(connGone, 'user2');

    await liveActivitySubs.insert(connA);
    await liveActivitySubs.insert(connGone);

    mockSend.mockImplementation((connectionIds) => Promise.resolve(connectionIds.map((id: string) => {
      if (id === connGone) {
        const error = new Error('Gone');
        error.name = 'GoneException';
        return { success: false, connectionId: id, error };
      }
      return { success: true, connectionId: id };
    })));

    await handleGradeSaved(createMockPayload(), createMockEnvelope());

    const subscribers = await liveActivitySubs.getSubscribers();
    expect(subscribers.map(s => s.connectionId)).not.toContain(connGone);

    const goneUserConns = await userConnections.getAll('user2');
    expect(goneUserConns).toHaveLength(0);
  });
});
