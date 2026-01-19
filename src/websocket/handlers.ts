import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { parseWsToken } from './token';

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

  let userId: string;
  try {
    const wsToken = await parseWsToken(token, process.env.BACKEND_PUBLIC_KEY);
    userId = wsToken.userId;
  } catch (err) {
    return { statusCode: 401, body: `Unauthorized: ${String(err)}` };
  }

  // eslint-disable-next-line no-console
  console.log('WebSocket connection established', {
    connectionId,
    sourceIp,
    connectedAt,
    userId,
  });

  // TODO: Implement connection storage (e.g., DynamoDB)
  // - Store connection metadata (connectionId, userId, connectedAt, etc.)

  return { statusCode: 200, body: 'Connected' };
}

/**
 * Handles websocket disconnection events.
 * Called when a client closes the websocket connection.
 */
export function handleDisconnect(event: APIGatewayProxyEvent): APIGatewayProxyResult {
  const connectionId = event.requestContext.connectionId;

  // eslint-disable-next-line no-console
  console.log('WebSocket connection closed', {
    connectionId,
  });

  // TODO: Implement connection cleanup
  // - Remove connection from storage
  // - Clean up any subscriptions associated with this connection
  // - Handle any pending operations

  return { statusCode: 200, body: 'Disconnected' };
}
