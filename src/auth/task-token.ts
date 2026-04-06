import { AuthenticationError } from '../utils/errors';
import { Middleware, Request } from 'lambda-api';
import * as z from 'zod';
import { verifyJwt, extractBearerToken } from './jwt';

const taskTokenPayloadSchema = z.object({
  idUser: z.string(),
  idItemLocal: z.string(),
  date: z.string(),
});

export interface TaskToken {
  participantId: string,
  itemId: string,
}

export interface RequestWithTaskToken extends Request {
  taskToken: TaskToken,
}

/**
 * The backend encodes a `date` field as dd-mm-yyyy and considers it valid
 * if it matches yesterday, today, or tomorrow (UTC).
 */
function validateTokenDate(dateStr: string): void {
  const dayMs = 24 * 60 * 60 * 1000;
  const now = new Date();
  const fmt = (d: Date): string => {
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    return `${dd}-${mm}-${yyyy}`;
  };
  const valid = [
    fmt(new Date(now.getTime() - dayMs)),
    fmt(now),
    fmt(new Date(now.getTime() + dayMs)),
  ];
  if (!valid.includes(dateStr)) {
    throw new AuthenticationError('the task token has expired');
  }
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
  };
}

export const requireTaskToken: Middleware = (async (req, _res, next) => {
  const jws = extractBearerToken(req.headers['authorization']);
  const token = await parseTaskToken(jws, process.env.BACKEND_PUBLIC_KEY);
  (req as RequestWithTaskToken).taskToken = token;
  next();
}) as Middleware;
