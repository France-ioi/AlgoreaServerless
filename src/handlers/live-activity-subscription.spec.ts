import { subscribe, unsubscribe } from './live-activity-subscription';
import { LiveActivitySubscriptions } from '../dbmodels/live-activity-subscriptions';
import { docClient } from '../dynamodb';
import { clearTable } from '../testutils/db';
import { WsRequest } from '../utils/lambda-ws-server';

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
      await subscribe(wsRequest('conn-123'));

      const subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0]?.connectionId).toBe('conn-123');
    });

    it('should allow multiple connections to subscribe', async () => {
      await subscribe(wsRequest('conn-1'));
      await subscribe(wsRequest('conn-2'));

      const subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toHaveLength(2);
      expect(subscribers.map(s => s.connectionId).sort()).toEqual([ 'conn-1', 'conn-2' ]);
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe a connection from live activity updates', async () => {
      await subscribe(wsRequest('conn-123'));

      let subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toHaveLength(1);

      await unsubscribe(wsRequest('conn-123'));

      subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toHaveLength(0);
    });

    it('should not affect other subscriptions when unsubscribing', async () => {
      await subscribe(wsRequest('conn-1'));
      await subscribe(wsRequest('conn-2'));
      await subscribe(wsRequest('conn-3'));

      await unsubscribe(wsRequest('conn-2'));

      const subscribers = await liveActivitySubs.getSubscribers();
      expect(subscribers).toHaveLength(2);
      expect(subscribers.map(s => s.connectionId).sort()).toEqual([ 'conn-1', 'conn-3' ]);
    });

    it('should handle unsubscribing from non-existent subscription gracefully', async () => {
      await expect(unsubscribe(wsRequest('non-existent-conn'))).resolves.not.toThrow();
    });
  });
});
