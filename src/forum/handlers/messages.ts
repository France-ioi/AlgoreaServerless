import { threadSubscriptionsTable } from '../../dbmodels/forum/thread-subscriptions';
import { threadFollowsTable } from '../../dbmodels/forum/thread-follows';
import { ThreadEventLabel, threadEventsTable } from '../../dbmodels/forum/thread-events';
import { DecodingError, Forbidden } from '../../utils/errors';
import { z, ZodError } from 'zod';
import { ForumMessageAction } from '../ws-messages';
import { HandlerFunction, Response } from 'lambda-api';
import { RequestWithThreadToken } from '../thread-token';
import { created } from '../../utils/rest-responses';
import { notifyUsers } from '../../services/notify-user';
import { broadcastAndCleanup } from '../../services/ws-broadcast';

/**
 * Creates a new message in a thread.
 *
 * This handler performs the following operations:
 *
 * 1. **Message Storage**: Inserts the message into the database as a thread event.
 *
 * 2. **Real-time Notification (Subscribers)**: Sends the message via WebSocket to all
 *    active subscribers (users with open connections watching the thread). Gone connections
 *    are cleaned up automatically.
 *
 * 3. **Persistent Notification (Followers)**: Creates notifications for thread followers who
 *    did NOT receive the real-time WebSocket message. This excludes:
 *    - The message author (they don't need to be notified of their own message)
 *    - Users who successfully received the message via their active subscription
 *
 *    Followers with active connections receive both a WebSocket notification and a DB notification.
 *
 * Operations 1, 2, and 3 (fetching followers) run in parallel for performance.
 */
async function create(req: RequestWithThreadToken, resp: Response): Promise<ReturnType<typeof created>> {
  const { participantId, itemId, userId, canWrite } = req.threadToken;
  if (!canWrite) throw new Forbidden('This operation required canWrite');

  const threadId = { participantId, itemId };
  let text: string, uuid: string;
  try {
    ({ text, uuid } = z.object({ text: z.string(), uuid: z.string() }).parse(req.body));
  } catch (err) {
    if (err instanceof ZodError) throw new DecodingError(JSON.stringify(err.issues));
    throw err;
  }
  const time = Date.now();
  const authorId = userId;

  // Run all operations in parallel:
  // 1. Insert the message in the database
  // 2. Notify subscribers via WebSocket and track successful user IDs
  // 3. Get thread followers
  const [ , successfulSubscriberUserIds, followers ] = await Promise.all([
    threadEventsTable.insert([{ label: ThreadEventLabel.Message, sk: time, threadId, data: { authorId, text, uuid } }]),
    threadSubscriptionsTable.getSubscribers({ threadId }).then(async subscribers => {
      const wsMessage = { action: ForumMessageAction.NewMessage, participantId, itemId, authorId, time, text, uuid };
      const { successfulRecipients } = await broadcastAndCleanup(subscribers, s => s.connectionId, wsMessage);
      return new Set(successfulRecipients.map(s => s.userId));
    }),
    threadFollowsTable.getFollowers(threadId),
  ]);

  // Notify followers who didn't receive the WS message (excluding author and successful subscribers)
  const followersToNotify = followers
    .map(f => f.userId)
    .filter(followerId => followerId !== authorId && !successfulSubscriberUserIds.has(followerId));

  if (followersToNotify.length > 0) {
    await notifyUsers(followersToNotify, {
      notificationType: 'forum.new_message',
      payload: { participantId, itemId, authorId, time, text, uuid },
    });
  }

  return created(resp);
}

const defaultLimit = 10;
const maxLimit = 20;

async function getAll(req: RequestWithThreadToken): Promise<{ time: number, text: string, authorId: string, uuid: string }[]> {
  const { threadToken } = req;
  const limitParam = req.query['limit'] ? +req.query['limit'] : undefined;
  let limit: number;
  try {
    limit = z.number().positive().max(maxLimit).default(defaultLimit).parse(limitParam);
  } catch (err) {
    if (err instanceof ZodError) throw new DecodingError(JSON.stringify(err.issues));
    throw err;
  }

  const messages = await threadEventsTable.getAllMessages(threadToken, { limit });
  return messages.map(m => ({
    time: m.sk,
    authorId: m.data.authorId,
    text: m.data.text,
    uuid: m.data.uuid,
  }));
}

export const getAllMessages = getAll as unknown as HandlerFunction;
export const createMessage = create as unknown as HandlerFunction;
