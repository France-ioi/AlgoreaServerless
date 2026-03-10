import { LiveActivitySubscriptions } from './live-activity-subscriptions';
import { docClient } from '../dynamodb';
import { clearTable } from '../testutils/db';

describe('LiveActivitySubscriptions', () => {
  let liveActivitySubs: LiveActivitySubscriptions;

  const connA = 'L0SM9cOFIAMCIdw=';
  const connB = 'dGVzdENvbm4=';
  const connC = 'YWJjZGVmZw==';

  beforeEach(async () => {
    liveActivitySubs = new LiveActivitySubscriptions(docClient);
    await clearTable();
  });

  describe('insert', () => {
    it('should insert a subscription for a connection', async () => {
      await liveActivitySubs.insert(connA);

      const subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0]?.connectionId).toBe(connA);
    });

    it('should allow inserting multiple subscriptions', async () => {
      await liveActivitySubs.insert(connA);
      await liveActivitySubs.insert(connB);
      await liveActivitySubs.insert(connC);

      const subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toHaveLength(3);
      expect(subscribers.map(s => s.connectionId).sort()).toEqual([ connA, connB, connC ].sort());
    });
  });

  describe('getSubscribers', () => {
    it('should return empty array when no subscribers exist', async () => {
      const subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toEqual([]);
    });

    it('should return all subscribers', async () => {
      await liveActivitySubs.insert(connA);
      await liveActivitySubs.insert(connB);

      const subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toHaveLength(2);
    });
  });

  describe('deleteByConnectionId', () => {
    it('should delete a subscription by connection id', async () => {
      await liveActivitySubs.insert(connA);

      let subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toHaveLength(1);

      await liveActivitySubs.deleteByConnectionId(connA);

      subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toHaveLength(0);
    });

    it('should not affect other subscriptions when deleting one', async () => {
      await liveActivitySubs.insert(connA);
      await liveActivitySubs.insert(connB);
      await liveActivitySubs.insert(connC);

      await liveActivitySubs.deleteByConnectionId(connB);

      const subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toHaveLength(2);
      expect(subscribers.map(s => s.connectionId).sort()).toEqual([ connA, connC ].sort());
    });

    it('should handle deleting non-existent subscription gracefully', async () => {
      await expect(
        liveActivitySubs.deleteByConnectionId(connA)
      ).resolves.not.toThrow();
    });
  });
});
