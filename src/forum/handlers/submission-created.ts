import { z } from 'zod';
import { EventEnvelope } from '../../utils/lambda-eventbus-server';

const submissionPayloadSchema = z.object({
  answer_id: z.string(),
  attempt_id: z.string(),
  author_id: z.string(),
  item_id: z.string(),
  participant_id: z.string(),
});

export type SubmissionPayload = z.infer<typeof submissionPayloadSchema>;

/**
 * Handles the submission_created event from EventBridge.
 * Receives the full event envelope (parsed by EventBusServer).
 * Currently logs the event details for debugging purposes.
 */
export function handleSubmissionCreated(envelope: EventEnvelope): void {
  const parseResult = submissionPayloadSchema.safeParse(envelope.payload);

  if (!parseResult.success) {
    // eslint-disable-next-line no-console
    console.error('Failed to parse submission_created payload:', parseResult.error.message);
    return;
  }

  const data = parseResult.data;

  // eslint-disable-next-line no-console
  console.log('Submission created:', {
    answerId: data.answer_id,
    attemptId: data.attempt_id,
    authorId: data.author_id,
    itemId: data.item_id,
    participantId: data.participant_id,
    instance: envelope.instance,
    requestId: envelope.request_id,
  });
}
