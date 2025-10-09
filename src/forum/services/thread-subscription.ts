import { dynamodb } from '../../dynamodb';
import { ForumToken } from '../../handlers/forum-parse';
import { ConnectionId } from '../../websocket-client';
import { ThreadSubscriptions } from '../../dbmodels/forum/thread-subscriptions';

const subscriptions = new ThreadSubscriptions(dynamodb);

export async function subscribe(connectionId: ConnectionId, token: ForumToken, _payload: unknown): Promise<void> {
  const { participantId, itemId, userId } = token;
  await subscriptions.subscribe({ participantId, itemId }, connectionId, userId);
}
/**
 * Unsubscribe from a thread
 * It is a connection which unsubscribes, not a user, as just stops sending messages to an instance of the application (possibly many)
 */
export async function unsubscribe(connectionId: ConnectionId, token: ForumToken, _payload: unknown): Promise<void> {
  await subscriptions.unsubscribeConnectionId(token, connectionId);
}
