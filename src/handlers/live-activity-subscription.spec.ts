import { subscribe, unsubscribe } from './live-activity-subscription';
import { LiveActivitySubscriptions } from '../dbmodels/live-activity-subscriptions';
import { docClient } from '../dynamodb';
import { clearTable } from '../testutils/db';
import { WsRequest } from '../utils/lambda-ws-server';

const connA = 'L0SM9cOFIAMCIdw=';
const connB = 'dGVzdENvbm4=';
const connC = 'YWJjZGVmZw==';

function wsRequest(connectionId: string): WsRequest {
  return { connectionId: () => connectionId, body: { action: 'liveActivity.subscribe' } } as unknown as WsRequest;
}

describe('Live Activity Subscription', () => {
  let liveActivitySubs: LiveActivitySubscriptions;

  beforeEach(async () => {
    liveActivitySubs = new LiveActivitySubscriptions(docClient);
    await clearTable();
  });

  describe('subscribe', () => {
    it('should subscribe a connection to live activity updates', async () => {
      await subscribe(wsRequest(connA));

      const subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0]?.connectionId).toBe(connA);
    });

    it('should allow multiple connections to subscribe', async () => {
      await subscribe(wsRequest(connA));
      await subscribe(wsRequest(connB));

      const subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toHaveLength(2);
      expect(subscribers.map(s => s.connectionId).sort()).toEqual([ connA, connB ].sort());
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe a connection from live activity updates', async () => {
      await subscribe(wsRequest(connA));

      let subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toHaveLength(1);

      await unsubscribe(wsRequest(connA));

      subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toHaveLength(0);
    });

    it('should not affect other subscriptions when unsubscribing', async () => {
      await subscribe(wsRequest(connA));
      await subscribe(wsRequest(connB));
      await subscribe(wsRequest(connC));

      await unsubscribe(wsRequest(connB));

      const subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toHaveLength(2);
      expect(subscribers.map(s => s.connectionId).sort()).toEqual([ connA, connC ].sort());
    });

    it('should handle unsubscribing from non-existent subscription gracefully', async () => {
      await expect(unsubscribe(wsRequest(connA))).resolves.not.toThrow();
    });
  });
});
