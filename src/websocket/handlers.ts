import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { parseWsToken } from './token';
import { UserConnections } from '../dbmodels/user-connections';
import { dynamodb } from '../dynamodb';

/**
 * Handles websocket connection events.
 * Called when a client establishes a websocket connection.
 */
export async function handleConnect(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const connectionId = event.requestContext.connectionId;
  const sourceIp = event.requestContext.identity?.sourceIp;
  const connectedAt = event.requestContext.connectedAt;
  const token = event.queryStringParameters?.token;

  if (!token) {
    return { statusCode: 401, body: 'Unauthorized: missing token' };
  }

  if (!connectionId) {
    return { statusCode: 500, body: 'Internal error: missing connectionId' };
  }

  let userId: string;
  try {
    const wsToken = await parseWsToken(token, process.env.BACKEND_PUBLIC_KEY);
    userId = wsToken.userId;
  } catch (err) {
    return { statusCode: 401, body: `Unauthorized: ${String(err)}` };
  }

  // Store connection in database
  const userConnections = new UserConnections(dynamodb);
  await userConnections.insert(connectionId, userId);

  // eslint-disable-next-line no-console
  console.log('WebSocket connection established', {
    connectionId,
    sourceIp,
    connectedAt,
    userId,
  });

  return { statusCode: 200, body: 'Connected' };
}

/**
 * Handles websocket disconnection events.
 * Called when a client closes the websocket connection.
 */
export async function handleDisconnect(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const connectionId = event.requestContext.connectionId;

  if (!connectionId) {
    return { statusCode: 500, body: 'Internal error: missing connectionId' };
  }

  // Remove connection from database
  const userConnections = new UserConnections(dynamodb);
  await userConnections.delete(connectionId);

  // eslint-disable-next-line no-console
  console.log('WebSocket connection closed', {
    connectionId,
  });

  // TODO: Clean up any subscriptions associated with this connection

  return { statusCode: 200, body: 'Disconnected' };
}
