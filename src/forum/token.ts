import { DecodingError } from '../utils/errors';
import { Request } from 'lambda-api';
import { compactVerify, importSPKI } from 'jose';
import { toUtf8 } from '@smithy/util-utf8';
import * as z from 'zod';
import { ServerError } from '../utils/errors';
import { WsRequest } from '../utils/lambda-ws-server';
import { epochDate } from '../utils/ts-decoder';

const jwsPayloadSchema = z.object({
  item_id: z.string(),
  participant_id: z.string(),
  user_id: z.string(),
  is_mine: z.boolean(),
  can_watch: z.boolean(),
  can_write: z.boolean(),
  exp: epochDate,
});

export interface ForumToken {
  participantId: string,
  itemId: string,
  userId: string,
  isMine: boolean,
  canWatch: boolean,
  canWrite: boolean,
}

async function parseToken(token: string): Promise<ForumToken> {
  if (!process.env.BACKEND_PUBLIC_KEY) throw new ServerError('no backend public key found to verify the token');
  const publicKey = await importSPKI(process.env.BACKEND_PUBLIC_KEY, 'ES256');
  const { payload } = await compactVerify(token, publicKey);
  const verifiedPayload = JSON.parse(toUtf8(payload)) as unknown;
  const decodedPayload = jwsPayloadSchema.parse(verifiedPayload);
  if (decodedPayload.exp.getTime() < Date.now()) throw new DecodingError('the token has expired');
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
  return await parseToken(jws);
}

export async function extractTokenFromWs(body: WsRequest['body']): Promise<ForumToken> {
  const result = z.object({ token: z.string() }).safeParse(body);
  if (!result.success) throw new DecodingError(`unable to fetch the token from the ws message: ${result.error.message}`);
  return await parseToken(result.data.token);
}
