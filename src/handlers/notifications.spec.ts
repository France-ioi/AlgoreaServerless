import { clearTable } from '../testutils/db';
import { IdentityToken } from '../auth/identity-token';
import { RequestWithIdentityToken } from '../auth/identity-token-middleware';
import { getNotifications, deleteNotification, markAsRead } from './notifications';
import { Notifications } from '../dbmodels/notifications';
import { dynamodb } from '../dynamodb';

/** Helper to create a mock request with identityToken already set (as middleware would do) */
function mockRequestWithIdentityToken(
  token: IdentityToken,
  extras: Partial<RequestWithIdentityToken> = {}
): RequestWithIdentityToken {
  return {
    identityToken: token,
    headers: {},
    query: {},
    body: {},
    params: {},
    ...extras,
  } as RequestWithIdentityToken;
}

describe('Notification Handlers', () => {
  let notifications: Notifications;
  const userId = 'user-123';
  const identityToken: IdentityToken = { userId, exp: 9999999999 };

  beforeEach(async () => {
    notifications = new Notifications(dynamodb);
    await clearTable();
  });

  describe('getNotifications', () => {
    it('should return empty array when no notifications exist', async () => {
      const req = mockRequestWithIdentityToken(identityToken);
      const resp = {} as any;

      const result = await getNotifications(req, resp);

      expect(result).toEqual({ notifications: [] });
    });

    it('should return notifications for the user', async () => {
      await notifications.create(userId, {
        notificationType: 'forum.reply',
        payload: { message: 'Hello' },
      });

      const req = mockRequestWithIdentityToken(identityToken);
      const resp = {} as any;

      const result = await getNotifications(req, resp);

      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0]?.notificationType).toBe('forum.reply');
      expect(result.notifications[0]?.payload).toEqual({ message: 'Hello' });
    });

    it('should return notifications in descending order', async () => {
      await notifications.create(userId, { notificationType: 'type-1', payload: {} });
      await new Promise(resolve => setTimeout(resolve, 10));
      await notifications.create(userId, { notificationType: 'type-2', payload: {} });

      const req = mockRequestWithIdentityToken(identityToken);
      const resp = {} as any;

      const result = await getNotifications(req, resp);

      expect(result.notifications).toHaveLength(2);
      expect(result.notifications[0]?.notificationType).toBe('type-2');
      expect(result.notifications[1]?.notificationType).toBe('type-1');
    });

    it('should limit to 20 notifications', async () => {
      for (let i = 0; i < 25; i++) {
        await notifications.create(userId, { notificationType: `type-${i}`, payload: {} });
      }

      const req = mockRequestWithIdentityToken(identityToken);
      const resp = {} as any;

      const result = await getNotifications(req, resp);

      expect(result.notifications).toHaveLength(20);
    });
  });

  describe('deleteNotification', () => {
    it('should delete a single notification', async () => {
      const sk = await notifications.create(userId, {
        notificationType: 'to-delete',
        payload: {},
      });

      const req = mockRequestWithIdentityToken(identityToken, {
        params: { sk: sk.toString() },
      });
      const resp = {} as any;

      const result = await deleteNotification(req, resp);

      expect(result).toEqual({ status: 'ok' });

      const remaining = await notifications.getNotifications(userId, 10);
      expect(remaining).toHaveLength(0);
    });

    it('should delete all notifications when sk is "all"', async () => {
      await notifications.create(userId, { notificationType: 'type-1', payload: {} });
      await notifications.create(userId, { notificationType: 'type-2', payload: {} });

      const req = mockRequestWithIdentityToken(identityToken, {
        params: { sk: 'all' },
      });
      const resp = {} as any;

      const result = await deleteNotification(req, resp);

      expect(result).toEqual({ status: 'ok' });

      const remaining = await notifications.getNotifications(userId, 10);
      expect(remaining).toHaveLength(0);
    });

    it('should throw DecodingError for invalid sk', async () => {
      const req = mockRequestWithIdentityToken(identityToken, {
        params: { sk: 'invalid' },
      });
      const resp = {} as any;

      await expect(deleteNotification(req, resp)).rejects.toThrow('Invalid sk parameter');
    });

    it('should handle deleting non-existent notification gracefully', async () => {
      const req = mockRequestWithIdentityToken(identityToken, {
        params: { sk: '12345' },
      });
      const resp = {} as any;

      const result = await deleteNotification(req, resp);

      expect(result).toEqual({ status: 'ok' });
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read by default (no body)', async () => {
      const sk = await notifications.create(userId, {
        notificationType: 'test',
        payload: {},
      });

      const req = mockRequestWithIdentityToken(identityToken, {
        params: { sk: sk.toString() },
        body: undefined,
      });
      const resp = {} as any;

      const result = await markAsRead(req, resp);

      expect(result).toEqual({ status: 'ok' });

      const notifs = await notifications.getNotifications(userId, 10);
      expect(notifs[0]?.readTime).toBeDefined();
    });

    it('should mark notification as read when body.read is true', async () => {
      const sk = await notifications.create(userId, {
        notificationType: 'test',
        payload: {},
      });

      const req = mockRequestWithIdentityToken(identityToken, {
        params: { sk: sk.toString() },
        body: { read: true },
      });
      const resp = {} as any;

      const result = await markAsRead(req, resp);

      expect(result).toEqual({ status: 'ok' });

      const notifs = await notifications.getNotifications(userId, 10);
      expect(notifs[0]?.readTime).toBeDefined();
    });

    it('should unmark notification as read when body.read is false', async () => {
      const sk = await notifications.create(userId, {
        notificationType: 'test',
        payload: {},
      });

      // First mark as read
      await notifications.setReadTime(userId, sk, Date.now());

      const req = mockRequestWithIdentityToken(identityToken, {
        params: { sk: sk.toString() },
        body: { read: false },
      });
      const resp = {} as any;

      const result = await markAsRead(req, resp);

      expect(result).toEqual({ status: 'ok' });

      const notifs = await notifications.getNotifications(userId, 10);
      expect(notifs[0]?.readTime).toBeUndefined();
    });

    it('should throw DecodingError for invalid sk', async () => {
      const req = mockRequestWithIdentityToken(identityToken, {
        params: { sk: 'invalid' },
        body: { read: true },
      });
      const resp = {} as any;

      await expect(markAsRead(req, resp)).rejects.toThrow('Invalid sk parameter');
    });

    it('should throw DecodingError for invalid body', async () => {
      const sk = await notifications.create(userId, {
        notificationType: 'test',
        payload: {},
      });

      const req = mockRequestWithIdentityToken(identityToken, {
        params: { sk: sk.toString() },
        body: { read: 'not-a-boolean' },
      });
      const resp = {} as any;

      await expect(markAsRead(req, resp)).rejects.toThrow('Invalid request body');
    });
  });
});
