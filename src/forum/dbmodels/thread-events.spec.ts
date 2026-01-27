import { ThreadEvents, ThreadEventLabel } from './thread-events';
import { dynamodb } from '../../dynamodb';
import { clearTable } from '../../testutils/db';
import { ThreadId } from './thread';

describe('ThreadEvents', () => {
  let threadEvents: ThreadEvents;
  const threadId: ThreadId = { participantId: 'user123', itemId: 'item456' };

  beforeEach(async () => {
    threadEvents = new ThreadEvents(dynamodb);
    await clearTable();
  });

  describe('insert', () => {
    it('should insert a single message event', async () => {
      const event = {
        threadId,
        sk: Date.now(),
        label: ThreadEventLabel.Message,
        data: {
          authorId: 'user123',
          text: 'Hello world',
          uuid: 'msg-uuid-1',
        },
      };

      await threadEvents.insert([ event ]);

      const messages = await threadEvents.getAllMessages(threadId, { limit: 10 });
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        sk: event.sk,
        label: ThreadEventLabel.Message,
        data: event.data,
      });
    });

    it('should insert multiple message events', async () => {
      const events = [
        {
          threadId,
          sk: Date.now(),
          label: ThreadEventLabel.Message,
          data: { authorId: 'user1', text: 'First message', uuid: 'msg-1' },
        },
        {
          threadId,
          sk: Date.now() + 1,
          label: ThreadEventLabel.Message,
          data: { authorId: 'user2', text: 'Second message', uuid: 'msg-2' },
        },
        {
          threadId,
          sk: Date.now() + 2,
          label: ThreadEventLabel.Message,
          data: { authorId: 'user3', text: 'Third message', uuid: 'msg-3' },
        },
      ];

      await threadEvents.insert(events);

      const messages = await threadEvents.getAllMessages(threadId, { limit: 10 });
      expect(messages).toHaveLength(3);
    });
  });

  describe('getAllMessages', () => {
    beforeEach(async () => {
      const events = Array.from({ length: 5 }, (_, i) => ({
        threadId,
        sk: Date.now() + i,
        label: ThreadEventLabel.Message,
        data: {
          authorId: `user${i}`,
          text: `Message ${i}`,
          uuid: `msg-${i}`,
        },
      }));
      await threadEvents.insert(events);
    });

    it('should retrieve all messages for a thread', async () => {
      const messages = await threadEvents.getAllMessages(threadId, { limit: 10 });
      expect(messages).toHaveLength(5);
    });

    it('should return messages in descending order by timestamp', async () => {
      const messages = await threadEvents.getAllMessages(threadId, { limit: 10 });
      for (let i = 1; i < messages.length; i++) {
        expect(messages[i - 1]?.sk).toBeGreaterThan(messages[i]?.sk || 0);
      }
    });

    it('should respect the limit parameter', async () => {
      const messages = await threadEvents.getAllMessages(threadId, { limit: 3 });
      expect(messages).toHaveLength(3);
    });

    it('should return empty array for thread with no messages', async () => {
      const emptyThreadId: ThreadId = { participantId: 'user999', itemId: 'item999' };
      const messages = await threadEvents.getAllMessages(emptyThreadId, { limit: 10 });
      expect(messages).toEqual([]);
    });

    it('should only return message events', async () => {
      const messages = await threadEvents.getAllMessages(threadId, { limit: 10 });
      messages.forEach(msg => {
        expect(msg.label).toBe(ThreadEventLabel.Message);
      });
    });
  });

  describe('thread isolation', () => {
    it('should isolate messages between different threads', async () => {
      const thread1: ThreadId = { participantId: 'user1', itemId: 'item1' };
      const thread2: ThreadId = { participantId: 'user2', itemId: 'item2' };

      await threadEvents.insert([
        {
          threadId: thread1,
          sk: Date.now(),
          label: ThreadEventLabel.Message,
          data: { authorId: 'user1', text: 'Thread 1 message', uuid: 'msg-t1' },
        },
        {
          threadId: thread2,
          sk: Date.now(),
          label: ThreadEventLabel.Message,
          data: { authorId: 'user2', text: 'Thread 2 message', uuid: 'msg-t2' },
        },
      ]);

      const thread1Messages = await threadEvents.getAllMessages(thread1, { limit: 10 });
      const thread2Messages = await threadEvents.getAllMessages(thread2, { limit: 10 });

      expect(thread1Messages).toHaveLength(1);
      expect(thread2Messages).toHaveLength(1);
      expect(thread1Messages[0]?.data.text).toBe('Thread 1 message');
      expect(thread2Messages[0]?.data.text).toBe('Thread 2 message');
    });
  });
});

