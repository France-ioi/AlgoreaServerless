import { ThreadSubscriptions } from '../../dbmodels/forum/thread-subscriptions';
import { ThreadEventLabel, ThreadEvents } from '../../dbmodels/forum/thread-events';
import { dynamodb } from '../../dynamodb';
import { Forbidden } from '../../utils/errors';
import { z } from 'zod';
import { ForumMessageAction, isClosedConnection, logSendResults, wsClient } from '../../websocket-client';
import { HandlerFunction, Request, Response } from 'lambda-api';
import { extractToken } from '../token';

const subscriptions = new ThreadSubscriptions(dynamodb);
const threadEvents = new ThreadEvents(dynamodb);

async function create(req: Request, resp: Response): Promise<void> {
  const { participantId, itemId, userId, canWrite } = await extractToken(req.headers);
  if (!canWrite) throw new Forbidden('This operation required canWrite');

  const threadId = { participantId, itemId };
  const { text, uuid } = z.object({ text: z.string(), uuid: z.string() }).parse(req.body);
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
  resp.sendStatus(201);
}

const defaultLimit = 10;
const maxLimit = 20;

async function getAll(req: Request): Promise<{ time: number, text: string, authorId: string, uuid: string }[]> {
  const token = await extractToken(req.headers);
  const { canWatch, isMine } = token;
  if (!canWatch && !isMine) throw new Forbidden(`This operation required canWatch or isMine, got ${JSON.stringify(token)} `);
  const limit = z.number().positive().max(maxLimit).default(defaultLimit).parse(+(req.query['limit']||''));

  const messages = await threadEvents.getAllMessages(token, { limit });
  return messages.map(m => ({
    time: m.sk,
    authorId: m.data.authorId,
    text: m.data.text,
    uuid: m.data.uuid,
  }));
}

export const getAllMessages: HandlerFunction = getAll;
export const createMessage: HandlerFunction = create;
