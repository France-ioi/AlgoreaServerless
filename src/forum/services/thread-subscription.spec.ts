import { subscribe, unsubscribe } from './thread-subscription';
import { ThreadSubscriptions } from '../../dbmodels/forum/thread-subscriptions';
import { dynamodb } from '../../dynamodb';
import { clearTable } from '../../testutils/db';
import { generateToken, initializeKeys } from '../../testutils/token-generator';
import { WsRequest } from '../../utils/lambda-ws-server';

describe('Thread Subscription Service', () => {
  let threadSubs: ThreadSubscriptions;
  const threadId = { participantId: 'user123', itemId: 'item456' };

  beforeAll(async () => {
    await initializeKeys();
  });

  beforeEach(async () => {
    threadSubs = new ThreadSubscriptions(dynamodb);
    await clearTable();
  });

  describe('subscribe', () => {
    it('should subscribe a connection to a thread', async () => {
      const token = await generateToken({ ...threadId, userId: 'user123', canWrite: false });
      const request = {
        connectionId: () => 'conn-123',
        body: { token },
      } as unknown as WsRequest;

      await subscribe(request);

      const subscribers = await threadSubs.getSubscribers(threadId);
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0]?.connectionId).toBe('conn-123');
    });

    it('should allow multiple connections to subscribe', async () => {
      const token1 = await generateToken({ ...threadId, userId: 'user1', canWrite: false });
      const token2 = await generateToken({ ...threadId, userId: 'user2', canWrite: false });

      const request1 = {
        connectionId: () => 'conn-1',
        body: { token: token1 },
      } as unknown as WsRequest;

      const request2 = {
        connectionId: () => 'conn-2',
        body: { token: token2 },
      } as unknown as WsRequest;

      await subscribe(request1);
      await subscribe(request2);

      const subscribers = await threadSubs.getSubscribers(threadId);
      expect(subscribers).toHaveLength(2);
      expect(subscribers.map(s => s.connectionId).sort()).toEqual([ 'conn-1', 'conn-2' ]);
    });

    it('should throw error for invalid token', async () => {
      const request = {
        connectionId: () => 'conn-123',
        body: { token: 'invalid-token' },
      } as unknown as WsRequest;

      await expect(subscribe(request)).rejects.toThrow();
    });

    it('should throw error when token is missing', async () => {
      const request = {
        connectionId: () => 'conn-123',
        body: {},
      } as unknown as WsRequest;

      await expect(subscribe(request)).rejects.toThrow();
    });
  });

  describe('unsubscribe', () => {
    // SKIP: These tests call unsubscribeConnectionId() which uses getSubscriber() with LIMIT clause
    // DynamoDB Local doesn't support LIMIT with non-key attribute filters
    it.skip('should unsubscribe a connection from a thread', async () => {
      const token = await generateToken({ ...threadId, userId: 'user123', canWrite: false });

      // First subscribe
      const subscribeRequest = {
        connectionId: () => 'conn-123',
        body: { token },
      } as unknown as WsRequest;
      await subscribe(subscribeRequest);

      let subscribers = await threadSubs.getSubscribers(threadId);
      expect(subscribers).toHaveLength(1);

      // Then unsubscribe
      const unsubscribeRequest = {
        connectionId: () => 'conn-123',
        body: { token },
      } as unknown as WsRequest;
      await unsubscribe(unsubscribeRequest);

      subscribers = await threadSubs.getSubscribers(threadId);
      expect(subscribers).toHaveLength(0);
    });

    it.skip('should not affect other subscriptions when unsubscribing', async () => {
      const token1 = await generateToken({ ...threadId, userId: 'user1', canWrite: false });
      const token2 = await generateToken({ ...threadId, userId: 'user2', canWrite: false });
      const token3 = await generateToken({ ...threadId, userId: 'user3', canWrite: false });

      // Subscribe three connections
      await subscribe({ connectionId: () => 'conn-1', body: { token: token1 } } as unknown as WsRequest);
      await subscribe({ connectionId: () => 'conn-2', body: { token: token2 } } as unknown as WsRequest);
      await subscribe({ connectionId: () => 'conn-3', body: { token: token3 } } as unknown as WsRequest);

      // Unsubscribe one
      await unsubscribe({ connectionId: () => 'conn-2', body: { token: token2 } } as unknown as WsRequest);

      const subscribers = await threadSubs.getSubscribers(threadId);
      expect(subscribers).toHaveLength(2);
      expect(subscribers.map(s => s.connectionId).sort()).toEqual([ 'conn-1', 'conn-3' ]);
    });

    it.skip('should handle unsubscribing from non-existent subscription gracefully', async () => {
      const token = await generateToken({ ...threadId, userId: 'user123', canWrite: false });
      const request = {
        connectionId: () => 'non-existent-conn',
        body: { token },
      } as unknown as WsRequest;

      await expect(unsubscribe(request)).resolves.not.toThrow();
    });

    it('should throw error for invalid token', async () => {
      const request = {
        connectionId: () => 'conn-123',
        body: { token: 'invalid-token' },
      } as unknown as WsRequest;

      await expect(unsubscribe(request)).rejects.toThrow();
    });
  });
});

