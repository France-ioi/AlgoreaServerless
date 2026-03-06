import { ThreadStatusChangedPayload } from '../../events/thread-status-changed';
import { threadFollowsTable, threadFollowTtlAfterClose } from '../dbmodels/thread-follows';

export { ThreadStatusChangedPayload } from '../../events/thread-status-changed';

type ThreadStatus = ThreadStatusChangedPayload['new_status'] | ThreadStatusChangedPayload['former_status'];

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
export async function handleThreadStatusChanged(payload: ThreadStatusChangedPayload): Promise<void> {
  const threadId = { participantId: payload.participant_id, itemId: payload.item_id };

  const wasOpen = isOpen(payload.former_status);
  const isNowOpen = isOpen(payload.new_status);

  if (!wasOpen && isNowOpen) {
    const existingFollowerIds = await threadFollowsTable.removeTtlForAllFollowers(threadId);

    if (!existingFollowerIds.includes(payload.participant_id)) {
      await threadFollowsTable.insert(threadId, payload.participant_id);
    }
    if (payload.updated_by !== payload.participant_id && !existingFollowerIds.includes(payload.updated_by)) {
      await threadFollowsTable.insert(threadId, payload.updated_by);
    }
  } else if (wasOpen && !isNowOpen) {
    await threadFollowsTable.setTtlForAllFollowers(threadId, threadFollowTtlAfterClose());
  }
}
