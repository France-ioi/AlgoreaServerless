import { AuthenticationError, Forbidden } from '../utils/errors';
import { Middleware, Request } from 'lambda-api';
import * as z from 'zod';
import { verifyJwt, extractBearerToken } from './jwt';
import { validateTokenDate } from './token-date';

const taskTokenPayloadSchema = z.object({
  idUser: z.string(),
  idItemLocal: z.string(),
  date: z.string(),
  bSubmissionPossible: z.union([ z.boolean(), z.string() ]).optional(),
});

export interface TaskToken {
  participantId: string,
  itemId: string,
  submissionPossible: boolean,
}

export interface RequestWithTaskToken extends Request {
  taskToken: TaskToken,
}

export async function parseTaskToken(token: string, publicKeyPem?: string): Promise<TaskToken> {
  const payload = await verifyJwt(token, publicKeyPem);
  const result = taskTokenPayloadSchema.safeParse(payload);
  if (!result.success) {
    throw new AuthenticationError(`Invalid task token payload: ${JSON.stringify(result.error.issues)}`);
  }
  validateTokenDate(result.data.date);
  return {
    participantId: result.data.idUser,
    itemId: result.data.idItemLocal,
    submissionPossible: result.data.bSubmissionPossible !== false && result.data.bSubmissionPossible !== 'false',
  };
}

export const requireTaskToken: Middleware = (async (req, _res, next) => {
  const jws = extractBearerToken(req.headers['authorization']);
  const token = await parseTaskToken(jws, process.env.BACKEND_PUBLIC_KEY);
  (req as RequestWithTaskToken).taskToken = token;
  next();
}) as Middleware;

/**
 * Like requireTaskToken, but also rejects tokens where bSubmissionPossible is false.
 * Use this for endpoints that record user activity (sessions), which should not
 * be tracked for read-only contexts (e.g. observing another user's task, expired contests).
 */
export const requireNonReadonlyTaskToken: Middleware = (async (req, _res, next) => {
  const jws = extractBearerToken(req.headers['authorization']);
  const token = await parseTaskToken(jws, process.env.BACKEND_PUBLIC_KEY);
  if (!token.submissionPossible) {
    throw new Forbidden('task session tracking is not allowed in read-only mode (bSubmissionPossible is false)');
  }
  (req as RequestWithTaskToken).taskToken = token;
  next();
}) as Middleware;
