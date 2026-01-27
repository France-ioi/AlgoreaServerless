import { UserConnections } from '../dbmodels/user-connections';
import { ThreadSubscriptions } from '../dbmodels/forum/thread-subscriptions';
import { Notifications, NotificationInput, Notification } from '../dbmodels/notifications';
import { dynamodb } from '../dynamodb';
import { NotificationAction, NotificationNewMessage } from '../ws-messages';
import { broadcastAndCleanup } from './ws-broadcast';

const userConnections = new UserConnections(dynamodb);
const subscriptions = new ThreadSubscriptions(dynamodb);
const notifications = new Notifications(dynamodb);

/**
 * Sends a notification to a user.
 *
 * This function runs two operations in parallel:
 * 1. Creates the notification in the database
 * 2. Checks if the user has active WebSocket connections and sends the notification via WS
 *
 * Gone connections are cleaned up after the WS send attempt (both user connection AND thread subscription).
 *
 * @param userId - The user to notify
 * @param notification - The notification type and payload
 * @returns The notification sk (timestamp)
 */
export async function notifyUser(userId: string, notification: NotificationInput): Promise<number> {
  const sk = Date.now();

  const fullNotification: Notification = {
    sk,
    notificationType: notification.notificationType,
    payload: notification.payload,
  };

  await Promise.all([
    // Create notification in database
    notifications.createWithSk(userId, sk, notification),

    // Send via WebSocket if user has active connections
    userConnections.getAll(userId).then(async connectionIds => {
      if (connectionIds.length === 0) return;

      const wsMessage: NotificationNewMessage = {
        action: NotificationAction.New,
        notification: fullNotification,
      };

      await broadcastAndCleanup(connectionIds, id => id, wsMessage, userConnections, subscriptions);
    }),
  ]);

  return sk;
}

/**
 * Sends notifications to multiple users in parallel.
 *
 * @param userIds - Array of user IDs to notify
 * @param notification - The notification type and payload
 * @returns Array of notification sks (timestamps) in the same order as userIds
 */
export async function notifyUsers(userIds: string[], notification: NotificationInput): Promise<number[]> {
  return Promise.all(userIds.map(userId => notifyUser(userId, notification)));
}
