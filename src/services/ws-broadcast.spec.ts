import { clearTable } from '../testutils/db';

const mockSend = jest.fn();

jest.mock('../websocket-client', () => ({
  ...jest.requireActual('../websocket-client'),
  wsClient: { send: mockSend },
}));

import { cleanupGoneConnection, broadcastAndCleanup } from './ws-broadcast';
import { userConnectionsTable } from '../dbmodels/user-connections';
import { threadSubscriptionsTable } from '../forum/dbmodels/thread-subscriptions';

// Valid base64 connectionIds (first byte must be non-zero for number encoding round-trip)
const conn1 = 'CgsMDQ4PEBE=';
const conn2 = 'FBYYGhweICI=';
const connActive = 'HiEkJyotMDM=';
const connGone = 'KCwwNDg8QEQ=';
const connOk = 'Mjc8QUZLUFU=';
const connError = 'PEJITlRaYGY=';

describe('ws-broadcast', () => {
  const threadId = { participantId: 'user123', itemId: 'item456' };

  beforeEach(async () => {
    await clearTable();
    jest.clearAllMocks();
    mockSend.mockImplementation((connectionIds) =>
      Promise.resolve(connectionIds.map((id: string) => ({ success: true, connectionId: id }))));
  });

  describe('cleanupGoneConnection', () => {
    it('should delete user connection and return userId', async () => {
      await userConnectionsTable.insert(conn1, '20123');

      const result = await cleanupGoneConnection(conn1);

      expect(result.userId).toBe('20123');

      // Verify connection was deleted
      const connections = await userConnectionsTable.getAll('20123');
      expect(connections).toHaveLength(0);
    });

    it('should return undefined userId when connection not found', async () => {
      const result = await cleanupGoneConnection(conn1);

      expect(result.userId).toBeUndefined();
    });

    it('should clean up thread subscription when connection has one', async () => {
      await userConnectionsTable.insert(conn1, '20123');
      await threadSubscriptionsTable.insert(threadId, conn1, '20123');
      await userConnectionsTable.updateConnectionInfo(conn1, { subscriptionThreadId: threadId });

      const result = await cleanupGoneConnection(conn1);

      expect(result.userId).toBe('20123');

      // Verify connection was deleted
      const connections = await userConnectionsTable.getAll('20123');
      expect(connections).toHaveLength(0);

      // Verify subscription was also deleted
      const subs = await threadSubscriptionsTable.getSubscribers(threadId);
      expect(subs).toHaveLength(0);
    });

    it('should not fail when connection has no subscription', async () => {
      await userConnectionsTable.insert(conn1, '20123');

      const result = await cleanupGoneConnection(conn1);

      expect(result.userId).toBe('20123');

      // Verify connection was deleted
      const connections = await userConnectionsTable.getAll('20123');
      expect(connections).toHaveLength(0);
    });
  });

  describe('broadcastAndCleanup', () => {
    it('should return empty successfulRecipients for empty entries array', async () => {
      const result = await broadcastAndCleanup([], (id: string) => id, { action: 'test' });

      expect(result.successfulRecipients).toEqual([]);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should send message to all entries and return successful ones', async () => {
      const entries = [
        { connectionId: conn1, userId: '20003' },
        { connectionId: conn2, userId: '20004' },
      ];

      const result = await broadcastAndCleanup(entries, e => e.connectionId, { action: 'test' });

      expect(mockSend).toHaveBeenCalledWith([ conn1, conn2 ], { action: 'test' });
      expect(result.successfulRecipients).toHaveLength(2);
      expect(result.successfulRecipients).toEqual(entries);
    });

    it('should clean up gone connections (user connection only)', async () => {
      await userConnectionsTable.insert(connActive, '20001');
      await userConnectionsTable.insert(connGone, '20002');

      const entries = [
        { connectionId: connActive, userId: '20001' },
        { connectionId: connGone, userId: '20002' },
      ];

      mockSend.mockImplementation((connectionIds) => Promise.resolve(connectionIds.map((id: string) => {
        if (id === connGone) {
          const error = new Error('Gone');
          error.name = 'GoneException';
          return { success: false, connectionId: id, error };
        }
        return { success: true, connectionId: id };
      })));

      const result = await broadcastAndCleanup(entries, e => e.connectionId, { action: 'test' });

      expect(result.successfulRecipients).toHaveLength(1);
      expect(result.successfulRecipients[0]?.connectionId).toBe(connActive);

      const activeConnections = await userConnectionsTable.getAll('20001');
      const goneConnections = await userConnectionsTable.getAll('20002');
      expect(activeConnections).toContain(connActive);
      expect(goneConnections).toHaveLength(0);
    });

    it('should clean up gone connections with thread subscriptions (full cleanup)', async () => {
      await userConnectionsTable.insert(connActive, '20001');
      await userConnectionsTable.insert(connGone, '20002');

      await threadSubscriptionsTable.insert(threadId, connActive, '20001');
      await threadSubscriptionsTable.insert(threadId, connGone, '20002');
      await userConnectionsTable.updateConnectionInfo(connActive, { subscriptionThreadId: threadId });
      await userConnectionsTable.updateConnectionInfo(connGone, { subscriptionThreadId: threadId });

      const entries = [
        { connectionId: connActive, userId: '20001' },
        { connectionId: connGone, userId: '20002' },
      ];

      mockSend.mockImplementation((connectionIds) => Promise.resolve(connectionIds.map((id: string) => {
        if (id === connGone) {
          const error = new Error('Gone');
          error.name = 'GoneException';
          return { success: false, connectionId: id, error };
        }
        return { success: true, connectionId: id };
      })));

      const result = await broadcastAndCleanup(entries, e => e.connectionId, { action: 'test' });

      expect(result.successfulRecipients).toHaveLength(1);
      expect(result.successfulRecipients[0]?.connectionId).toBe(connActive);

      const goneConnections = await userConnectionsTable.getAll('20002');
      expect(goneConnections).toHaveLength(0);

      const subs = await threadSubscriptionsTable.getSubscribers(threadId);
      expect(subs).toHaveLength(1);
      expect(subs[0]?.connectionId).toBe(connActive);
    });

    it('should work with connection IDs directly (as strings)', async () => {
      await userConnectionsTable.insert(conn1, '20003');
      await userConnectionsTable.insert(conn2, '20004');

      const connectionIds = [ conn1, conn2 ];

      const result = await broadcastAndCleanup(connectionIds, id => id, { action: 'test' });

      expect(mockSend).toHaveBeenCalledWith([ conn1, conn2 ], { action: 'test' });
      expect(result.successfulRecipients).toEqual([ conn1, conn2 ]);
    });

    it('should handle all connections being gone', async () => {
      await userConnectionsTable.insert(conn1, '20003');
      await userConnectionsTable.insert(conn2, '20004');

      mockSend.mockImplementation((connectionIds) => Promise.resolve(connectionIds.map((id: string) => {
        const error = new Error('Gone');
        error.name = 'GoneException';
        return { success: false, connectionId: id, error };
      })));

      const result = await broadcastAndCleanup([ conn1, conn2 ], id => id, { action: 'test' });

      expect(result.successfulRecipients).toHaveLength(0);

      const c1 = await userConnectionsTable.getAll('20003');
      const c2 = await userConnectionsTable.getAll('20004');
      expect(c1).toHaveLength(0);
      expect(c2).toHaveLength(0);
    });

    it('should not include failed (non-gone) connections in successfulRecipients', async () => {
      const entries = [
        { connectionId: connOk, userId: '20005' },
        { connectionId: connError, userId: '20006' },
      ];

      mockSend.mockImplementation((connectionIds) => Promise.resolve(connectionIds.map((id: string) => {
        if (id === connError) {
          return { success: false, connectionId: id, error: new Error('Network error') };
        }
        return { success: true, connectionId: id };
      })));

      const result = await broadcastAndCleanup(entries, e => e.connectionId, { action: 'test' });

      expect(result.successfulRecipients).toHaveLength(1);
      expect(result.successfulRecipients[0]?.connectionId).toBe(connOk);
    });
  });
});
