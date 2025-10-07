import { ALBEvent, ALBResult } from 'aws-lambda';
import { ForumToken } from '../../handlers/forum-parse';
import { ThreadSubscriptions } from '../../dbmodels/forum/thread-subscriptions';
import { ThreadEventLabel, ThreadEvents } from '../../dbmodels/forum/thread-events';
import { dynamodb } from '../../dynamodb';
import { DecodingError, Forbidden } from '../../utils/errors';
import { z } from 'zod';
import { ForumMessageAction, isClosedConnection, logSendResults, wsClient } from '../../websocket-client';
import { created } from '../../utils/responses';
import { ReqBody, ReqQueryParams } from '../../handlers/common';

const subscriptions = new ThreadSubscriptions(dynamodb);
const threadEvents = new ThreadEvents(dynamodb);

export async function createMessage(token: ForumToken, body: ReqBody, _queryParams: ReqQueryParams): Promise<ALBResult> {
  const { participantId, itemId, userId, canWrite } = token;
  if (!canWrite) throw new Forbidden(`This operation required canWrite, got ${JSON.stringify(token)} `);
  if (!body) throw new DecodingError('Missing body');

  const threadId = { participantId, itemId };
  const { text, uuid } = z.object({ text: z.string(), uuid: z.string() }).parse(JSON.parse(body));
  const time = Date.now();
  const authorId = userId;

  await Promise.all([
    // create the entry
    threadEvents.insert([{ label: ThreadEventLabel.Message, sk: time, threadId, data: { authorId, text, uuid } }]),
    // notify all subscribers
    subscriptions.getSubscribers(threadId).then(async subscribers => {
      const wsMessage = { action: ForumMessageAction.NewMessage, participantId, itemId, authorId, time, text, uuid };
      const sendResults = await wsClient.send(subscribers.map(s => s.connectionId), wsMessage);
      logSendResults(sendResults);
      const goneSubscribers = sendResults
        .map((res, idx) => ({ ...res, sk: subscribers[idx]!.sk }))
        .filter(isClosedConnection)
        .map(r => r.sk);
      return subscriptions.unsubscribeSet(threadId, goneSubscribers);
    }),
  ]);
  return created();
}

const defaultLimit = 10;
const maxLimit = 20;

export async function getAllMessages(token: ForumToken, _body: ReqBody, queryParams: ALBEvent['queryStringParameters']):
  Promise<{ time: number, text: string, authorId: string, uuid: string }[]> {
  const { canWatch, isMine } = token;
  if (!canWatch && !isMine) throw new Forbidden(`This operation required canWatch or isMine, got ${JSON.stringify(token)} `);
  const limit = queryParams && queryParams['limit'] ?
    z.number().positive().max(maxLimit).default(defaultLimit).parse(+queryParams['limit']) :
    defaultLimit;

  const messages = await threadEvents.getAllMessages(token, { limit });
  return messages.map(m => ({
    time: m.sk,
    authorId: m.data.authorId,
    text: m.data.text,
    uuid: m.data.uuid,
  }));
}
