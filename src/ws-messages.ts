import { Notification } from './dbmodels/notifications';
import { WsMessage } from './websocket-client';

export enum NotificationAction {
  New = 'notification.new',
}

export interface NotificationNewMessage extends WsMessage {
  action: NotificationAction.New,
  notification: Notification,
}
