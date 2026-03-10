import { z } from 'zod';
import { defineEvent } from '../utils/lambda-eventbus-server';

const submissionPayloadSchema = z.object({
  answer_id: z.string(),
  attempt_id: z.string(),
  author_id: z.string(),
  item_id: z.string(),
  participant_id: z.string(),
});

export type SubmissionPayload = z.infer<typeof submissionPayloadSchema>;

export const submissionCreatedEvent = defineEvent('submission_created', submissionPayloadSchema);
