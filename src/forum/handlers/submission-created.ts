import { EventEnvelope } from '../../utils/lambda-eventbus-server';
import { SubmissionPayload } from '../../events/submission-created';
import { threadSubscriptionsTable } from '../dbmodels/thread-subscriptions';
import { ForumMessageAction } from '../ws-messages';
import { broadcastAndCleanup } from '../../services/ws-broadcast';

export { SubmissionPayload } from '../../events/submission-created';

/**
 * Handles the submission_created event from EventBridge.
 * Notifies all thread subscribers about the new submission.
 */
export async function handleSubmissionCreated(payload: SubmissionPayload, envelope: EventEnvelope): Promise<void> {
  const {
    answer_id: answerId,
    participant_id: participantId,
    item_id: itemId,
    attempt_id: attemptId,
    author_id: authorId,
  } = payload;
  const time = new Date(envelope.time).getTime();
  const threadId = { participantId, itemId };

  const subscribers = await threadSubscriptionsTable.getSubscribers(threadId);
  const wsMessage = {
    action: ForumMessageAction.NewSubmission as const,
    answerId,
    participantId,
    itemId,
    attemptId,
    authorId,
    time,
  };
  await broadcastAndCleanup(subscribers, s => s.connectionId, wsMessage);
}
