import { EventEnvelope } from '../utils/lambda-eventbus-server';
import { GradeSavedPayload } from '../events/grade-saved';
import { liveActivitySubscriptionsTable } from '../dbmodels/live-activity-subscriptions';
import { LiveActivityMessageAction } from '../ws-messages';
import { broadcastAndCleanup } from '../services/ws-broadcast';

/**
 * Handles the grade_saved event for live activity subscribers.
 * When a participant validates an item with an improved score,
 * broadcasts a validation notification to all live activity subscribers.
 */
export async function handleGradeSaved(payload: GradeSavedPayload, envelope: EventEnvelope): Promise<void> {
  if (!payload.validated || !payload.score_improved) return;

  const time = new Date(envelope.time).getTime();
  const subscribers = await liveActivitySubscriptionsTable.getSubscribers();
  const wsMessage = {
    action: LiveActivityMessageAction.Validation as const,
    participantId: payload.participant_id,
    itemId: payload.item_id,
    answerId: payload.answer_id,
    time,
  };
  await broadcastAndCleanup(subscribers, s => s.connectionId, wsMessage);
}
