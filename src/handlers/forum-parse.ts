import type { ALBEvent, APIGatewayProxyEvent } from 'aws-lambda';
import { compactVerify, importSPKI } from 'jose';
import { toUtf8 } from '@smithy/util-utf8';
import * as z from 'zod';
import { DecodingError, ServerError } from '../utils/errors';
import { ConnectionId } from '../websocket-client';
import { ReqBody, ReqQueryParams } from './common';

const jwsPayloadSchema = z.object({
  item_id: z.string(),
  participant_id: z.string(),
  user_id: z.string(),
  is_mine: z.boolean(),
  can_watch: z.boolean(),
  can_write: z.boolean(),
});

export interface ForumToken {
  participantId: string,
  itemId: string,
  userId: string,
  isMine: boolean,
  canWatch: boolean,
  canWrite: boolean,
}

function getWSPayload(event: APIGatewayProxyEvent): unknown {
  try {
    if (!event.body) throw new DecodingError('null body in the event');
    return JSON.parse(event.body) as unknown;
  } catch {
    throw new DecodingError('the body is not valid JSON');
  }
}

async function parseToken(token: string): Promise<ForumToken> {
  if (!process.env.BACKEND_PUBLIC_KEY) throw new ServerError('no backend public key found to verify the token');
  const publicKey = await importSPKI(process.env.BACKEND_PUBLIC_KEY, 'ES256');
  const res = await compactVerify(token, publicKey);
  const verifiedPayload = JSON.parse(toUtf8(res.payload)) as unknown;
  const decodedPayload = jwsPayloadSchema.parse(verifiedPayload);
  return {
    participantId: decodedPayload.participant_id,
    itemId: decodedPayload.item_id,
    userId: decodedPayload.user_id,
    isMine: decodedPayload.is_mine,
    canWatch: decodedPayload.can_watch,
    canWrite: decodedPayload.can_write,
  };
}

export async function parseForumWsMessage(event: APIGatewayProxyEvent):
  Promise<{ connectionId: ConnectionId, token: ForumToken, payload: unknown }> {
  const payload = getWSPayload(event);
  if (
    typeof payload !== 'object' ||
    !payload ||
    !('token' in payload) ||
    typeof payload.token !== 'string'
  ) throw new DecodingError('no token found in the payload');
  const jws = payload.token;
  const connectionId = event.requestContext.connectionId;
  if (!connectionId) throw new DecodingError('no connectionId found in the WS event');
  return { token: await parseToken(jws), connectionId, payload };
}

export async function parseForumHTTPMessage(event: ALBEvent):
  Promise<{ token: ForumToken, body: ReqBody, queryStringParameters: ReqQueryParams }> {
  const headers = event.headers;
  if (!headers) throw new DecodingError('no headers found in the event');
  const token = headers['authorization'];
  if (!token) throw new DecodingError('no Authorization header found in the headers.');
  if (!token.startsWith('Bearer ')) throw new DecodingError('the Authorization header is not a Bearer token');
  const jws = token.slice(7);
  return { token: await parseToken(jws), body: event.body, queryStringParameters: event.queryStringParameters };
}
