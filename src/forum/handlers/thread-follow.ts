import { threadFollowsTable } from '../dbmodels/thread-follows';
import { HandlerFunction } from 'lambda-api';
import { RequestWithThreadToken } from '../thread-token';
import { RequestWithIdentityToken } from '../../auth/identity-token-middleware';
import { DecodingError } from '../../utils/errors';

const okResponse = { status: 'ok' };

/**
 * POST /sls/forum/thread/:itemId/:participantId/follows
 * Requires a valid thread token that matches the route parameters.
 * Adds the user to the thread followers. Ignores if already following.
 */
async function follow(req: RequestWithThreadToken): Promise<typeof okResponse> {
  const { participantId, itemId, userId } = req.threadToken;
  const threadId = { participantId, itemId };

  await threadFollowsTable.follow(threadId, userId);

  return okResponse;
}

/**
 * DELETE /sls/forum/thread/:itemId/:participantId/follows
 * Requires a valid identity token and path parameters: itemId, participantId.
 * Removes the user from the thread followers. Ignores if not following.
 */
async function unfollow(req: RequestWithIdentityToken): Promise<typeof okResponse> {
  const { userId } = req.identityToken;
  const { participantId, itemId } = req.params;

  if (!participantId || !itemId) {
    throw new DecodingError('Missing path parameters: itemId and participantId are required');
  }

  const threadId = { participantId, itemId };
  await threadFollowsTable.unfollow(threadId, userId);

  return okResponse;
}

export const followThread = follow as unknown as HandlerFunction;
export const unfollowThread = unfollow as unknown as HandlerFunction;
