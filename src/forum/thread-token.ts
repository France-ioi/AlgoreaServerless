import { AuthenticationError, Forbidden } from '../utils/errors';
import { Middleware, Request } from 'lambda-api';
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

/** Request with a parsed ThreadToken attached */
export interface RequestWithThreadToken extends Request {
  threadToken: ThreadToken,
}

export async function parseThreadToken(token: string, publicKeyPem?: string): Promise<ThreadToken> {
  const payload = await verifyJwt(token, publicKeyPem);
  const result = jwsPayloadSchema.safeParse(payload);
  if (!result.success) {
    throw new AuthenticationError(`Invalid thread token payload: ${JSON.stringify(result.error.issues)}`);
  }
  return {
    participantId: result.data.participant_id,
    itemId: result.data.item_id,
    userId: result.data.user_id,
    isMine: result.data.is_mine,
    canWatch: result.data.can_watch,
    canWrite: result.data.can_write,
  };
}

async function extractThreadTokenFromHttp(headers: Request['headers']): Promise<ThreadToken> {
  const jws = extractBearerToken(headers['authorization']);
  return parseThreadToken(jws, process.env.BACKEND_PUBLIC_KEY);
}

/**
 * Validates that the thread token matches the route parameters.
 * Throws Forbidden if the token's itemId/participantId don't match the route.
 */
function validateTokenMatchesRoute(token: ThreadToken, params: Request['params']): void {
  const { itemId, participantId } = params;
  if (itemId && token.itemId !== itemId) {
    throw new Forbidden(`Token itemId '${token.itemId}' does not match route itemId '${itemId}'`);
  }
  if (participantId && token.participantId !== participantId) {
    throw new Forbidden(`Token participantId '${token.participantId}' does not match route participantId '${participantId}'`);
  }
}

/**
 * Middleware that parses the ThreadToken from the Authorization header,
 * validates it matches route parameters (itemId, participantId),
 * and attaches it to the request as `req.threadToken`
 */
export const requireThreadToken: Middleware = (async (req, _res, next) => {
  const token = await extractThreadTokenFromHttp(req.headers);
  validateTokenMatchesRoute(token, req.params);
  (req as RequestWithThreadToken).threadToken = token;
  next();
}) as Middleware;

export async function extractThreadTokenFromWs(body: WsRequest['body']): Promise<ThreadToken> {
  const result = z.object({ token: z.string() }).safeParse(body);
  if (!result.success) throw new AuthenticationError(`unable to fetch the token from the ws message: ${result.error.message}`);
  return parseThreadToken(result.data.token, process.env.BACKEND_PUBLIC_KEY);
}
