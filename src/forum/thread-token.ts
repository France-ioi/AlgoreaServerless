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

export interface ThreadToken {
  participantId: string,
  itemId: string,
  userId: string,
  isMine: boolean,
  canWatch: boolean,
  canWrite: boolean,
}

export async function parseThreadToken(token: string, publicKeyPem?: string): Promise<ThreadToken> {
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

export async function extractThreadTokenFromHttp(headers: Request['headers']): Promise<ThreadToken> {
  const jws = extractBearerToken(headers['authorization']);
  return parseThreadToken(jws, process.env.BACKEND_PUBLIC_KEY);
}

export async function extractThreadTokenFromWs(body: WsRequest['body']): Promise<ThreadToken> {
  const result = z.object({ token: z.string() }).safeParse(body);
  if (!result.success) throw new AuthenticationError(`unable to fetch the token from the ws message: ${result.error.message}`);
  return parseThreadToken(result.data.token, process.env.BACKEND_PUBLIC_KEY);
}
