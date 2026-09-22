import { AuthenticationError } from '../utils/errors';
import { Middleware, Request } from 'lambda-api';
import { z } from 'zod';
import { verifyJwt, verifyJwtSignatureOnly, extractBearerToken } from '../auth/jwt';
import { validateTokenDate } from '../auth/token-date';

const groupResultsTokenPayloadSchema = z.object({
  user_id: z.string(),
  group_id: z.string(),
  item_ids: z.array(z.string()),
  date: z.string(),
  exp: z.number(),
});

export interface GroupResultsToken {
  userId: string,
  groupId: string,
  itemIds: string[],
  /** Raw JWT string — forwarded in EventBridge payloads */
  raw: string,
}

export interface RequestWithGroupResultsToken extends Request {
  groupResultsToken: GroupResultsToken,
}

export interface ParseGroupResultsTokenOptions {
  /**
   * When true, verify signature without jose clock claims (`exp`/`nbf`) and skip the
   * manual exp compare. Completion may arrive after the 1h token lifetime.
   */
  skipExpCheck?: boolean,
}

function toGroupResultsToken(
  data: z.infer<typeof groupResultsTokenPayloadSchema>,
  raw: string,
): GroupResultsToken {
  return {
    userId: data.user_id,
    groupId: data.group_id,
    itemIds: data.item_ids,
    raw,
  };
}

/**
 * Parse and verify a group results token (signature + schema + date; exp unless skipped).
 */
export async function parseGroupResultsToken(
  token: string,
  publicKeyPem?: string,
  options?: ParseGroupResultsTokenOptions,
): Promise<GroupResultsToken> {
  // skipExpCheck must not use jwtVerify — jose enforces exp even if we skip the manual check
  const payload = options?.skipExpCheck
    ? await verifyJwtSignatureOnly(token, publicKeyPem)
    : await verifyJwt(token, publicKeyPem);
  const result = groupResultsTokenPayloadSchema.safeParse(payload);
  if (!result.success) {
    throw new AuthenticationError(
      `Invalid group results token payload: ${JSON.stringify(result.error.issues)}`,
    );
  }
  validateTokenDate(result.data.date);
  if (!options?.skipExpCheck && result.data.exp <= Math.floor(Date.now() / 1000)) {
    throw new AuthenticationError('the group results token has expired');
  }
  return toGroupResultsToken(result.data, token);
}

/**
 * Signature + schema + date only — used by the completion handler when the job
 * may finish after the token's 1h lifetime.
 */
export async function parseGroupResultsTokenSignatureOnly(
  token: string,
  publicKeyPem?: string,
): Promise<GroupResultsToken> {
  return parseGroupResultsToken(token, publicKeyPem, { skipExpCheck: true });
}

export const requireGroupResultsToken = (async (req, _res, next) => {
  const jws = extractBearerToken(req.headers['authorization']);
  const token = await parseGroupResultsToken(jws, process.env.BACKEND_PUBLIC_KEY);
  (req as RequestWithGroupResultsToken).groupResultsToken = token;
  next();
}) as Middleware;
