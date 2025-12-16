import { ThreadId } from '../dbmodels/forum/thread';
import { ThreadEventLabel } from '../dbmodels/forum/thread-events';
import { ConnectionId } from '../websocket-client';
import { loadFixture } from './db';
import { v4 as uuidv4 } from 'uuid';

/**
 * Create a thread ID for testing
 */
export const createThreadId = (suffix: string | number = 'test'): ThreadId => ({
  participantId: `participant-${suffix}`,
  itemId: `item-${suffix}`,
});

/**
 * Generate test message data
 */
export const createMessages = (count: number, threadId: ThreadId, baseTime: number = Date.now()): Array<{
  pk: string,
  sk: number,
  label: string,
  data: {
    authorId: string,
    text: string,
    uuid: string,
  },
}> => {
  const stage = process.env.STAGE || 'test';
  const pk = `${stage}#THREAD#${threadId.participantId}#${threadId.itemId}#EVENTS`;

  return Array.from({ length: count }, (_, i) => ({
    pk,
    sk: baseTime + i * 1000, // Each message 1 second apart
    label: ThreadEventLabel.Message,
    data: {
      authorId: `user-${i}`,
      text: `Test message ${i}`,
      uuid: uuidv4(),
    },
  }));
};

/**
 * Generate test subscription data
 */
export const createSubscriptions = (connectionIds: ConnectionId[], threadId: ThreadId, baseTime: number = Date.now()): Array<{
  pk: string,
  sk: number,
  connectionId: ConnectionId,
  userId: string,
  ttl: number,
}> => {
  const stage = process.env.STAGE || 'test';
  const pk = `${stage}#THREAD#${threadId.participantId}#${threadId.itemId}#SUB`;
  const ttl = Math.floor(Date.now() / 1000) + 7200; // 2 hours from now

  return connectionIds.map((connectionId, i) => ({
    pk,
    sk: baseTime + i * 1000,
    connectionId,
    userId: `user-${i}`,
    ttl,
  }));
};

/**
 * Load thread events (messages) into the database
 */
export const loadThreadEvents = async (threadId: ThreadId, count: number, baseTime?: number): Promise<void> => {
  const messages = createMessages(count, threadId, baseTime);
  await loadFixture(messages);
};

/**
 * Load subscriptions into the database
 */
export const loadSubscriptions = async (connectionIds: ConnectionId[], threadId: ThreadId, baseTime?: number): Promise<void> => {
  const subscriptions = createSubscriptions(connectionIds, threadId, baseTime);
  await loadFixture(subscriptions);
};

/**
 * Create a simple test message
 */
export const createSimpleMessage = (authorId: string, text: string, uuid?: string): {
  authorId: string,
  text: string,
  uuid: string,
} => ({
  authorId,
  text,
  uuid: uuid || uuidv4(),
});

