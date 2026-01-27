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
import { ThreadFollows } from '../../dbmodels/forum/thread-follows';
import { Notifications } from '../../dbmodels/notifications';
import { UserConnections } from '../../dbmodels/user-connections';
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
  let userConnections: UserConnections;
  const threadId = { participantId: 'user123', itemId: 'item456' };

  beforeEach(async () => {
    threadEvents = new ThreadEvents(dynamodb);
    threadSubs = new ThreadSubscriptions(dynamodb);
    userConnections = new UserConnections(dynamodb);
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
      // Set up user connections with subscriptions (needed for full cleanup)
      await userConnections.insert('conn-1', 'user1');
      await userConnections.insert('conn-gone', 'user2');
      await userConnections.insert('conn-3', 'user3');

      const subKeys1 = await threadSubs.subscribe(threadId, 'conn-1', 'user1');
      const subKeysGone = await threadSubs.subscribe(threadId, 'conn-gone', 'user2');
      const subKeys3 = await threadSubs.subscribe(threadId, 'conn-3', 'user3');

      await userConnections.updateConnectionInfo('conn-1', { subscriptionKeys: subKeys1 });
      await userConnections.updateConnectionInfo('conn-gone', { subscriptionKeys: subKeysGone });
      await userConnections.updateConnectionInfo('conn-3', { subscriptionKeys: subKeys3 });

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

      // Verify user connection was also cleaned up
      const goneUserConns = await userConnections.getAll('user2');
      expect(goneUserConns).toHaveLength(0);
    });

    it('should validate request body', async () => {
      const req = mockRequest(writeToken, { body: { text: 'New message' } }); // Missing uuid
      const resp = {} as any;

      await expect(createMessage(req, resp)).rejects.toThrow();
    });
  });

  describe('createMessage with followers', () => {
    let threadFollows: ThreadFollows;
    let notifications: Notifications;
    let userConnections: UserConnections;
    const writeToken: ThreadToken = { ...threadId, userId: 'author-user', canWrite: true, canWatch: true, isMine: false };

    beforeEach(() => {
      threadFollows = new ThreadFollows(dynamodb);
      notifications = new Notifications(dynamodb);
      userConnections = new UserConnections(dynamodb);
    });

    it('should notify followers who are not subscribers', async () => {
      // Follower with no active subscription
      await threadFollows.follow(threadId, 'follower-user');
      // Also add a connection for the follower so we can verify the WS notification
      await userConnections.insert('follower-conn', 'follower-user');

      const req = mockRequest(writeToken, { body: { text: 'New message', uuid: 'msg-uuid-1' } });
      const resp = {
        status: jest.fn(function(this: any) {
          return this;
        }),
        send: jest.fn(),
      } as any;

      await createMessage(req, resp);

      // Verify notification was created for follower
      const followerNotifs = await notifications.getNotifications('follower-user', 10);
      expect(followerNotifs).toHaveLength(1);
      expect(followerNotifs[0]?.notificationType).toBe('forum.new_message');
      expect(followerNotifs[0]?.payload).toMatchObject({
        participantId: threadId.participantId,
        itemId: threadId.itemId,
        authorId: 'author-user',
        text: 'New message',
        uuid: 'msg-uuid-1',
      });
    });

    it('should exclude author from follower notifications', async () => {
      // Author is also a follower
      await threadFollows.follow(threadId, 'author-user');

      const req = mockRequest(writeToken, { body: { text: 'New message', uuid: 'msg-uuid-1' } });
      const resp = {
        status: jest.fn(function(this: any) {
          return this;
        }),
        send: jest.fn(),
      } as any;

      await createMessage(req, resp);

      // Verify no notification was created for the author
      const authorNotifs = await notifications.getNotifications('author-user', 10);
      expect(authorNotifs).toHaveLength(0);
    });

    it('should exclude successful subscribers from follower notifications', async () => {
      // User is both a follower and an active subscriber
      await threadFollows.follow(threadId, 'subscriber-user');
      await threadSubs.subscribe(threadId, 'sub-conn', 'subscriber-user');

      const req = mockRequest(writeToken, { body: { text: 'New message', uuid: 'msg-uuid-1' } });
      const resp = {
        status: jest.fn(function(this: any) {
          return this;
        }),
        send: jest.fn(),
      } as any;

      await createMessage(req, resp);

      // Verify no notification was created (they received WS message via subscription)
      const userNotifs = await notifications.getNotifications('subscriber-user', 10);
      expect(userNotifs).toHaveLength(0);
    });

    it('should notify followers whose subscription connection was gone', async () => {
      // User is both a follower and a subscriber, but their connection is gone
      await threadFollows.follow(threadId, 'gone-subscriber');
      await threadSubs.subscribe(threadId, 'gone-conn', 'gone-subscriber');
      await userConnections.insert('other-conn', 'gone-subscriber');

      mockSend.mockImplementation((connectionIds) => Promise.resolve(connectionIds.map((id: string) => {
        if (id === 'gone-conn') {
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

      // Verify notification was created (their subscription WS failed)
      const userNotifs = await notifications.getNotifications('gone-subscriber', 10);
      expect(userNotifs).toHaveLength(1);
      expect(userNotifs[0]?.notificationType).toBe('forum.new_message');
    });

    it('should notify multiple followers correctly', async () => {
      // Set up various scenarios
      await threadFollows.follow(threadId, 'follower-only');
      await threadFollows.follow(threadId, 'subscriber-and-follower');
      await threadFollows.follow(threadId, 'author-user'); // author is also a follower

      // subscriber-and-follower has an active subscription
      await threadSubs.subscribe(threadId, 'sub-conn', 'subscriber-and-follower');

      const req = mockRequest(writeToken, { body: { text: 'New message', uuid: 'msg-uuid-1' } });
      const resp = {
        status: jest.fn(function(this: any) {
          return this;
        }),
        send: jest.fn(),
      } as any;

      await createMessage(req, resp);

      // Only follower-only should get a notification
      const followerOnlyNotifs = await notifications.getNotifications('follower-only', 10);
      const subscriberNotifs = await notifications.getNotifications('subscriber-and-follower', 10);
      const authorNotifs = await notifications.getNotifications('author-user', 10);

      expect(followerOnlyNotifs).toHaveLength(1);
      expect(subscriberNotifs).toHaveLength(0); // Got WS message via subscription
      expect(authorNotifs).toHaveLength(0); // Is the author
    });
  });
});

