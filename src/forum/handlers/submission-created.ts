import { z } from 'zod';
import { EventEnvelope } from '../../utils/lambda-eventbus-server';
import { ThreadSubscriptions } from '../../dbmodels/forum/thread-subscriptions';
import { dynamodb } from '../../dynamodb';
import { ForumMessageAction, isClosedConnection, logSendResults, wsClient } from '../../websocket-client';

const submissionPayloadSchema = z.object({
  answer_id: z.string(),
  attempt_id: z.string(),
  author_id: z.string(),
  item_id: z.string(),
  participant_id: z.string(),
});

export type SubmissionPayload = z.infer<typeof submissionPayloadSchema>;

const subscriptions = new ThreadSubscriptions(dynamodb);

/**
 * Handles the submission_created event from EventBridge.
 * Notifies all thread subscribers about the new submission.
 */
export function handleSubmissionCreated(envelope: EventEnvelope): void {
  const parseResult = submissionPayloadSchema.safeParse(envelope.payload);

  if (!parseResult.success) {
    // eslint-disable-next-line no-console
    console.error('Failed to parse submission_created payload:', parseResult.error.message);
    return;
  }

  const {
    answer_id: answerId,
    participant_id: participantId,
    item_id: itemId,
    attempt_id: attemptId,
    author_id: authorId,
  } = parseResult.data;
  const time = new Date(envelope.time).getTime();
  const threadId = { participantId, itemId };

  // Notify all subscribers and clean up gone connections
  subscriptions.getSubscribers({ threadId }).then(async subscribers => {
    const wsMessage = {
      action: ForumMessageAction.NewSubmission as const,
      answerId,
      participantId,
      itemId,
      attemptId,
      authorId,
      time,
    };
    const sendResults = await wsClient.send(subscribers.map(s => s.connectionId), wsMessage);
    logSendResults(sendResults);
    const goneSubscribers = sendResults
      .map((res, idx) => ({ ...res, sk: subscribers[idx]!.sk }))
      .filter(isClosedConnection)
      .map(r => r.sk);
    return subscriptions.unsubscribeSet(threadId, goneSubscribers);
  }).catch(err => {
    // eslint-disable-next-line no-console
    console.error('Failed to notify subscribers for submission_created:', err);
  });
}
