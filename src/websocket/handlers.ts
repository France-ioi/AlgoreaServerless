import { APIGatewayProxyEvent } from 'aws-lambda';
import { parseIdentityToken } from '../auth/identity-token';
import { UserConnections } from '../dbmodels/user-connections';
import { ThreadSubscriptions } from '../dbmodels/forum/thread-subscriptions';
import { dynamodb } from '../dynamodb';
import { WsHandlerResult } from '../utils/lambda-ws-server';

/**
 * Handles websocket connection events.
 * Called when a client establishes a websocket connection.
 */
export async function handleConnect(event: APIGatewayProxyEvent): Promise<WsHandlerResult> {
  const connectionId = event.requestContext.connectionId;
  const token = event.queryStringParameters?.token;

  if (!token) {
    return { statusCode: 401, body: 'Unauthorized: missing token' };
  }

  if (!connectionId) {
    return { statusCode: 500, body: 'Internal error: missing connectionId' };
  }

  let userId: string;
  try {
    const identityToken = await parseIdentityToken(token, process.env.BACKEND_PUBLIC_KEY);
    userId = identityToken.userId;
  } catch (err) {
    return { statusCode: 401, body: `Unauthorized: ${String(err)}` };
  }

  // Store connection in database
  const userConnections = new UserConnections(dynamodb);
  await userConnections.insert(connectionId, userId);

  return { statusCode: 200, body: 'Connected', userId };
}

/**
 * Handles websocket disconnection events.
 * Called when a client closes the websocket connection.
 */
export async function handleDisconnect(event: APIGatewayProxyEvent): Promise<WsHandlerResult> {
  const connectionId = event.requestContext.connectionId;

  if (!connectionId) {
    return { statusCode: 500, body: 'Internal error: missing connectionId' };
  }

  // Remove connection from database
  const userConnections = new UserConnections(dynamodb);
  const deleted = await userConnections.delete(connectionId);

  if (!deleted) {
    // eslint-disable-next-line no-console
    console.warn(`Disconnect: connection ${connectionId} was not found in database (already deleted or TTL expired?)`);
  }

  // Clean up thread subscription if the connection was subscribed to a thread
  if (deleted?.subscriptionKeys) {
    const threadSubscriptions = new ThreadSubscriptions(dynamodb);
    await threadSubscriptions.unsubscribeByKeys(deleted.subscriptionKeys);
  }

  return { statusCode: 200, body: 'Disconnected', userId: deleted?.userId };
}
