import * as z from 'zod';
import { verifyJwt } from '../auth/jwt';

const wsTokenPayloadSchema = z.object({
  user_id: z.string(),
  exp: z.number(),
});

export interface WsToken {
  userId: string,
  exp: number,
}

export async function parseWsToken(token: string, publicKeyPem?: string): Promise<WsToken> {
  const payload = await verifyJwt(token, publicKeyPem);
  const decodedPayload = wsTokenPayloadSchema.parse(payload);
  return {
    userId: decodedPayload.user_id,
    exp: decodedPayload.exp,
  };
}
