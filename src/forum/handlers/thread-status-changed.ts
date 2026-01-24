import { z } from 'zod';
import { EventEnvelope } from '../../utils/lambda-eventbus-server';

const threadStatusValues = [ 'waiting_for_participant', 'waiting_for_trainer', 'closed' ] as const;
const formerThreadStatusValues = [ ...threadStatusValues, 'not_started' ] as const;

const threadStatusChangedPayloadSchema = z.object({
  participant_id: z.string(),
  item_id: z.string(),
  new_status: z.enum(threadStatusValues),
  former_status: z.enum(formerThreadStatusValues),
  helper_group_id: z.string(),
});

export type ThreadStatusChangedPayload = z.infer<typeof threadStatusChangedPayloadSchema>;

/**
 * Handles the thread_status_changed event from EventBridge.
 * Triggered when a thread's status changes (e.g., waiting_for_trainer, not_started, etc.).
 */
export function handleThreadStatusChanged(envelope: EventEnvelope): void {
  const parseResult = threadStatusChangedPayloadSchema.safeParse(envelope.payload);

  if (!parseResult.success) {
    // eslint-disable-next-line no-console
    console.error('Failed to parse thread_status_changed payload:', parseResult.error.message);
    return;
  }

  const data = parseResult.data;

  // eslint-disable-next-line no-console
  console.log('Thread status changed:', {
    participantId: data.participant_id,
    itemId: data.item_id,
    newStatus: data.new_status,
    formerStatus: data.former_status,
    helperGroupId: data.helper_group_id,
    instance: envelope.instance,
    requestId: envelope.request_id,
  });
}
