import { EventEnvelope } from '../../utils/lambda-eventbus-server';
import { GradeSavedPayload } from '../../events/grade-saved';
import { threadSubscriptionsTable } from '../dbmodels/thread-subscriptions';
import { ForumMessageAction } from '../ws-messages';
import { broadcastAndCleanup } from '../../services/ws-broadcast';

export { GradeSavedPayload } from '../../events/grade-saved';

/**
 * Handles the grade_saved event from EventBridge.
 * Triggered when a grade is saved for an answer.
 * Notifies all thread subscribers about the grade update.
 */
export async function handleGradeSaved(payload: GradeSavedPayload, envelope: EventEnvelope): Promise<void> {
  const {
    answer_id: answerId,
    participant_id: participantId,
    attempt_id: attemptId,
    item_id: itemId,
    validated,
    score,
    score_improved: scoreImproved,
  } = payload;
  const time = new Date(envelope.time).getTime();
  const threadId = { participantId, itemId };

  const subscribers = await threadSubscriptionsTable.getSubscribers(threadId);
  const wsMessage = {
    action: ForumMessageAction.GradeUpdate as const,
    answerId,
    participantId,
    itemId,
    attemptId,
    score,
    scoreImproved,
    validated,
    time,
  };
  await broadcastAndCleanup(subscribers, s => s.connectionId, wsMessage);
}
