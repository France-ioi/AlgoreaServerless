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
import { dynamodb } from '../../dynamodb';
import { ThreadSubscriptions, serializeThreadId } from '../../dbmodels/forum/thread-subscriptions';
import { UserConnections } from '../../dbmodels/user-connections';
import { WsRequest } from '../../utils/lambda-ws-server';
import { extractThreadTokenFromWs } from '../thread-token';

const subscriptions = new ThreadSubscriptions(dynamodb);
const userConnections = new UserConnections(dynamodb);

export async function subscribe(request: WsRequest): Promise<void> {
  const { participantId, itemId, userId } = await extractThreadTokenFromWs(request.body);
  const threadId = { participantId, itemId };
  await subscriptions.subscribe(threadId, request.connectionId(), userId);
  // Store the subscription info in the connection for cleanup on disconnect
  await userConnections.updateConnectionInfo(request.connectionId(), {
    subscribedThreadId: serializeThreadId(threadId),
  });
}
/**
 * Unsubscribe from a thread
 * It is a connection which unsubscribes, not a user, as just stops sending messages to an instance of the application (possibly many)
 */
export async function unsubscribe(request: WsRequest): Promise<void> {
  const token = await extractThreadTokenFromWs(request.body);
  await subscriptions.unsubscribeConnectionId(token, request.connectionId());
  // Clear the subscription info from the connection
  await userConnections.updateConnectionInfo(request.connectionId(), {});
}
