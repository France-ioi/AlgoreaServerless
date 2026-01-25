import { ThreadFollows } from '../../dbmodels/forum/thread-follows';
import { dynamodb } from '../../dynamodb';
import { HandlerFunction } from 'lambda-api';
import { RequestWithThreadToken } from '../thread-token';
import { RequestWithIdentityToken } from '../../auth/identity-token-middleware';
import { DecodingError } from '../../utils/errors';
import { z, ZodError } from 'zod';

const threadFollows = new ThreadFollows(dynamodb);

const okResponse = { status: 'ok' };

/**
 * POST /sls/forum/follow
 * Requires a valid thread token.
 * Adds the user to the thread followers. Ignores if already following.
 */
async function follow(req: RequestWithThreadToken): Promise<typeof okResponse> {
  const { participantId, itemId, userId } = req.threadToken;
  const threadId = { participantId, itemId };

  await threadFollows.follow(threadId, userId);

  return okResponse;
}

const unfollowQuerySchema = z.object({
  participant_id: z.string(),
  item_id: z.string(),
});

/**
 * DELETE /sls/forum/follow
 * Requires a valid identity token and query parameters: participant_id, item_id.
 * Removes the user from the thread followers. Ignores if not following.
 */
async function unfollow(req: RequestWithIdentityToken): Promise<typeof okResponse> {
  const { userId } = req.identityToken;

  let participantId: string, itemId: string;
  try {
    const query = unfollowQuerySchema.parse(req.query);
    participantId = query.participant_id;
    itemId = query.item_id;
  } catch (err) {
    if (err instanceof ZodError) {
      throw new DecodingError(`Missing or invalid query parameters: ${JSON.stringify(err.issues)}`);
    }
    throw err;
  }

  const threadId = { participantId, itemId };
  await threadFollows.unfollow(threadId, userId);

  return okResponse;
}

export const followThread = follow as unknown as HandlerFunction;
export const unfollowThread = unfollow as unknown as HandlerFunction;
