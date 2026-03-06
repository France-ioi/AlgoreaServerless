import { z } from 'zod';
import { defineEvent } from '../utils/lambda-eventbus-server';

const gradeSavedPayloadSchema = z.object({
  answer_id: z.string(),
  participant_id: z.string(),
  attempt_id: z.string(),
  item_id: z.string(),
  validated: z.boolean(),
  caller_id: z.string(),
  score: z.number(),
  score_improved: z.boolean(),
});

export type GradeSavedPayload = z.infer<typeof gradeSavedPayloadSchema>;

export const gradeSavedEvent = defineEvent('grade_saved', gradeSavedPayloadSchema);
