import { subscribe, unsubscribe } from './thread-subscription';
import { ThreadSubscriptions } from '../dbmodels/thread-subscriptions';
import { docClient } from '../../dynamodb';
import { clearTable } from '../../testutils/db';
import { generateToken, initializeKeys } from '../../testutils/token-generator';
import { WsRequest } from '../../utils/lambda-ws-server';

// Valid base64 connectionIds (first byte must be non-zero for number encoding round-trip)
const connA = 'AQ==';
const connB = 'Ag==';
const connC = 'Aw==';

describe('Thread Subscription Service', () => {
  let threadSubs: ThreadSubscriptions;
  const threadId = { participantId: 'user123', itemId: 'item456' };

  beforeAll(async () => {
    await initializeKeys();
  });

  beforeEach(async () => {
    threadSubs = new ThreadSubscriptions(docClient);
    await clearTable();
  });

  describe('subscribe', () => {
    it('should subscribe a connection to a thread', async () => {
      const token = await generateToken({ ...threadId, userId: 'user123', canWrite: false });
      const request = {
        connectionId: () => connA,
        body: { token },
      } as unknown as WsRequest;

      await subscribe(request);

      const subscribers = await threadSubs.getSubscribers(threadId);
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0]?.connectionId).toBe(connA);
    });

    it('should allow multiple connections to subscribe', async () => {
      const token1 = await generateToken({ ...threadId, userId: 'user1', canWrite: false });
      const token2 = await generateToken({ ...threadId, userId: 'user2', canWrite: false });

      const request1 = {
        connectionId: () => connA,
        body: { token: token1 },
      } as unknown as WsRequest;

      const request2 = {
        connectionId: () => connB,
        body: { token: token2 },
      } as unknown as WsRequest;

      await subscribe(request1);
      await subscribe(request2);

      const subscribers = await threadSubs.getSubscribers(threadId);
      expect(subscribers).toHaveLength(2);
      expect(subscribers.map(s => s.connectionId).sort()).toEqual([ connA, connB ].sort());
    });

    it('should throw error for invalid token', async () => {
      const request = {
        connectionId: () => connA,
        body: { token: 'invalid-token' },
      } as unknown as WsRequest;

      await expect(subscribe(request)).rejects.toThrow();
    });

    it('should throw error when token is missing', async () => {
      const request = {
        connectionId: () => connA,
        body: {},
      } as unknown as WsRequest;

      await expect(subscribe(request)).rejects.toThrow();
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe a connection from a thread', async () => {
      const token = await generateToken({ ...threadId, userId: 'user123', canWrite: false });

      const subscribeRequest = {
        connectionId: () => connA,
        body: { token },
      } as unknown as WsRequest;
      await subscribe(subscribeRequest);

      let subscribers = await threadSubs.getSubscribers(threadId);
      expect(subscribers).toHaveLength(1);

      const unsubscribeRequest = {
        connectionId: () => connA,
        body: { token },
      } as unknown as WsRequest;
      await unsubscribe(unsubscribeRequest);

      subscribers = await threadSubs.getSubscribers(threadId);
      expect(subscribers).toHaveLength(0);
    });

    it('should not affect other subscriptions when unsubscribing', async () => {
      const token1 = await generateToken({ ...threadId, userId: 'user1', canWrite: false });
      const token2 = await generateToken({ ...threadId, userId: 'user2', canWrite: false });
      const token3 = await generateToken({ ...threadId, userId: 'user3', canWrite: false });

      await subscribe({ connectionId: () => connA, body: { token: token1 } } as unknown as WsRequest);
      await subscribe({ connectionId: () => connB, body: { token: token2 } } as unknown as WsRequest);
      await subscribe({ connectionId: () => connC, body: { token: token3 } } as unknown as WsRequest);

      await unsubscribe({ connectionId: () => connB, body: { token: token2 } } as unknown as WsRequest);

      const subscribers = await threadSubs.getSubscribers(threadId);
      expect(subscribers).toHaveLength(2);
      expect(subscribers.map(s => s.connectionId).sort()).toEqual([ connA, connC ].sort());
    });

    it('should handle unsubscribing from non-existent subscription gracefully', async () => {
      const token = await generateToken({ ...threadId, userId: 'user123', canWrite: false });
      const request = {
        connectionId: () => connA,
        body: { token },
      } as unknown as WsRequest;

      await expect(unsubscribe(request)).resolves.not.toThrow();
    });

    it('should throw error for invalid token', async () => {
      const request = {
        connectionId: () => connA,
        body: { token: 'invalid-token' },
      } as unknown as WsRequest;

      await expect(unsubscribe(request)).rejects.toThrow();
    });
  });
});
