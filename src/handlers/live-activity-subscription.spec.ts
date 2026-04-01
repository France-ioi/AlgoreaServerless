import { subscribe, unsubscribe } from './live-activity-subscription';
import { UserConnections } from '../dbmodels/user-connections';
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
  let userConnections: UserConnections;

  beforeEach(async () => {
    userConnections = new UserConnections(docClient);
    await clearTable();
  });

  describe('subscribe', () => {
    it('should subscribe a connection to live activity updates', async () => {
      await userConnections.insert(connA, '9001');

      await subscribe(wsRequest(connA));

      const subscribers = await userConnections.getLiveActivitySubscribers();
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0]?.connectionId).toBe(connA);
    });

    it('should allow multiple connections to subscribe', async () => {
      await userConnections.insert(connA, '9001');
      await userConnections.insert(connB, '9002');

      await subscribe(wsRequest(connA));
      await subscribe(wsRequest(connB));

      const subscribers = await userConnections.getLiveActivitySubscribers();
      expect(subscribers).toHaveLength(2);
      expect(subscribers.map(s => s.connectionId).sort()).toEqual([ connA, connB ].sort());
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe a connection from live activity updates', async () => {
      await userConnections.insert(connA, '9001');
      await subscribe(wsRequest(connA));

      let subscribers = await userConnections.getLiveActivitySubscribers();
      expect(subscribers).toHaveLength(1);

      await unsubscribe(wsRequest(connA));

      subscribers = await userConnections.getLiveActivitySubscribers();
      expect(subscribers).toHaveLength(0);
    });

    it('should not affect other subscriptions when unsubscribing', async () => {
      await userConnections.insert(connA, '9001');
      await userConnections.insert(connB, '9002');
      await userConnections.insert(connC, '9003');

      await subscribe(wsRequest(connA));
      await subscribe(wsRequest(connB));
      await subscribe(wsRequest(connC));

      await unsubscribe(wsRequest(connB));

      const subscribers = await userConnections.getLiveActivitySubscribers();
      expect(subscribers).toHaveLength(2);
      expect(subscribers.map(s => s.connectionId).sort()).toEqual([ connA, connC ].sort());
    });

    it('should handle unsubscribing from non-existent subscription gracefully', async () => {
      await userConnections.insert(connA, '9001');
      await expect(unsubscribe(wsRequest(connA))).resolves.not.toThrow();
    });
  });
});
