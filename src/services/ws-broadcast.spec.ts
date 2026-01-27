import { clearTable } from '../testutils/db';

const mockSend = jest.fn();

jest.mock('../websocket-client', () => ({
  ...jest.requireActual('../websocket-client'),
  wsClient: { send: mockSend },
}));

import { cleanupGoneConnection, broadcastAndCleanup } from './ws-broadcast';
import { userConnectionsTable } from '../dbmodels/user-connections';
import { threadSubscriptionsTable } from '../forum/dbmodels/thread-subscriptions';

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
      await userConnectionsTable.insert('conn-1', 'user-123');

      const result = await cleanupGoneConnection('conn-1');

      expect(result.userId).toBe('user-123');

      // Verify connection was deleted
      const connections = await userConnectionsTable.getAll('user-123');
      expect(connections).toHaveLength(0);
    });

    it('should return undefined userId when connection not found', async () => {
      const result = await cleanupGoneConnection('non-existent');

      expect(result.userId).toBeUndefined();
    });

    it('should clean up thread subscription when connection has one', async () => {
      // Create connection and subscription
      await userConnectionsTable.insert('conn-1', 'user-123');
      const subKeys = await threadSubscriptionsTable.subscribe(threadId, 'conn-1', 'user-123');
      await userConnectionsTable.updateConnectionInfo('conn-1', { subscriptionKeys: subKeys });

      const result = await cleanupGoneConnection('conn-1');

      expect(result.userId).toBe('user-123');

      // Verify connection was deleted
      const connections = await userConnectionsTable.getAll('user-123');
      expect(connections).toHaveLength(0);

      // Verify subscription was also deleted
      const subs = await threadSubscriptionsTable.getSubscribers({ threadId });
      expect(subs).toHaveLength(0);
    });

    it('should not fail when connection has no subscription', async () => {
      await userConnectionsTable.insert('conn-1', 'user-123');

      const result = await cleanupGoneConnection('conn-1');

      expect(result.userId).toBe('user-123');

      // Verify connection was deleted
      const connections = await userConnectionsTable.getAll('user-123');
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
        { connectionId: 'conn-1', userId: 'user-1' },
        { connectionId: 'conn-2', userId: 'user-2' },
      ];

      const result = await broadcastAndCleanup(entries, e => e.connectionId, { action: 'test' });

      expect(mockSend).toHaveBeenCalledWith([ 'conn-1', 'conn-2' ], { action: 'test' });
      expect(result.successfulRecipients).toHaveLength(2);
      expect(result.successfulRecipients).toEqual(entries);
    });

    it('should clean up gone connections (user connection only)', async () => {
      // Create connections
      await userConnectionsTable.insert('conn-active', 'user-active');
      await userConnectionsTable.insert('conn-gone', 'user-gone');

      const entries = [
        { connectionId: 'conn-active', userId: 'user-active' },
        { connectionId: 'conn-gone', userId: 'user-gone' },
      ];

      mockSend.mockImplementation((connectionIds) => Promise.resolve(connectionIds.map((id: string) => {
        if (id === 'conn-gone') {
          const error = new Error('Gone');
          error.name = 'GoneException';
          return { success: false, connectionId: id, error };
        }
        return { success: true, connectionId: id };
      })));

      const result = await broadcastAndCleanup(entries, e => e.connectionId, { action: 'test' });

      // Only the successful entry should be returned
      expect(result.successfulRecipients).toHaveLength(1);
      expect(result.successfulRecipients[0]?.connectionId).toBe('conn-active');

      // Gone connection should be cleaned up
      const activeConnections = await userConnectionsTable.getAll('user-active');
      const goneConnections = await userConnectionsTable.getAll('user-gone');
      expect(activeConnections).toContain('conn-active');
      expect(goneConnections).toHaveLength(0);
    });

    it('should clean up gone connections with thread subscriptions (full cleanup)', async () => {
      // Create connections
      await userConnectionsTable.insert('conn-active', 'user-active');
      await userConnectionsTable.insert('conn-gone', 'user-gone');

      // Create subscriptions for both
      const activeSubKeys = await threadSubscriptionsTable.subscribe(threadId, 'conn-active', 'user-active');
      const goneSubKeys = await threadSubscriptionsTable.subscribe(threadId, 'conn-gone', 'user-gone');
      await userConnectionsTable.updateConnectionInfo('conn-active', { subscriptionKeys: activeSubKeys });
      await userConnectionsTable.updateConnectionInfo('conn-gone', { subscriptionKeys: goneSubKeys });

      const entries = [
        { connectionId: 'conn-active', userId: 'user-active' },
        { connectionId: 'conn-gone', userId: 'user-gone' },
      ];

      mockSend.mockImplementation((connectionIds) => Promise.resolve(connectionIds.map((id: string) => {
        if (id === 'conn-gone') {
          const error = new Error('Gone');
          error.name = 'GoneException';
          return { success: false, connectionId: id, error };
        }
        return { success: true, connectionId: id };
      })));

      const result = await broadcastAndCleanup(entries, e => e.connectionId, { action: 'test' });

      // Only the successful entry should be returned
      expect(result.successfulRecipients).toHaveLength(1);
      expect(result.successfulRecipients[0]?.connectionId).toBe('conn-active');

      // Verify gone connection was cleaned up (user connection deleted)
      const goneConnections = await userConnectionsTable.getAll('user-gone');
      expect(goneConnections).toHaveLength(0);

      // Verify gone subscription was also cleaned up
      const subs = await threadSubscriptionsTable.getSubscribers({ threadId });
      expect(subs).toHaveLength(1);
      expect(subs[0]?.connectionId).toBe('conn-active');
    });

    it('should work with connection IDs directly (as strings)', async () => {
      await userConnectionsTable.insert('conn-1', 'user-1');
      await userConnectionsTable.insert('conn-2', 'user-2');

      const connectionIds = [ 'conn-1', 'conn-2' ];

      const result = await broadcastAndCleanup(connectionIds, id => id, { action: 'test' });

      expect(mockSend).toHaveBeenCalledWith([ 'conn-1', 'conn-2' ], { action: 'test' });
      expect(result.successfulRecipients).toEqual([ 'conn-1', 'conn-2' ]);
    });

    it('should handle all connections being gone', async () => {
      await userConnectionsTable.insert('conn-1', 'user-1');
      await userConnectionsTable.insert('conn-2', 'user-2');

      mockSend.mockImplementation((connectionIds) => Promise.resolve(connectionIds.map((id: string) => {
        const error = new Error('Gone');
        error.name = 'GoneException';
        return { success: false, connectionId: id, error };
      })));

      const result = await broadcastAndCleanup([ 'conn-1', 'conn-2' ], id => id, { action: 'test' });

      expect(result.successfulRecipients).toHaveLength(0);

      // Both connections should be cleaned up
      const conn1 = await userConnectionsTable.getAll('user-1');
      const conn2 = await userConnectionsTable.getAll('user-2');
      expect(conn1).toHaveLength(0);
      expect(conn2).toHaveLength(0);
    });

    it('should not include failed (non-gone) connections in successfulRecipients', async () => {
      const entries = [
        { connectionId: 'conn-ok', userId: 'user-ok' },
        { connectionId: 'conn-error', userId: 'user-error' },
      ];

      mockSend.mockImplementation((connectionIds) => Promise.resolve(connectionIds.map((id: string) => {
        if (id === 'conn-error') {
          // Non-GoneException error (e.g., network error)
          return { success: false, connectionId: id, error: new Error('Network error') };
        }
        return { success: true, connectionId: id };
      })));

      const result = await broadcastAndCleanup(entries, e => e.connectionId, { action: 'test' });

      // Only truly successful entry should be returned
      expect(result.successfulRecipients).toHaveLength(1);
      expect(result.successfulRecipients[0]?.connectionId).toBe('conn-ok');
    });
  });
});
