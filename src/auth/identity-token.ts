import * as z from 'zod';
import { verifyJwt } from './jwt';

const identityTokenPayloadSchema = z.object({
  user_id: z.string(),
  exp: z.number(),
});

export interface IdentityToken {
  userId: string,
  exp: number,
}

export async function parseIdentityToken(token: string, publicKeyPem?: string): Promise<IdentityToken> {
  const payload = await verifyJwt(token, publicKeyPem);
  const decodedPayload = identityTokenPayloadSchema.parse(payload);
  return {
    userId: decodedPayload.user_id,
    exp: decodedPayload.exp,
  };
}
