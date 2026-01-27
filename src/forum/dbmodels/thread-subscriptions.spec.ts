import { ThreadSubscriptions } from './thread-subscriptions';
import { dynamodb } from '../../dynamodb';
import { clearTable } from '../../testutils/db';
import { ThreadId } from './thread';

describe('ThreadSubscriptions', () => {
  let threadSubs: ThreadSubscriptions;
  const threadId: ThreadId = { participantId: 'user123', itemId: 'item456' };

  beforeEach(async () => {
    threadSubs = new ThreadSubscriptions(dynamodb);
    await clearTable();
  });

  describe('insert', () => {
    it('should insert a subscription for a connection to a thread', async () => {
      const connectionId = 'conn-123';
      const userId = 'user-123';

      await threadSubs.insert(threadId, connectionId, userId);

      const subscribers = await threadSubs.getSubscribers({ threadId });
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0]?.connectionId).toBe(connectionId);
      expect(subscribers[0]?.sk).toBeGreaterThan(0);
    });

    it('should return subscription keys', async () => {
      const connectionId = 'conn-123';
      const userId = 'user-123';

      const keys = await threadSubs.insert(threadId, connectionId, userId);

      expect(keys.pk).toContain('THREAD');
      expect(keys.pk).toContain(threadId.participantId);
      expect(keys.pk).toContain(threadId.itemId);
      expect(keys.sk).toBeGreaterThan(0);
    });

    it('should allow inserting multiple subscriptions to the same thread', async () => {
      await threadSubs.insert(threadId, 'conn-1', 'user-1');
      await threadSubs.insert(threadId, 'conn-2', 'user-2');
      await threadSubs.insert(threadId, 'conn-3', 'user-3');

      const subscribers = await threadSubs.getSubscribers({ threadId });
      expect(subscribers).toHaveLength(3);
      expect(subscribers.map(s => s.connectionId).sort()).toEqual([ 'conn-1', 'conn-2', 'conn-3' ]);
    });
  });

  describe('getSubscribers', () => {
    it('should return empty array for thread with no subscribers', async () => {
      const subscribers = await threadSubs.getSubscribers({ threadId });
      expect(subscribers).toEqual([]);
    });

    it('should return all subscribers for a thread', async () => {
      await threadSubs.insert(threadId, 'conn-1', 'user-1');
      await threadSubs.insert(threadId, 'conn-2', 'user-2');

      const subscribers = await threadSubs.getSubscribers({ threadId });
      expect(subscribers).toHaveLength(2);
    });

    it('should filter subscribers by connectionId', async () => {
      const connectionId = 'conn-123';
      await threadSubs.insert(threadId, connectionId, 'user-123');
      await threadSubs.insert(threadId, 'conn-456', 'user-456');

      const subscribers = await threadSubs.getSubscribers({ threadId, connectionId });
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0]?.connectionId).toBe(connectionId);
      expect(subscribers[0]?.sk).toBeGreaterThan(0);
    });

    it('should return empty array for non-existent connection', async () => {
      const subscribers = await threadSubs.getSubscribers({ threadId, connectionId: 'non-existent-conn' });
      expect(subscribers).toEqual([]);
    });
  });

  describe('deleteByConnectionId', () => {
    it('should delete a subscription by connection id', async () => {
      const connectionId = 'conn-123';
      await threadSubs.insert(threadId, connectionId, 'user-123');

      let subscribers = await threadSubs.getSubscribers({ threadId });
      expect(subscribers).toHaveLength(1);

      await threadSubs.deleteByConnectionId(threadId, connectionId);

      subscribers = await threadSubs.getSubscribers({ threadId });
      expect(subscribers).toHaveLength(0);
    });

    it('should not affect other subscriptions when deleting one', async () => {
      await threadSubs.insert(threadId, 'conn-1', 'user-1');
      await threadSubs.insert(threadId, 'conn-2', 'user-2');
      await threadSubs.insert(threadId, 'conn-3', 'user-3');

      await threadSubs.deleteByConnectionId(threadId, 'conn-2');

      const subscribers = await threadSubs.getSubscribers({ threadId });
      expect(subscribers).toHaveLength(2);
      expect(subscribers.map(s => s.connectionId).sort()).toEqual([ 'conn-1', 'conn-3' ]);
    });

    it('should handle deleting non-existent subscription gracefully', async () => {
      await expect(
        threadSubs.deleteByConnectionId(threadId, 'non-existent-conn')
      ).resolves.not.toThrow();
    });
  });

  describe('deleteSet', () => {
    it('should delete multiple subscriptions by sk', async () => {
      await threadSubs.insert(threadId, 'conn-1', 'user-1');
      await threadSubs.insert(threadId, 'conn-2', 'user-2');
      await threadSubs.insert(threadId, 'conn-3', 'user-3');

      const subscribers = await threadSubs.getSubscribers({ threadId });
      const sksToRemove = subscribers.slice(0, 2).map(s => s.sk);

      await threadSubs.deleteSet(threadId, sksToRemove);

      const remainingSubscribers = await threadSubs.getSubscribers({ threadId });
      expect(remainingSubscribers).toHaveLength(1);
    });

    it('should handle empty sk array', async () => {
      await threadSubs.insert(threadId, 'conn-1', 'user-1');
      await threadSubs.deleteSet(threadId, []);

      const subscribers = await threadSubs.getSubscribers({ threadId });
      expect(subscribers).toHaveLength(1);
    });
  });

  describe('deleteByKeys', () => {
    it('should delete a subscription using keys directly', async () => {
      const keys = await threadSubs.insert(threadId, 'conn-123', 'user-123');

      let subscribers = await threadSubs.getSubscribers({ threadId });
      expect(subscribers).toHaveLength(1);

      await threadSubs.deleteByKeys(keys);

      subscribers = await threadSubs.getSubscribers({ threadId });
      expect(subscribers).toHaveLength(0);
    });

    it('should only delete the specific subscription', async () => {
      const keys1 = await threadSubs.insert(threadId, 'conn-1', 'user-1');
      await threadSubs.insert(threadId, 'conn-2', 'user-2');

      await threadSubs.deleteByKeys(keys1);

      const subscribers = await threadSubs.getSubscribers({ threadId });
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0]?.connectionId).toBe('conn-2');
    });
  });

  describe('thread isolation', () => {
    it('should isolate subscriptions between different threads', async () => {
      const thread1: ThreadId = { participantId: 'user1', itemId: 'item1' };
      const thread2: ThreadId = { participantId: 'user2', itemId: 'item2' };

      await threadSubs.insert(thread1, 'conn-1', 'user-1');
      await threadSubs.insert(thread2, 'conn-2', 'user-2');

      const thread1Subs = await threadSubs.getSubscribers({ threadId: thread1 });
      const thread2Subs = await threadSubs.getSubscribers({ threadId: thread2 });

      expect(thread1Subs).toHaveLength(1);
      expect(thread2Subs).toHaveLength(1);
      expect(thread1Subs[0]?.connectionId).toBe('conn-1');
      expect(thread2Subs[0]?.connectionId).toBe('conn-2');
    });
  });
});

