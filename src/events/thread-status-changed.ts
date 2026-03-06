import { z } from 'zod';
import { defineEvent } from '../utils/lambda-eventbus-server';

const threadStatusValues = [ 'waiting_for_participant', 'waiting_for_trainer', 'closed' ] as const;
const formerThreadStatusValues = [ ...threadStatusValues, 'not_started' ] as const;

const threadStatusChangedPayloadSchema = z.object({
  participant_id: z.string(),
  item_id: z.string(),
  new_status: z.enum(threadStatusValues),
  former_status: z.enum(formerThreadStatusValues),
  helper_group_id: z.string(),
  updated_by: z.string(),
});

export type ThreadStatusChangedPayload = z.infer<typeof threadStatusChangedPayloadSchema>;

export const threadStatusChangedEvent = defineEvent('thread_status_changed', threadStatusChangedPayloadSchema);
