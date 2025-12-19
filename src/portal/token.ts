import { Request } from 'lambda-api';
import * as z from 'zod';
import { verifyJwt, extractBearerToken } from '../auth/jwt';

const portalPayloadSchema = z.object({
  item_id: z.string(),
  user_id: z.string(),
  firstname: z.string(),
  lastname: z.string(),
  email: z.string(),
});

export interface PortalToken {
  itemId: string,
  userId: string,
  firstname: string,
  lastname: string,
  email: string,
}

export async function parseToken(token: string, publicKeyPem?: string): Promise<PortalToken> {
  const payload = await verifyJwt(token, publicKeyPem);
  const decodedPayload = portalPayloadSchema.parse(payload);
  return {
    itemId: decodedPayload.item_id,
    userId: decodedPayload.user_id,
    firstname: decodedPayload.firstname,
    lastname: decodedPayload.lastname,
    email: decodedPayload.email,
  };
}

export async function extractTokenFromHttp(headers: Request['headers']): Promise<PortalToken> {
  const jws = extractBearerToken(headers['authorization']);
  return parseToken(jws, process.env.BACKEND_PUBLIC_KEY);
}
