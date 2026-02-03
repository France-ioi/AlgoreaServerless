import { HandlerFunction, Response } from 'lambda-api';
import { RequestWithIdentityToken } from '../auth/identity-token-middleware';
import { notificationsTable, Notification } from '../dbmodels/notifications';
import { DecodingError } from '../utils/errors';
import { z, ZodError } from 'zod';
import { deleted } from '../utils/rest-responses';

const okResponse = { status: 'ok' };

interface NotificationsResponse {
  notifications: Notification[],
}

/**
 * GET /notifications
 * Returns the last 20 notifications for the authenticated user.
 */
async function get(req: RequestWithIdentityToken): Promise<NotificationsResponse> {
  const { userId } = req.identityToken;
  const result = await notificationsTable.getNotifications(userId, 20);
  return { notifications: result };
}

/**
 * DELETE /notifications/:sk
 * Deletes a notification by its sk (sort key).
 * If sk is "all", deletes all notifications for the user.
 */
async function remove(req: RequestWithIdentityToken, resp: Response): Promise<ReturnType<typeof deleted>> {
  const { userId } = req.identityToken;
  const skParam = req.params.sk;

  if (!skParam) {
    throw new DecodingError('Missing sk parameter.');
  }

  if (skParam === 'all') {
    await notificationsTable.deleteAll(userId);
  } else {
    const sk = parseInt(skParam, 10);
    if (isNaN(sk)) {
      throw new DecodingError(`Invalid sk parameter: ${skParam}. Expected a number or "all".`);
    }
    await notificationsTable.delete(userId, sk);
  }

  return deleted(resp);
}

const markAsReadBodySchema = z.object({
  read: z.boolean(),
}).optional();

/**
 * PUT /notifications/:sk/mark-as-read
 * Marks a notification as read or unread.
 * Body: { "read": boolean } - defaults to true if not provided.
 */
async function setReadStatus(req: RequestWithIdentityToken): Promise<typeof okResponse> {
  const { userId } = req.identityToken;
  const skParam = req.params.sk;

  if (!skParam) {
    throw new DecodingError('Missing sk parameter.');
  }

  const sk = parseInt(skParam, 10);
  if (isNaN(sk)) {
    throw new DecodingError(`Invalid sk parameter: ${skParam}. Expected a number.`);
  }

  let read = true; // default to marking as read
  try {
    const body = markAsReadBodySchema.parse(req.body);
    if (body !== undefined) {
      read = body.read;
    }
  } catch (err) {
    if (err instanceof ZodError) {
      throw new DecodingError(`Invalid request body: ${JSON.stringify(err.issues)}`);
    }
    throw err;
  }

  const readTime = read ? Date.now() : undefined;
  await notificationsTable.setReadTime(userId, sk, readTime);

  return okResponse;
}

export const getNotifications = get as unknown as HandlerFunction;
export const deleteNotification = remove as unknown as HandlerFunction;
export const markAsRead = setReadStatus as unknown as HandlerFunction;
