import { Middleware, Request } from 'lambda-api';
import { IdentityToken, parseIdentityToken } from './identity-token';
import { extractBearerToken } from './jwt';

/** Request with a parsed IdentityToken attached */
export interface RequestWithIdentityToken extends Request {
  identityToken: IdentityToken,
}

async function extractIdentityTokenFromHttp(headers: Request['headers']): Promise<IdentityToken> {
  const jws = extractBearerToken(headers['authorization']);
  return parseIdentityToken(jws, process.env.BACKEND_PUBLIC_KEY);
}

/**
 * Middleware that parses the IdentityToken from the Authorization header
 * and attaches it to the request as `req.identityToken`
 */
export const requireIdentityToken = (async (req, _res, next) => {
  const token = await extractIdentityTokenFromHttp(req.headers);
  (req as RequestWithIdentityToken).identityToken = token;
  next();
}) as Middleware;
