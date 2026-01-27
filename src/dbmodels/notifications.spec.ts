import { Notifications } from './notifications';
import { dynamodb } from '../dynamodb';
import { clearTable } from '../testutils/db';

describe('Notifications', () => {
  let notifications: Notifications;
  const userId = 'user-123';

  beforeEach(async () => {
    notifications = new Notifications(dynamodb);
    await clearTable();
  });

  describe('create', () => {
    it('should create a notification and return its sk', async () => {
      const sk = await notifications.insert(userId, {
        notificationType: 'forum.reply',
        payload: { threadId: 'thread-1', message: 'Hello' },
      });

      expect(sk).toBeGreaterThan(0);

      const result = await notifications.getNotifications(userId, 10);
      expect(result).toHaveLength(1);
      expect(result[0]?.sk).toBe(sk);
      expect(result[0]?.notificationType).toBe('forum.reply');
      expect(result[0]?.payload).toEqual({ threadId: 'thread-1', message: 'Hello' });
      expect(result[0]?.readTime).toBeUndefined();
    });
  });

  describe('getNotifications', () => {
    it('should return empty array when no notifications exist', async () => {
      const result = await notifications.getNotifications(userId, 10);
      expect(result).toEqual([]);
    });

    it('should return notifications in descending order (newest first)', async () => {
      await notifications.insert(userId, {
        notificationType: 'type-1',
        payload: { order: 1 },
      });
      await new Promise(resolve => setTimeout(resolve, 10)); // ensure different timestamps
      await notifications.insert(userId, {
        notificationType: 'type-2',
        payload: { order: 2 },
      });
      await new Promise(resolve => setTimeout(resolve, 10));
      await notifications.insert(userId, {
        notificationType: 'type-3',
        payload: { order: 3 },
      });

      const result = await notifications.getNotifications(userId, 10);
      expect(result).toHaveLength(3);
      expect(result[0]?.notificationType).toBe('type-3');
      expect(result[1]?.notificationType).toBe('type-2');
      expect(result[2]?.notificationType).toBe('type-1');
    });

    it('should respect the limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await notifications.insert(userId, {
          notificationType: `type-${i}`,
          payload: { index: i },
        });
        await new Promise(resolve => setTimeout(resolve, 5));
      }

      const result = await notifications.getNotifications(userId, 3);
      expect(result).toHaveLength(3);
    });

    it('should isolate notifications between users', async () => {
      await notifications.insert('user-1', {
        notificationType: 'for-user-1',
        payload: {},
      });
      await notifications.insert('user-2', {
        notificationType: 'for-user-2',
        payload: {},
      });

      const user1Notifs = await notifications.getNotifications('user-1', 10);
      const user2Notifs = await notifications.getNotifications('user-2', 10);

      expect(user1Notifs).toHaveLength(1);
      expect(user2Notifs).toHaveLength(1);
      expect(user1Notifs[0]?.notificationType).toBe('for-user-1');
      expect(user2Notifs[0]?.notificationType).toBe('for-user-2');
    });
  });

  describe('delete', () => {
    it('should delete a single notification', async () => {
      const sk = await notifications.insert(userId, {
        notificationType: 'to-delete',
        payload: {},
      });

      let result = await notifications.getNotifications(userId, 10);
      expect(result).toHaveLength(1);

      await notifications.delete(userId, sk);

      result = await notifications.getNotifications(userId, 10);
      expect(result).toHaveLength(0);
    });

    it('should not affect other notifications when deleting one', async () => {
      const sk1 = await notifications.insert(userId, {
        notificationType: 'keep',
        payload: {},
      });
      await new Promise(resolve => setTimeout(resolve, 5));
      const sk2 = await notifications.insert(userId, {
        notificationType: 'delete',
        payload: {},
      });

      await notifications.delete(userId, sk2);

      const result = await notifications.getNotifications(userId, 10);
      expect(result).toHaveLength(1);
      expect(result[0]?.sk).toBe(sk1);
    });

    it('should handle deleting non-existent notification gracefully', async () => {
      await expect(
        notifications.delete(userId, 12345)
      ).resolves.not.toThrow();
    });
  });

  describe('deleteAll', () => {
    it('should delete all notifications for a user', async () => {
      await notifications.insert(userId, { notificationType: 'type-1', payload: {} });
      await notifications.insert(userId, { notificationType: 'type-2', payload: {} });
      await notifications.insert(userId, { notificationType: 'type-3', payload: {} });

      let result = await notifications.getNotifications(userId, 10);
      expect(result).toHaveLength(3);

      await notifications.deleteAll(userId);

      result = await notifications.getNotifications(userId, 10);
      expect(result).toHaveLength(0);
    });

    it('should not affect other users notifications', async () => {
      await notifications.insert('user-1', { notificationType: 'for-user-1', payload: {} });
      await notifications.insert('user-2', { notificationType: 'for-user-2', payload: {} });

      await notifications.deleteAll('user-1');

      const user1Notifs = await notifications.getNotifications('user-1', 10);
      const user2Notifs = await notifications.getNotifications('user-2', 10);

      expect(user1Notifs).toHaveLength(0);
      expect(user2Notifs).toHaveLength(1);
    });

    it('should handle deleting when no notifications exist', async () => {
      await expect(
        notifications.deleteAll(userId)
      ).resolves.not.toThrow();
    });
  });

  describe('setReadTime', () => {
    it('should mark a notification as read', async () => {
      const sk = await notifications.insert(userId, {
        notificationType: 'unread',
        payload: {},
      });

      const readTime = Date.now();
      await notifications.setReadTime(userId, sk, readTime);

      const result = await notifications.getNotifications(userId, 10);
      expect(result).toHaveLength(1);
      expect(result[0]?.readTime).toBe(readTime);
    });

    it('should unmark a notification as read', async () => {
      const sk = await notifications.insert(userId, {
        notificationType: 'test',
        payload: {},
      });

      // First mark as read
      await notifications.setReadTime(userId, sk, Date.now());

      let result = await notifications.getNotifications(userId, 10);
      expect(result[0]?.readTime).toBeDefined();

      // Then unmark
      await notifications.setReadTime(userId, sk, undefined);

      result = await notifications.getNotifications(userId, 10);
      expect(result[0]?.readTime).toBeUndefined();
    });
  });
});
