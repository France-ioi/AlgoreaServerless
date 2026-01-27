/**
 * Thread Subscription Handlers (WebSocket)
 *
 * Subscriptions are handled via WebSocket (not REST) because they are connection-specific.
 * Unlike "follows" (which are user-level and persist across sessions), a subscription ties
 * a specific WebSocket connection to a thread for real-time updates.
 *
 * This distinction matters because:
 * - A user may have the forum open in multiple browser tabs/windows
 * - Each tab has its own WebSocket connection with a unique connectionId
 * - When a new message arrives, we need to push it to all subscribed connections
 * - The WebSocket connection is the only way to identify which exact frontend instance
 *   should receive live updates
 *
 * In contrast, "follows" (see thread-follow.ts) are user-level and handled via REST because
 * they represent a persistent user preference that doesn't depend on any active connection.
 */
import { threadSubscriptionsTable } from '../dbmodels/thread-subscriptions';
import { userConnectionsTable } from '../../dbmodels/user-connections';
import { WsRequest } from '../../utils/lambda-ws-server';
import { extractThreadTokenFromWs } from '../thread-token';

export async function subscribe(request: WsRequest): Promise<void> {
  const { participantId, itemId, userId } = await extractThreadTokenFromWs(request.body);
  const threadId = { participantId, itemId };
  const subscriptionKeys = await threadSubscriptionsTable.insert(threadId, request.connectionId(), userId);
  // Store the subscription keys in the connection for efficient cleanup on disconnect
  await userConnectionsTable.updateConnectionInfo(request.connectionId(), { subscriptionKeys });
}
/**
 * Unsubscribe from a thread
 * It is a connection which unsubscribes, not a user, as just stops sending messages to an instance of the application (possibly many)
 */
export async function unsubscribe(request: WsRequest): Promise<void> {
  const token = await extractThreadTokenFromWs(request.body);
  await threadSubscriptionsTable.deleteByConnectionId(token, request.connectionId());
  // Clear the subscription info from the connection
  await userConnectionsTable.updateConnectionInfo(request.connectionId(), {});
}
