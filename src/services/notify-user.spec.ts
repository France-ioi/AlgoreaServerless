import { clearTable } from '../testutils/db';

const mockSend = jest.fn();

jest.mock('../websocket-client', () => ({
  ...jest.requireActual('../websocket-client'),
  wsClient: { send: mockSend },
}));

import { notifyUser, notifyUsers } from './notify-user';
import { UserConnections } from '../dbmodels/user-connections';
import { Notifications } from '../dbmodels/notifications';
import { dynamodb } from '../dynamodb';
import { NotificationAction } from '../ws-messages';

describe('notifyUser', () => {
  let userConnections: UserConnections;
  let notifications: Notifications;
  const userId = 'user-123';

  beforeEach(async () => {
    userConnections = new UserConnections(dynamodb);
    notifications = new Notifications(dynamodb);
    await clearTable();
    jest.clearAllMocks();
    mockSend.mockImplementation((connectionIds) =>
      Promise.resolve(connectionIds.map((id: string) => ({ success: true, connectionId: id }))));
  });

  describe('user with no connections', () => {
    it('should create notification in DB without sending WS message', async () => {
      const sk = await notifyUser(userId, {
        notificationType: 'forum.new_message',
        payload: { text: 'Hello' },
      });

      expect(sk).toBeGreaterThan(0);

      // Verify notification was created in DB
      const notifs = await notifications.getNotifications(userId, 10);
      expect(notifs).toHaveLength(1);
      expect(notifs[0]?.sk).toBe(sk);
      expect(notifs[0]?.notificationType).toBe('forum.new_message');
      expect(notifs[0]?.payload).toEqual({ text: 'Hello' });

      // Verify no WS message was sent
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('user with active connections', () => {
    beforeEach(async () => {
      await userConnections.insert('conn-1', userId);
      await userConnections.insert('conn-2', userId);
    });

    it('should create notification in DB and send WS message to all connections', async () => {
      const sk = await notifyUser(userId, {
        notificationType: 'forum.new_message',
        payload: { text: 'Hello' },
      });

      // Verify notification was created in DB
      const notifs = await notifications.getNotifications(userId, 10);
      expect(notifs).toHaveLength(1);
      expect(notifs[0]?.sk).toBe(sk);

      // Verify WS message was sent to both connections
      expect(mockSend).toHaveBeenCalledWith(
        expect.arrayContaining([ 'conn-1', 'conn-2' ]),
        expect.objectContaining({
          action: NotificationAction.New,
          notification: {
            sk,
            notificationType: 'forum.new_message',
            payload: { text: 'Hello' },
          },
        })
      );
    });

    it('should include sk in WS message matching DB notification', async () => {
      const sk = await notifyUser(userId, {
        notificationType: 'test',
        payload: {},
      });

      const wsCall = mockSend.mock.calls[0];
      expect(wsCall).toBeDefined();
      const wsMessage = wsCall[1];
      expect(wsMessage.notification.sk).toBe(sk);
    });
  });

  describe('user with gone connections', () => {
    beforeEach(async () => {
      await userConnections.insert('conn-active', userId);
      await userConnections.insert('conn-gone', userId);
    });

    it('should clean up gone connections after sending', async () => {
      mockSend.mockImplementation((connectionIds) => Promise.resolve(connectionIds.map((id: string) => {
        if (id === 'conn-gone') {
          const error = new Error('Gone');
          error.name = 'GoneException';
          return { success: false, connectionId: id, error };
        }
        return { success: true, connectionId: id };
      })));

      await notifyUser(userId, {
        notificationType: 'test',
        payload: {},
      });

      // Verify notification was still created in DB
      const notifs = await notifications.getNotifications(userId, 10);
      expect(notifs).toHaveLength(1);

      // Verify gone connection was cleaned up
      const connections = await userConnections.getAll(userId);
      expect(connections).toHaveLength(1);
      expect(connections).toContain('conn-active');
      expect(connections).not.toContain('conn-gone');
    });

    it('should create notification even if all connections are gone', async () => {
      mockSend.mockImplementation((connectionIds) => Promise.resolve(connectionIds.map((id: string) => {
        const error = new Error('Gone');
        error.name = 'GoneException';
        return { success: false, connectionId: id, error };
      })));

      const sk = await notifyUser(userId, {
        notificationType: 'test',
        payload: {},
      });

      // Verify notification was created in DB
      const notifs = await notifications.getNotifications(userId, 10);
      expect(notifs).toHaveLength(1);
      expect(notifs[0]?.sk).toBe(sk);

      // Verify all gone connections were cleaned up
      const connections = await userConnections.getAll(userId);
      expect(connections).toHaveLength(0);
    });
  });
});

describe('notifyUsers', () => {
  let userConnections: UserConnections;
  let notifications: Notifications;

  beforeEach(async () => {
    userConnections = new UserConnections(dynamodb);
    notifications = new Notifications(dynamodb);
    await clearTable();
    jest.clearAllMocks();
    mockSend.mockImplementation((connectionIds) =>
      Promise.resolve(connectionIds.map((id: string) => ({ success: true, connectionId: id }))));
  });

  it('should notify multiple users in parallel', async () => {
    const userIds = [ 'user-1', 'user-2', 'user-3' ];

    // Add connections for some users
    await userConnections.insert('conn-1', 'user-1');
    await userConnections.insert('conn-2', 'user-2');
    // user-3 has no connections

    const sks = await notifyUsers(userIds, {
      notificationType: 'forum.new_message',
      payload: { text: 'Broadcast' },
    });

    expect(sks).toHaveLength(3);
    expect(sks.every(sk => sk > 0)).toBe(true);

    // Verify notifications were created for all users
    for (const userId of userIds) {
      const notifs = await notifications.getNotifications(userId, 10);
      expect(notifs).toHaveLength(1);
      expect(notifs[0]?.notificationType).toBe('forum.new_message');
    }

    // Verify WS messages were sent to users with connections
    expect(mockSend).toHaveBeenCalledTimes(2); // user-1 and user-2
  });

  it('should return empty array for empty user list', async () => {
    const sks = await notifyUsers([], {
      notificationType: 'test',
      payload: {},
    });

    expect(sks).toEqual([]);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
