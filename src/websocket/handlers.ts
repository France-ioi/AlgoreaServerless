import { APIGatewayProxyEvent } from 'aws-lambda';
import { parseIdentityToken } from '../auth/identity-token';
import { userConnectionsTable } from '../dbmodels/user-connections';
import { WsHandlerResult } from '../utils/lambda-ws-server';
import { cleanupGoneConnection } from '../services/ws-broadcast';

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
  await userConnectionsTable.insert(connectionId, userId);

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

  const { userId } = await cleanupGoneConnection(connectionId);

  if (!userId) {
    // eslint-disable-next-line no-console
    console.warn(`Disconnect: connection ${connectionId} was not found in database (already deleted or TTL expired?)`);
  }

  return { statusCode: 200, body: 'Disconnected', userId };
}
