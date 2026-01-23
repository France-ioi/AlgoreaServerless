import { z } from 'zod';
import { EventEnvelope } from '../../utils/lambda-eventbus-server';

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

/**
 * Handles the grade_saved event from EventBridge.
 * Triggered when a grade is saved for an answer.
 */
export function handleGradeSaved(envelope: EventEnvelope): void {
  const parseResult = gradeSavedPayloadSchema.safeParse(envelope.payload);

  if (!parseResult.success) {
    // eslint-disable-next-line no-console
    console.error('Failed to parse grade_saved payload:', parseResult.error.message);
    return;
  }

  const data = parseResult.data;

  // eslint-disable-next-line no-console
  console.log('Grade saved:', {
    answerId: data.answer_id,
    participantId: data.participant_id,
    attemptId: data.attempt_id,
    itemId: data.item_id,
    validated: data.validated,
    callerId: data.caller_id,
    score: data.score,
    instance: envelope.instance,
    requestId: envelope.request_id,
  });
}
