import { AuthenticationError, Forbidden } from '../utils/errors';
import { Middleware, Request } from 'lambda-api';
import { z } from 'zod';
import { verifyJwt, extractBearerToken } from './jwt';
import { validateTokenDate } from './token-date';

const canViewValues = [ 'none', 'info', 'content', 'content_with_descendants', 'solution' ] as const;
const canGrantViewValues = [ 'none', 'enter', 'content', 'content_with_descendants', 'solution', 'solution_with_grant' ] as const;
const canWatchValues = [ 'none', 'result', 'answer', 'answer_with_grant' ] as const;
const canEditValues = [ 'none', 'children', 'all', 'all_with_grant' ] as const;

const permissionsTokenPayloadSchema = z.object({
  date: z.string(),
  user_id: z.string(),
  item_id: z.string(),
  can_view: z.enum(canViewValues),
  can_grant_view: z.enum(canGrantViewValues),
  can_watch: z.enum(canWatchValues),
  can_edit: z.enum(canEditValues),
  is_owner: z.boolean(),
  exp: z.number(),
});

export type CanEdit = typeof canEditValues[number];

export interface PermissionsToken {
  userId: string,
  itemId: string,
  canView: typeof canViewValues[number],
  canGrantView: typeof canGrantViewValues[number],
  canWatch: typeof canWatchValues[number],
  canEdit: CanEdit,
  isOwner: boolean,
}

export interface RequestWithPermissionsToken extends Request {
  permissionsToken: PermissionsToken,
}

function canEditAtLeast(value: CanEdit, threshold: CanEdit): boolean {
  return canEditValues.indexOf(value) >= canEditValues.indexOf(threshold);
}

export async function parsePermissionsToken(token: string, publicKeyPem?: string): Promise<PermissionsToken> {
  const payload = await verifyJwt(token, publicKeyPem);
  const result = permissionsTokenPayloadSchema.safeParse(payload);
  if (!result.success) {
    throw new AuthenticationError(`Invalid permissions token payload: ${JSON.stringify(result.error.issues)}`);
  }
  validateTokenDate(result.data.date);
  if (result.data.exp <= Math.floor(Date.now() / 1000)) {
    throw new AuthenticationError('the permissions token has expired');
  }
  return {
    userId: result.data.user_id,
    itemId: result.data.item_id,
    canView: result.data.can_view,
    canGrantView: result.data.can_grant_view,
    canWatch: result.data.can_watch,
    canEdit: result.data.can_edit,
    isOwner: result.data.is_owner,
  };
}

interface PermissionsTokenOptions {
  requireEditAll?: boolean,
}

export function requirePermissionsToken(options?: PermissionsTokenOptions): Middleware {
  return (async (req, _res, next) => {
    const jws = extractBearerToken(req.headers['authorization']);
    const token = await parsePermissionsToken(jws, process.env.BACKEND_PUBLIC_KEY);
    if (options?.requireEditAll && !token.isOwner && !canEditAtLeast(token.canEdit, 'all')) {
      throw new Forbidden('insufficient permissions: requires can_edit >= "all" or is_owner');
    }
    (req as RequestWithPermissionsToken).permissionsToken = token;
    next();
  }) as Middleware;
}
