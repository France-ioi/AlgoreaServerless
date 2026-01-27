import { z } from 'zod';
import { EventEnvelope } from '../../utils/lambda-eventbus-server';
import { threadFollowsTable, threadFollowTtlAfterClose } from '../../dbmodels/forum/thread-follows';

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

type ThreadStatus = typeof threadStatusValues[number] | typeof formerThreadStatusValues[number];

/**
 * Returns true if the status represents an "open" thread (active help request).
 */
function isOpen(status: ThreadStatus): boolean {
  return status === 'waiting_for_participant' || status === 'waiting_for_trainer';
}

/**
 * Handles the thread_status_changed event from EventBridge.
 * Triggered when a thread's status changes (e.g., waiting_for_trainer, not_started, etc.).
 *
 * When a thread opens (not_started/closed -> waiting_for_*):
 * - Removes TTL from existing followers
 * - Adds participant and updater as followers (if not already following)
 *
 * When a thread closes (waiting_for_* -> closed/not_started):
 * - Sets a 2-week TTL on all followers for automatic cleanup
 */
export async function handleThreadStatusChanged(envelope: EventEnvelope): Promise<void> {
  const parseResult = threadStatusChangedPayloadSchema.safeParse(envelope.payload);

  if (!parseResult.success) {
    // eslint-disable-next-line no-console
    console.error('Failed to parse thread_status_changed payload:', parseResult.error.message);
    return;
  }

  const data = parseResult.data;
  const threadId = { participantId: data.participant_id, itemId: data.item_id };

  const wasOpen = isOpen(data.former_status);
  const isNowOpen = isOpen(data.new_status);

  if (!wasOpen && isNowOpen) {
    // Thread opened: remove TTL and get existing followers
    const existingFollowerIds = await threadFollowsTable.removeTtlForAllFollowers(threadId);

    // Add participant if not already following
    if (!existingFollowerIds.includes(data.participant_id)) {
      await threadFollowsTable.follow(threadId, data.participant_id);
    }
    // Add updater if different from participant and not already following
    if (data.updated_by !== data.participant_id && !existingFollowerIds.includes(data.updated_by)) {
      await threadFollowsTable.follow(threadId, data.updated_by);
    }
  } else if (wasOpen && !isNowOpen) {
    // Thread closed: add 2-week TTL
    await threadFollowsTable.setTtlForAllFollowers(threadId, threadFollowTtlAfterClose());
  }
}
