import { ConnectionId, WsMessage, isClosedConnection, logSendResults, wsClient } from '../websocket-client';
import { userConnectionsTable } from '../dbmodels/user-connections';
import { liveActivitySubscriptionsTable } from '../dbmodels/live-activity-subscriptions';
import { threadSubscriptionsTable } from '../forum/dbmodels/thread-subscriptions';
import { z } from 'zod';
import { dbNumber } from '../dynamodb';

/**
 * Result of a user connection cleanup.
 * Contains the userId if the connection was found and deleted.
 */
export interface CleanupResult {
  userId?: string,
}

/**
 * Result of a broadcast operation.
 * Contains the recipients that successfully received the message.
 */
export interface BroadcastResult<T> {
  successfulRecipients: T[],
}

const subKeysSchema = z.object({ pk: z.string(), sk: dbNumber });

/**
 * Cleans up a gone WebSocket connection by removing:
 * 1. The user connection entry
 * 2. The thread subscription (if any, via stored keys)
 * 3. The live activity subscription (if any, via direct connectionId delete)
 *
 * @param connectionId - The connection to clean up
 * @returns The userId if the connection was found, undefined otherwise
 */
export async function cleanupGoneConnection(connectionId: ConnectionId): Promise<CleanupResult> {
  const connInfo = await userConnectionsTable.delete(connectionId);
  if (!connInfo) return {};

  const threadSubKeys = subKeysSchema.safeParse(connInfo['subscriptionKeys']);
  if (threadSubKeys.success) {
    await threadSubscriptionsTable.deleteByKeys(threadSubKeys.data);
  }

  await liveActivitySubscriptionsTable.deleteByConnectionId(connectionId); // no-op if not subscribed

  return { userId: connInfo.userId };
}

/**
 * Broadcasts a WebSocket message to multiple recipients and cleans up gone connections.
 *
 * This function:
 * 1. Sends the message to all recipients (extracting connectionId from each)
 * 2. Logs the results
 * 3. Cleans up gone connections (both user connection AND thread subscription)
 * 4. Returns the recipients that successfully received the message
 *
 * @param recipients - The recipients to broadcast to (e.g., subscribers, connection IDs)
 * @param getConnectionId - Function to extract connectionId from a recipient
 * @param message - The WebSocket message to send
 * @returns The recipients that successfully received the message
 */
export async function broadcastAndCleanup<T>(
  recipients: T[],
  getConnectionId: (recipient: T) => ConnectionId,
  message: WsMessage
): Promise<BroadcastResult<T>> {
  if (recipients.length === 0) {
    return { successfulRecipients: [] };
  }

  const connectionIds = recipients.map(getConnectionId);
  const sendResults = await wsClient.send(connectionIds, message);
  logSendResults(sendResults);

  const successfulRecipients: T[] = [];
  const goneConnectionIds: ConnectionId[] = [];

  sendResults.forEach((res, idx) => {
    const recipient = recipients[idx]!;
    if (isClosedConnection(res)) {
      goneConnectionIds.push(getConnectionId(recipient));
    } else if (res.success) {
      successfulRecipients.push(recipient);
    }
  });

  // Clean up all gone connections (both user connection and thread subscription)
  await Promise.all(goneConnectionIds.map(cleanupGoneConnection));

  return { successfulRecipients };
}
