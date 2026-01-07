import { dynamodb } from '../../dynamodb';
import { ThreadSubscriptions } from '../../dbmodels/forum/thread-subscriptions';
import { WsRequest } from '../../utils/lambda-ws-server';
import { extractTokenFromWs } from '../token';

const subscriptions = new ThreadSubscriptions(dynamodb);

export async function subscribe(request: WsRequest): Promise<void> {
  const { participantId, itemId, userId } = await extractTokenFromWs(request.body);
  await subscriptions.subscribe({ participantId, itemId }, request.connectionId(), userId);
}
/**
 * Unsubscribe from a thread
 * It is a connection which unsubscribes, not a user, as just stops sending messages to an instance of the application (possibly many)
 */
export async function unsubscribe(request: WsRequest): Promise<void> {
  const token = await extractTokenFromWs(request.body);
  await subscriptions.unsubscribeConnectionId(token, request.connectionId());
}
