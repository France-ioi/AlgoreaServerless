import { z } from 'zod';
import { EventEnvelope } from '../../utils/lambda-eventbus-server';
import { ThreadSubscriptions } from '../../dbmodels/forum/thread-subscriptions';
import { dynamodb } from '../../dynamodb';
import { isClosedConnection, logSendResults, wsClient } from '../../websocket-client';
import { ForumMessageAction } from '../ws-messages';

const gradeSavedPayloadSchema = z.object({
  answer_id: z.string(),
  participant_id: z.string(),
  attempt_id: z.string(),
  item_id: z.string(),
  validated: z.boolean(),
  caller_id: z.string(),
  score: z.number(),
});

export type GradeSavedPayload = z.infer<typeof gradeSavedPayloadSchema>;

const subscriptions = new ThreadSubscriptions(dynamodb);

/**
 * Handles the grade_saved event from EventBridge.
 * Triggered when a grade is saved for an answer.
 * Notifies all thread subscribers about the grade update.
 */
export function handleGradeSaved(envelope: EventEnvelope): void {
  const parseResult = gradeSavedPayloadSchema.safeParse(envelope.payload);

  if (!parseResult.success) {
    // eslint-disable-next-line no-console
    console.error('Failed to parse grade_saved payload:', parseResult.error.message);
    return;
  }

  const {
    answer_id: answerId,
    participant_id: participantId,
    attempt_id: attemptId,
    item_id: itemId,
    validated,
    score,
  } = parseResult.data;
  const time = new Date(envelope.time).getTime();
  const threadId = { participantId, itemId };

  // Notify all subscribers and clean up gone connections
  subscriptions.getSubscribers({ threadId }).then(async subscribers => {
    const wsMessage = {
      action: ForumMessageAction.GradeUpdate as const,
      answerId,
      participantId,
      itemId,
      attemptId,
      score,
      validated,
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
    console.error('Failed to notify subscribers for grade_saved:', err);
  });
}
