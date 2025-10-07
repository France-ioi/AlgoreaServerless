import { ALBEvent, ALBResult } from 'aws-lambda';
import { ForumToken } from '../../handlers/forum-parse';
import { ThreadSubscriptions } from '../../dbmodels/forum/thread-subscriptions';
import { ThreadEvents } from '../../dbmodels/forum/thread-events';
import { dynamodb } from '../../dynamodb';
import { DecodingError, Forbidden } from '../../utils/errors';
import { z } from 'zod';
import { isClosedConnection, logSendResults, wsClient } from '../../websocket-client';
import { created } from '../../utils/responses';
import { ReqBody, ReqQueryParams } from '../../handlers/common';

const subscriptions = new ThreadSubscriptions(dynamodb);
const threadEvents = new ThreadEvents(dynamodb);

export async function createMessage(token: ForumToken, body: ReqBody, _queryParams: ReqQueryParams): Promise<ALBResult> {
  const { participantId, itemId, userId, canWrite } = token;
  if (!canWrite) throw new Forbidden(`This operation required canWrite, got ${JSON.stringify(token)} `);
  if (!body) throw new DecodingError('Missing body');

  const threadId = { participantId, itemId };
  const { text } = z.object({ text: z.string() }).parse(JSON.parse(body));
  const time = Date.now();
  const authorId = userId;
  const label = 'message';

  await Promise.all([
    // create the entry
    threadEvents.insert([{ sk: time, label, threadId, data: { authorId, text } }]),
    // notify all subscribers
    subscriptions.getSubscribers(threadId).then(async subscribers => {
      const wsMessage = { label, participantId, itemId, authorId, time, text };
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
  Promise<{ time: number, text: string, authorId: string }[]> {
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
  }));
}
