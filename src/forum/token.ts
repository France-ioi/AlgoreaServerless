import { AuthenticationError } from '../utils/errors';
import { Request } from 'lambda-api';
import * as z from 'zod';
import { WsRequest } from '../utils/lambda-ws-server';
import { verifyJwt, extractBearerToken } from '../auth/jwt';

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

export async function parseToken(token: string, publicKeyPem?: string): Promise<ForumToken> {
  const payload = await verifyJwt(token, publicKeyPem);
  const decodedPayload = jwsPayloadSchema.parse(payload);
  return {
    participantId: decodedPayload.participant_id,
    itemId: decodedPayload.item_id,
    userId: decodedPayload.user_id,
    isMine: decodedPayload.is_mine,
    canWatch: decodedPayload.can_watch,
    canWrite: decodedPayload.can_write,
  };
}

export async function extractTokenFromHttp(headers: Request['headers']): Promise<ForumToken> {
  const jws = extractBearerToken(headers['authorization']);
  return parseToken(jws, process.env.BACKEND_PUBLIC_KEY);
}

export async function extractTokenFromWs(body: WsRequest['body']): Promise<ForumToken> {
  const result = z.object({ token: z.string() }).safeParse(body);
  if (!result.success) throw new AuthenticationError(`unable to fetch the token from the ws message: ${result.error.message}`);
  return parseToken(result.data.token, process.env.BACKEND_PUBLIC_KEY);
}
