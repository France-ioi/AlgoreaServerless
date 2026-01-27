import { ConnectionId, WsMessage, isClosedConnection, logSendResults, wsClient } from '../websocket-client';
import { UserConnections } from '../dbmodels/user-connections';
import { ThreadSubscriptions } from '../dbmodels/forum/thread-subscriptions';

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

/**
 * Cleans up a gone WebSocket connection by removing both:
 * 1. The user connection entry
 * 2. The thread subscription (if any)
 *
 * This is the single cleanup function used for all gone connection scenarios.
 * Even when subscription keys are already known by the caller, this function
 * doesn't benefit from them because userConnections.delete() must read the
 * connection entry anyway (to get userId and creationTime), and that read
 * returns subscriptionKeys for free.
 *
 * @param connectionId - The connection to clean up
 * @param userConnections - The UserConnections table instance
 * @param subscriptions - The ThreadSubscriptions table instance
 * @returns The userId if the connection was found, undefined otherwise
 */
export async function cleanupGoneConnection(
  connectionId: ConnectionId,
  userConnections: UserConnections,
  subscriptions: ThreadSubscriptions
): Promise<CleanupResult> {
  const connInfo = await userConnections.delete(connectionId);

  if (connInfo?.subscriptionKeys) {
    await subscriptions.unsubscribeByKeys(connInfo.subscriptionKeys);
  }

  return { userId: connInfo?.userId };
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
 * @param userConnections - The UserConnections table instance
 * @param subscriptions - The ThreadSubscriptions table instance
 * @returns The recipients that successfully received the message
 */
export async function broadcastAndCleanup<T>(
  recipients: T[],
  getConnectionId: (recipient: T) => ConnectionId,
  message: WsMessage,
  userConnections: UserConnections,
  subscriptions: ThreadSubscriptions
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
  await Promise.all(
    goneConnectionIds.map(connId => cleanupGoneConnection(connId, userConnections, subscriptions))
  );

  return { successfulRecipients };
}
