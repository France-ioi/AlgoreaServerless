import { Notification } from './dbmodels/notifications';
import { WsMessage } from './websocket-client';

export enum NotificationAction {
  New = 'notification.new',
}

export interface NotificationNewMessage extends WsMessage {
  action: NotificationAction.New,
  notification: Notification,
}

export enum LiveActivityMessageAction {
  Validation = 'liveActivity.validation.new',
}

export interface LiveActivityValidation extends WsMessage {
  action: LiveActivityMessageAction.Validation,
  participantId: string,
  itemId: string,
  answerId: string,
  attemptId: string,
  time: number,
}
