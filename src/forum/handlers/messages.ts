import { ThreadSubscriptions } from '../../dbmodels/forum/thread-subscriptions';
import { ThreadEventLabel, ThreadEvents } from '../../dbmodels/forum/thread-events';
import { dynamodb } from '../../dynamodb';
import { DecodingError, Forbidden } from '../../utils/errors';
import { z, ZodError } from 'zod';
import { isClosedConnection, logSendResults, wsClient } from '../../websocket-client';
import { ForumMessageAction } from '../ws-messages';
import { HandlerFunction, Response } from 'lambda-api';
import { RequestWithThreadToken } from '../thread-token';
import { created } from '../../utils/rest-responses';

const subscriptions = new ThreadSubscriptions(dynamodb);
const threadEvents = new ThreadEvents(dynamodb);

async function create(req: RequestWithThreadToken, resp: Response): Promise<ReturnType<typeof created>> {
  const { participantId, itemId, userId, canWrite } = req.threadToken;
  if (!canWrite) throw new Forbidden('This operation required canWrite');

  const threadId = { participantId, itemId };
  let text: string, uuid: string;
  try {
    ({ text, uuid } = z.object({ text: z.string(), uuid: z.string() }).parse(req.body));
  } catch (err) {
    if (err instanceof ZodError) throw new DecodingError(JSON.stringify(err.issues));
    throw err;
  }
  const time = Date.now();
  const authorId = userId;

  await Promise.all([
    // create the entry
    threadEvents.insert([{ label: ThreadEventLabel.Message, sk: time, threadId, data: { authorId, text, uuid } }]),
    // notify all subscribers
    subscriptions.getSubscribers({ threadId }).then(async subscribers => {
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
  return created(resp);
}

const defaultLimit = 10;
const maxLimit = 20;

async function getAll(req: RequestWithThreadToken): Promise<{ time: number, text: string, authorId: string, uuid: string }[]> {
  const { threadToken } = req;
  const limitParam = req.query['limit'] ? +req.query['limit'] : undefined;
  let limit: number;
  try {
    limit = z.number().positive().max(maxLimit).default(defaultLimit).parse(limitParam);
  } catch (err) {
    if (err instanceof ZodError) throw new DecodingError(JSON.stringify(err.issues));
    throw err;
  }

  const messages = await threadEvents.getAllMessages(threadToken, { limit });
  return messages.map(m => ({
    time: m.sk,
    authorId: m.data.authorId,
    text: m.data.text,
    uuid: m.data.uuid,
  }));
}

export const getAllMessages = getAll as unknown as HandlerFunction;
export const createMessage = create as unknown as HandlerFunction;
