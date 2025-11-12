import { DecodingError } from '../utils/errors';
import { Request } from 'lambda-api';
import { importSPKI, jwtVerify } from 'jose';
import * as z from 'zod';
import { ServerError } from '../utils/errors';
import { WsRequest } from '../utils/lambda-ws-server';

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
  if (!publicKeyPem) throw new ServerError('no backend public key found to verify the token');
  const publicKey = await importSPKI(publicKeyPem, 'ES256');
  const { payload } = await jwtVerify(token, publicKey);
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
  const token = headers['authorization'];
  if (!token) throw new DecodingError('no Authorization header found in the headers.');
  if (!token.startsWith('Bearer ')) throw new DecodingError('the Authorization header is not a Bearer token');
  const jws = token.slice(7);
  return parseToken(jws, process.env.BACKEND_PUBLIC_KEY);
}

export async function extractTokenFromWs(body: WsRequest['body']): Promise<ForumToken> {
  const result = z.object({ token: z.string() }).safeParse(body);
  if (!result.success) throw new DecodingError(`unable to fetch the token from the ws message: ${result.error.message}`);
  return parseToken(result.data.token, process.env.BACKEND_PUBLIC_KEY);
}
