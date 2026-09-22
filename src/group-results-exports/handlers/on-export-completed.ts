import { EventEnvelope } from '../../utils/lambda-eventbus-server';
import { GroupResultsExportCompletedPayload } from '../../events/group-results-export-completed';
import { parseGroupResultsTokenSignatureOnly } from '../token';
import { notifyUser } from '../../services/notify-user';
import { logError } from '../../utils/errors';
import { EXPORT_AVAILABILITY_MS } from '../constants';

/**
 * Handles group_results_export_completed from the backend worker.
 * Verifies the token signature (not exp) and notifies the authorized user.
 * Token claims are authoritative for user_id/group_id/item_ids; group_name/titles are display data.
 */
export async function handleExportCompleted(
  payload: GroupResultsExportCompletedPayload,
  _envelope: EventEnvelope,
): Promise<void> {
  let token;
  try {
    token = await parseGroupResultsTokenSignatureOnly(payload.token, process.env.BACKEND_PUBLIC_KEY);
  } catch (err) {
    logError(err);
    // eslint-disable-next-line no-console
    console.error('group_results_export_completed: invalid token, skipping notify', {
      export_id: payload.export_id,
    });
    return;
  }

  const displayItems = payload.items;
  const groupName = payload.group_name;

  if (payload.status === 'success') {
    await notifyUser(token.userId, {
      notificationType: 'group_results_export.ready',
      payload: {
        exportId: payload.export_id,
        groupId: token.groupId,
        groupName,
        items: displayItems,
        filename: payload.filename,
        sizeBytes: payload.size_bytes,
        expiresAt: Date.now() + EXPORT_AVAILABILITY_MS,
      },
    });
    return;
  }

  await notifyUser(token.userId, {
    notificationType: 'group_results_export.failed',
    payload: {
      exportId: payload.export_id,
      groupId: token.groupId,
      groupName,
      items: displayItems,
      error: payload.error,
    },
  });
}
