import type { APIGatewayProxyHandler } from 'aws-lambda';
import { logError } from '../utils/errors';
import { ForumToken, parseForumWsMessage } from './forum-parse';
import { wsOk } from '../utils/responses';
import { subscribe, unsubscribe } from '../forum/services/thread-subscription';
import { ConnectionId } from '../websocket-client';

type WsServiceFct = (connectionId: ConnectionId, token: ForumToken, payload: unknown) => Promise<void>;

function forumWsHandler(serviceFct: WsServiceFct): APIGatewayProxyHandler {
  return async event => {
    try {
      const { connectionId, token, payload } = await parseForumWsMessage(event);
      await serviceFct(connectionId, token, payload);
    } catch (err) {
      logError(err);
    }
    return wsOk();
  };
}

export const threadSubscribe = forumWsHandler(subscribe);
export const threadUnsubscribe = forumWsHandler(unsubscribe);

