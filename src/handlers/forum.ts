import type { ALBHandler, ALBResult, APIGatewayProxyHandler } from 'aws-lambda';
import { DecodingError, Forbidden, logError } from '../utils/errors';
import { parseForumHTTPMessage, ForumToken, parseForumWsMessage } from './forum-parse';
import { success, wsOk } from '../utils/responses';
import { subscribe, unsubscribe } from '../services/forum/thread-subscription';
import { createMessage, getAllMessages } from '../services/forum/messages';
import { ConnectionId } from '../websocket-client';
import { ReqBody, ReqQueryParams } from './common';
import { withCors } from './cors';

type WsServiceFct = (connectionId: ConnectionId, token: ForumToken, payload: unknown) => Promise<void>;
type HttpServiceFct = (token: ForumToken, body: ReqBody, queryStringParameters: ReqQueryParams) => Promise<ALBResult>;

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

function forumHttpHandler(serviceFct: HttpServiceFct): ALBHandler {
  return withCors(async event => {
    try {
      const { token, body, queryStringParameters } = await parseForumHTTPMessage(event);
      return await serviceFct(token, body, queryStringParameters);
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const headers = { 'Content-Type': 'application/json' };
      logError(err);
      if (err instanceof DecodingError) return { statusCode: 400, body: JSON.stringify(err), headers };
      if (err instanceof Forbidden) return { statusCode: 403, body: JSON.stringify(err), headers };
      return { statusCode: 500, body: JSON.stringify(err), headers };
    }
  });
}

function successWrapper(next: (token: ForumToken, body: ReqBody, queryStringParameters: ReqQueryParams) => unknown): HttpServiceFct {
  return async (...params) => success(await next(...params));
}

export const threadSubscribe = forumWsHandler(subscribe);
export const threadUnsubscribe = forumWsHandler(unsubscribe);
export const threadMessageCreate = forumHttpHandler(createMessage);
export const threadMessageGetAll = forumHttpHandler(successWrapper(getAllMessages));

