import { threadFollowsTable } from '../dbmodels/thread-follows';
import { HandlerFunction, Response } from 'lambda-api';
import { RequestWithThreadToken } from '../thread-token';
import { RequestWithIdentityToken } from '../../auth/identity-token-middleware';
import { DecodingError } from '../../utils/errors';
import { created, deleted } from '../../utils/rest-responses';

/**
 * POST /sls/forum/thread/:itemId/:participantId/follows
 * Requires a valid thread token that matches the route parameters.
 * Adds the user to the thread followers. Ignores if already following.
 */
async function follow(req: RequestWithThreadToken, resp: Response): Promise<ReturnType<typeof created>> {
  const { participantId, itemId, userId } = req.threadToken;
  const threadId = { participantId, itemId };

  await threadFollowsTable.insert(threadId, userId);

  return created(resp);
}

/**
 * DELETE /sls/forum/thread/:itemId/:participantId/follows
 * Requires a valid identity token and path parameters: itemId, participantId.
 * Removes the user from the thread followers. Ignores if not following.
 */
async function unfollow(req: RequestWithIdentityToken, resp: Response): Promise<ReturnType<typeof deleted>> {
  const { userId } = req.identityToken;
  const { participantId, itemId } = req.params;

  if (!participantId || !itemId) {
    throw new DecodingError('Missing path parameters: itemId and participantId are required');
  }

  const threadId = { participantId, itemId };
  await threadFollowsTable.deleteByUserId(threadId, userId);

  return deleted(resp);
}

interface FollowStatusResponse {
  isFollowing: boolean,
}

/**
 * GET /sls/forum/thread/:itemId/:participantId/follows
 * Requires a valid identity token and path parameters: itemId, participantId.
 * Returns whether the current user is following the thread.
 */
async function getStatus(req: RequestWithIdentityToken): Promise<FollowStatusResponse> {
  const { userId } = req.identityToken;
  const { participantId, itemId } = req.params;

  if (!participantId || !itemId) {
    throw new DecodingError('Missing path parameters: itemId and participantId are required');
  }

  const threadId = { participantId, itemId };
  const isFollowing = await threadFollowsTable.exists(threadId, userId);

  return { isFollowing };
}

export const followThread = follow as unknown as HandlerFunction;
export const unfollowThread = unfollow as unknown as HandlerFunction;
export const getFollowStatus = getStatus as unknown as HandlerFunction;
