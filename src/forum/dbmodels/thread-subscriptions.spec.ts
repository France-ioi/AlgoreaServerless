import { ThreadSubscriptions } from './thread-subscriptions';
import { docClient } from '../../dynamodb';
import { clearTable } from '../../testutils/db';
import { ThreadId } from './thread';

// Valid base64 connectionIds (first byte must be non-zero for number encoding round-trip)
const connA = 'AQ==';
const connB = 'Ag==';
const connC = 'Aw==';

describe('ThreadSubscriptions', () => {
  let threadSubs: ThreadSubscriptions;
  const threadId: ThreadId = { participantId: 'user123', itemId: 'item456' };

  beforeEach(async () => {
    threadSubs = new ThreadSubscriptions(docClient);
    await clearTable();
  });

  describe('insert', () => {
    it('should insert a subscription for a connection to a thread', async () => {
      await threadSubs.insert(threadId, connA, 'user-123');

      const subscribers = await threadSubs.getSubscribers(threadId);
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0]?.connectionId).toBe(connA);
    });

    it('should allow inserting multiple subscriptions to the same thread', async () => {
      await threadSubs.insert(threadId, connA, 'user-1');
      await threadSubs.insert(threadId, connB, 'user-2');
      await threadSubs.insert(threadId, connC, 'user-3');

      const subscribers = await threadSubs.getSubscribers(threadId);
      expect(subscribers).toHaveLength(3);
      expect(subscribers.map(s => s.connectionId).sort()).toEqual([ connA, connB, connC ].sort());
    });
  });

  describe('getSubscribers', () => {
    it('should return empty array for thread with no subscribers', async () => {
      const subscribers = await threadSubs.getSubscribers(threadId);
      expect(subscribers).toEqual([]);
    });

    it('should return all subscribers for a thread', async () => {
      await threadSubs.insert(threadId, connA, 'user-1');
      await threadSubs.insert(threadId, connB, 'user-2');

      const subscribers = await threadSubs.getSubscribers(threadId);
      expect(subscribers).toHaveLength(2);
    });
  });

  describe('deleteByConnectionId', () => {
    it('should delete a subscription by connection id', async () => {
      await threadSubs.insert(threadId, connA, 'user-123');

      let subscribers = await threadSubs.getSubscribers(threadId);
      expect(subscribers).toHaveLength(1);

      await threadSubs.deleteByConnectionId(threadId, connA);

      subscribers = await threadSubs.getSubscribers(threadId);
      expect(subscribers).toHaveLength(0);
    });

    it('should not affect other subscriptions when deleting one', async () => {
      await threadSubs.insert(threadId, connA, 'user-1');
      await threadSubs.insert(threadId, connB, 'user-2');
      await threadSubs.insert(threadId, connC, 'user-3');

      await threadSubs.deleteByConnectionId(threadId, connB);

      const subscribers = await threadSubs.getSubscribers(threadId);
      expect(subscribers).toHaveLength(2);
      expect(subscribers.map(s => s.connectionId).sort()).toEqual([ connA, connC ].sort());
    });

    it('should handle deleting non-existent subscription gracefully', async () => {
      await expect(
        threadSubs.deleteByConnectionId(threadId, connA)
      ).resolves.not.toThrow();
    });
  });

  describe('thread isolation', () => {
    it('should isolate subscriptions between different threads', async () => {
      const thread1: ThreadId = { participantId: 'user1', itemId: 'item1' };
      const thread2: ThreadId = { participantId: 'user2', itemId: 'item2' };

      await threadSubs.insert(thread1, connA, 'user-1');
      await threadSubs.insert(thread2, connB, 'user-2');

      const thread1Subs = await threadSubs.getSubscribers(thread1);
      const thread2Subs = await threadSubs.getSubscribers(thread2);

      expect(thread1Subs).toHaveLength(1);
      expect(thread2Subs).toHaveLength(1);
      expect(thread1Subs[0]?.connectionId).toBe(connA);
      expect(thread2Subs[0]?.connectionId).toBe(connB);
    });
  });
});
