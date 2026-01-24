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
