import { Middleware, Request } from 'lambda-api';
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

/** Request with a parsed PortalToken attached */
export interface RequestWithPortalToken extends Request {
  portalToken: PortalToken,
}

export async function parsePortalToken(token: string, publicKeyPem?: string): Promise<PortalToken> {
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

async function extractPortalTokenFromHttp(headers: Request['headers']): Promise<PortalToken> {
  const jws = extractBearerToken(headers['authorization']);
  return parsePortalToken(jws, process.env.BACKEND_PUBLIC_KEY);
}

/**
 * Middleware that parses the PortalToken from the Authorization header
 * and attaches it to the request as `req.portalToken`
 */
export const requirePortalToken = (async (req, _res, next) => {
  const token = await extractPortalTokenFromHttp(req.headers);
  (req as RequestWithPortalToken).portalToken = token;
  next();
}) as Middleware;
