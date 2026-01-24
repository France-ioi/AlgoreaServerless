import { WsMessage } from '../websocket-client';

export enum ForumMessageAction {
  NewMessage = 'forum.message.new',
  NewSubmission = 'forum.submission.new',
}

export interface ForumNewMessage extends WsMessage {
  action: ForumMessageAction.NewMessage,
  participantId: string,
  itemId: string,
  authorId: string,
  time: number,
  text: string,
  uuid: string,
}

export interface ForumNewSubmission extends WsMessage {
  action: ForumMessageAction.NewSubmission,
  answerId: string,
  participantId: string,
  itemId: string,
  attemptId: string,
  authorId: string,
  time: number,
}
