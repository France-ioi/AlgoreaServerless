import { clearTable } from '../../testutils/db';
import { ThreadToken, RequestWithThreadToken } from '../thread-token';

const mockSend = jest.fn();

jest.mock('../../websocket-client', () => ({
  ...jest.requireActual('../../websocket-client'),
  wsClient: { send: mockSend },
}));

import { getAllMessages, createMessage } from './messages';
import { ThreadEvents } from '../../dbmodels/forum/thread-events';
import { ThreadSubscriptions } from '../../dbmodels/forum/thread-subscriptions';
import { dynamodb } from '../../dynamodb';

/** Helper to create a mock request with threadToken already set (as middleware would do) */
function mockRequest(token: ThreadToken, extras: Partial<RequestWithThreadToken> = {}): RequestWithThreadToken {
  return {
    threadToken: token,
    headers: {},
    query: {},
    body: {},
    ...extras,
  } as RequestWithThreadToken;
}

describe('Forum Messages Service', () => {
  let threadEvents: ThreadEvents;
  let threadSubs: ThreadSubscriptions;
  const threadId = { participantId: 'user123', itemId: 'item456' };

  beforeEach(async () => {
    threadEvents = new ThreadEvents(dynamodb);
    threadSubs = new ThreadSubscriptions(dynamodb);
    await clearTable();
    jest.clearAllMocks();
    mockSend.mockImplementation((connectionIds) =>
      Promise.resolve(connectionIds.map((id: string) => ({ success: true, connectionId: id }))));
  });

  describe('getAllMessages', () => {
    const baseToken: ThreadToken = { ...threadId, userId: 'user123', canWrite: false, canWatch: true, isMine: false };

    it('should return empty array when no messages exist', async () => {
      const req = mockRequest(baseToken);
      const resp = {} as any;
      const result = await getAllMessages(req, resp);
      expect(result).toEqual([]);
    });

    it('should return messages for a thread', async () => {
      const time1 = Date.now();
      const time2 = time1 + 1000;

      await threadEvents.insert([
        {
          threadId,
          sk: time1,
          label: 'forum.message' as any,
          data: { authorId: 'user1', text: 'First message', uuid: 'uuid-1' },
        },
        {
          threadId,
          sk: time2,
          label: 'forum.message' as any,
          data: { authorId: 'user2', text: 'Second message', uuid: 'uuid-2' },
        },
      ]);

      const req = mockRequest(baseToken);
      const resp = {} as any;
      const result = await getAllMessages(req, resp);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        time: time2,
        authorId: 'user2',
        text: 'Second message',
        uuid: 'uuid-2',
      });
      expect(result[1]).toMatchObject({
        time: time1,
        authorId: 'user1',
        text: 'First message',
        uuid: 'uuid-1',
      });
    });

    it('should respect limit parameter', async () => {
      const messages = Array.from({ length: 15 }, (_, i) => ({
        threadId,
        sk: Date.now() + i,
        label: 'forum.message' as any,
        data: { authorId: `user${i}`, text: `Message ${i}`, uuid: `uuid-${i}` },
      }));
      await threadEvents.insert(messages);

      const req = mockRequest(baseToken, { query: { limit: '5' } });
      const resp = {} as any;
      const result = await getAllMessages(req, resp);
      expect(result).toHaveLength(5);
    });

    it('should use default limit when not specified', async () => {
      const messages = Array.from({ length: 15 }, (_, i) => ({
        threadId,
        sk: Date.now() + i,
        label: 'forum.message' as any,
        data: { authorId: `user${i}`, text: `Message ${i}`, uuid: `uuid-${i}` },
      }));
      await threadEvents.insert(messages);

      const req = mockRequest(baseToken);
      const resp = {} as any;
      const result = await getAllMessages(req, resp);
      expect(result).toHaveLength(10); // Default limit
    });

    it('should enforce maximum limit', async () => {
      const messages = Array.from({ length: 25 }, (_, i) => ({
        threadId,
        sk: Date.now() + i,
        label: 'forum.message' as any,
        data: { authorId: `user${i}`, text: `Message ${i}`, uuid: `uuid-${i}` },
      }));
      await threadEvents.insert(messages);

      const req = mockRequest(baseToken, { query: { limit: '50' } }); // Requesting more than max
      const resp = {} as any;
      await expect(getAllMessages(req, resp)).rejects.toThrow();
    });
  });

  describe('createMessage', () => {
    const writeToken: ThreadToken = { ...threadId, userId: 'user123', canWrite: true, canWatch: true, isMine: false };
    const readOnlyToken: ThreadToken = { ...threadId, userId: 'user123', canWrite: false, canWatch: true, isMine: false };

    it('should create a message and return 201', async () => {
      const req = mockRequest(writeToken, { body: { text: 'New message', uuid: 'msg-uuid-1' } });
      const resp = {
        status: jest.fn(function(this: any) {
          return this;
        }),
        send: jest.fn(),
      } as any;

      await createMessage(req, resp);

      expect(resp.status).toHaveBeenCalledWith(201);

      const messages = await threadEvents.getAllMessages(threadId, { limit: 10 });
      expect(messages).toHaveLength(1);
      expect(messages[0]?.data).toMatchObject({
        authorId: 'user123',
        text: 'New message',
        uuid: 'msg-uuid-1',
      });
    });

    it('should throw Forbidden when canWrite is false', async () => {
      const req = mockRequest(readOnlyToken, { body: { text: 'New message', uuid: 'msg-uuid-1' } });
      const resp = {} as any;

      await expect(createMessage(req, resp)).rejects.toThrow('This operation required canWrite');
    });

    it('should notify all subscribers when message is created', async () => {
      await threadSubs.subscribe(threadId, 'conn-1', 'user1');
      await threadSubs.subscribe(threadId, 'conn-2', 'user2');

      const req = mockRequest(writeToken, { body: { text: 'New message', uuid: 'msg-uuid-1' } });
      const resp = {
        status: jest.fn(function(this: any) {
          return this;
        }),
        send: jest.fn(),
      } as any;

      await createMessage(req, resp);

      expect(mockSend).toHaveBeenCalledWith(
        expect.arrayContaining([ 'conn-1', 'conn-2' ]),
        expect.objectContaining({
          action: 'forum.message.new',
          participantId: threadId.participantId,
          itemId: threadId.itemId,
          authorId: 'user123',
          text: 'New message',
          uuid: 'msg-uuid-1',
        })
      );
    });

    it('should remove gone subscribers after sending message', async () => {
      await threadSubs.subscribe(threadId, 'conn-1', 'user1');
      await threadSubs.subscribe(threadId, 'conn-gone', 'user2');
      await threadSubs.subscribe(threadId, 'conn-3', 'user3');

      mockSend.mockImplementation((connectionIds) => Promise.resolve(connectionIds.map((id: string) => {
        if (id === 'conn-gone') {
          const error = new Error('Gone');
          error.name = 'GoneException';
          return { success: false, connectionId: id, error };
        }
        return { success: true, connectionId: id };
      })));

      const req = mockRequest(writeToken, { body: { text: 'New message', uuid: 'msg-uuid-1' } });
      const resp = {
        status: jest.fn(function(this: any) {
          return this;
        }),
        send: jest.fn(),
      } as any;

      await createMessage(req, resp);

      // Wait a bit for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const subscribers = await threadSubs.getSubscribers({ threadId });
      expect(subscribers).toHaveLength(2);
      expect(subscribers.map(s => s.connectionId)).not.toContain('conn-gone');
    });

    it('should validate request body', async () => {
      const req = mockRequest(writeToken, { body: { text: 'New message' } }); // Missing uuid
      const resp = {} as any;

      await expect(createMessage(req, resp)).rejects.toThrow();
    });
  });
});

