import { LiveActivitySubscriptions } from './live-activity-subscriptions';
import { docClient } from '../dynamodb';
import { clearTable } from '../testutils/db';

describe('LiveActivitySubscriptions', () => {
  let liveActivitySubs: LiveActivitySubscriptions;

  beforeEach(async () => {
    liveActivitySubs = new LiveActivitySubscriptions(docClient);
    await clearTable();
  });

  describe('insert', () => {
    it('should insert a subscription for a connection', async () => {
      await liveActivitySubs.insert('conn-123');

      const subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0]?.connectionId).toBe('conn-123');
      expect(subscribers[0]?.sk).toBeGreaterThan(0);
    });

    it('should return subscription keys', async () => {
      const keys = await liveActivitySubs.insert('conn-123');

      expect(keys.pk).toContain('LIVE_ACTIVITY');
      expect(keys.sk).toBeGreaterThan(0);
    });

    it('should allow inserting multiple subscriptions', async () => {
      await liveActivitySubs.insert('conn-1');
      await liveActivitySubs.insert('conn-2');
      await liveActivitySubs.insert('conn-3');

      const subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toHaveLength(3);
      expect(subscribers.map(s => s.connectionId).sort()).toEqual([ 'conn-1', 'conn-2', 'conn-3' ]);
    });
  });

  describe('getSubscribers', () => {
    it('should return empty array when no subscribers exist', async () => {
      const subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toEqual([]);
    });

    it('should return all subscribers', async () => {
      await liveActivitySubs.insert('conn-1');
      await liveActivitySubs.insert('conn-2');

      const subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toHaveLength(2);
    });

    it('should filter subscribers by connectionId', async () => {
      await liveActivitySubs.insert('conn-123');
      await liveActivitySubs.insert('conn-456');

      const subscribers = await liveActivitySubs.getSubscribers({ connectionId: 'conn-123' });
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0]?.connectionId).toBe('conn-123');
    });

    it('should return empty array for non-existent connection', async () => {
      const subscribers = await liveActivitySubs.getSubscribers({ connectionId: 'non-existent' });
      expect(subscribers).toEqual([]);
    });
  });

  describe('deleteByConnectionId', () => {
    it('should delete a subscription by connection id', async () => {
      await liveActivitySubs.insert('conn-123');

      let subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toHaveLength(1);

      await liveActivitySubs.deleteByConnectionId('conn-123');

      subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toHaveLength(0);
    });

    it('should not affect other subscriptions when deleting one', async () => {
      await liveActivitySubs.insert('conn-1');
      await liveActivitySubs.insert('conn-2');
      await liveActivitySubs.insert('conn-3');

      await liveActivitySubs.deleteByConnectionId('conn-2');

      const subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toHaveLength(2);
      expect(subscribers.map(s => s.connectionId).sort()).toEqual([ 'conn-1', 'conn-3' ]);
    });

    it('should handle deleting non-existent subscription gracefully', async () => {
      await expect(
        liveActivitySubs.deleteByConnectionId('non-existent-conn')
      ).resolves.not.toThrow();
    });
  });

  describe('deleteByKeys', () => {
    it('should delete a subscription using keys directly', async () => {
      const keys = await liveActivitySubs.insert('conn-123');

      let subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toHaveLength(1);

      await liveActivitySubs.deleteByKeys(keys);

      subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toHaveLength(0);
    });

    it('should only delete the specific subscription', async () => {
      const keys1 = await liveActivitySubs.insert('conn-1');
      await liveActivitySubs.insert('conn-2');

      await liveActivitySubs.deleteByKeys(keys1);

      const subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0]?.connectionId).toBe('conn-2');
    });
  });
});
