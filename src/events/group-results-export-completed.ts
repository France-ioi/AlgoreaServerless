import { z } from 'zod';
import { defineEvent } from '../utils/lambda-eventbus-server';

const groupResultsExportItemSchema = z.object({
  id: z.string(),
  title: z.string(),
});

const groupResultsExportCompletedBaseSchema = {
  export_id: z.string(),
  token: z.string(),
  user_id: z.string(),
  group_id: z.string(),
  group_name: z.string(),
  items: z.array(groupResultsExportItemSchema),
};

const groupResultsExportCompletedPayloadSchema = z.discriminatedUnion('status', [
  z.object({
    ...groupResultsExportCompletedBaseSchema,
    status: z.literal('success'),
    filename: z.string(),
    size_bytes: z.number(),
    error: z.null(),
  }),
  z.object({
    ...groupResultsExportCompletedBaseSchema,
    status: z.literal('failure'),
    filename: z.null(),
    size_bytes: z.null(),
    error: z.string(),
  }),
]);

export type GroupResultsExportCompletedPayload = z.infer<typeof groupResultsExportCompletedPayloadSchema>;

export const groupResultsExportCompletedEvent = defineEvent(
  'group_results_export_completed',
  groupResultsExportCompletedPayloadSchema,
);
