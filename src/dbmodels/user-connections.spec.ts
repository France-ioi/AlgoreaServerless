import { UserConnections } from './user-connections';
import { safeNumber, docClient, dynamodb } from '../dynamodb';
import { clearTable } from '../testutils/db';
import { z } from 'zod';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

const connA = 'L0SM9cOFIAMCIdw=';
const connB = 'dGVzdENvbm4=';
const connC = 'YWJjZGVmZw==';
const connD = 'KCwwNDg8QEQ=';
const connE = 'Mjc8QUZLUFU=';
const connF = 'PEJITlRaYGY=';
const connG = 'Rk1UW2JpcHc=';
const connH = 'UFhgaHB4gIg=';

async function putExpiredConnection(connectionId: string, userId: string): Promise<void> {
  await docClient.send(new PutCommand({
    TableName: process.env.TABLE_CONNECTIONS!,
    Item: {
      connectionId,
      userId,
      creationTime: Date.now(),
      ttl: Math.floor(Date.now() / 1000) - 3600,
    },
  }));
}

describe('UserConnections', () => {
  let userConnections: UserConnections;

  beforeEach(async () => {
    userConnections = new UserConnections(docClient);
    await clearTable();
  });

  describe('insert', () => {

    it('should create a connection item', async () => {
      await userConnections.insert(connA, '456');

      const result = await dynamodb.executeStatement({
        Statement: `SELECT * FROM "${process.env.TABLE_CONNECTIONS}" WHERE connectionId = ?`,
        Parameters: [{ S: connA }],
      });
      expect(result.Items).toHaveLength(1);
      const item = result.Items?.[0];
      expect(item?.userId?.S).toBe('456');
      expect(item?.creationTime?.N).toBeDefined();
      expect(item?.ttl?.N).toBeDefined();
    });

    it('should handle multiple connections for the same user', async () => {
      await userConnections.insert(connA, '1001');
      await userConnections.insert(connB, '1001');
      await userConnections.insert(connC, '1001');

      const connections = await userConnections.getAll('1001');
      expect(connections).toHaveLength(3);
      expect(connections).toContain(connA);
      expect(connections).toContain(connB);
      expect(connections).toContain(connC);
    });

  });

  describe('delete', () => {

    it('should remove the connection item', async () => {
      await userConnections.insert(connA, '2001');

      await userConnections.delete(connA);

      const result = await dynamodb.executeStatement({
        Statement: `SELECT * FROM "${process.env.TABLE_CONNECTIONS}" WHERE connectionId = ?`,
        Parameters: [{ S: connA }],
      });
      expect(result.Items).toHaveLength(0);
    });

    it('should return null when connection does not exist', async () => {
      const result = await userConnections.delete(connA);
      expect(result).toBeNull();
    });

    it('should return the deleted entry with userId', async () => {
      await userConnections.insert(connA, '2002');

      const result = await userConnections.delete(connA);

      expect(result).not.toBeNull();
      expect(result?.userId).toBe('2002');
    });

    it('should only delete the specified connection for a user with multiple connections', async () => {
      await userConnections.insert(connD, '2003');
      await userConnections.insert(connE, '2003');
      await userConnections.insert(connF, '2003');

      await userConnections.delete(connE);

      const connections = await userConnections.getAll('2003');
      expect(connections).toHaveLength(2);
      expect(connections).toContain(connD);
      expect(connections).toContain(connF);
      expect(connections).not.toContain(connE);
    });

  });

  describe('getAll', () => {

    it('should return all connections for a user', async () => {
      await userConnections.insert(connA, '3001');
      await userConnections.insert(connB, '3001');

      const connections = await userConnections.getAll('3001');

      expect(connections).toHaveLength(2);
      expect(connections).toContain(connA);
      expect(connections).toContain(connB);
    });

    it('should return empty array when user has no connections', async () => {
      const connections = await userConnections.getAll('3002');

      expect(connections).toEqual([]);
    });

    it('should not return connections from other users', async () => {
      await userConnections.insert(connA, '4001');
      await userConnections.insert(connB, '4002');

      const user1Connections = await userConnections.getAll('4001');
      const user2Connections = await userConnections.getAll('4002');

      expect(user1Connections).toEqual([ connA ]);
      expect(user2Connections).toEqual([ connB ]);
    });

  });

  describe('updateConnectionInfo', () => {

    it('should set subscriptionKeys on a connection', async () => {
      await userConnections.insert(connA, '5001');

      const subscriptionKeys = { pk: 'THREAD#participant123#item456#SUB', sk: 1234567890 };
      await userConnections.updateConnectionInfo(connA, { subscriptionKeys });

      const result = await dynamodb.executeStatement({
        Statement: `SELECT subscriptionKeys FROM "${process.env.TABLE_CONNECTIONS}" WHERE connectionId = ?`,
        Parameters: [{ S: connA }],
      });
      const storedKeys = result.Items?.[0]?.subscriptionKeys?.M;
      expect(storedKeys?.pk?.S).toBe(subscriptionKeys.pk);
      expect(storedKeys?.sk?.N).toBe(String(subscriptionKeys.sk));
    });

    it('should remove subscriptionKeys when explicitly set to undefined', async () => {
      await userConnections.insert(connB, '5002');
      await userConnections.updateConnectionInfo(connB, {
        subscriptionKeys: { pk: 'THREAD#p#i#SUB', sk: 123 },
      });

      await userConnections.updateConnectionInfo(connB, { subscriptionKeys: undefined });

      const result = await dynamodb.executeStatement({
        Statement: `SELECT subscriptionKeys FROM "${process.env.TABLE_CONNECTIONS}" WHERE connectionId = ?`,
        Parameters: [{ S: connB }],
      });
      expect(result.Items?.[0]?.subscriptionKeys).toBeUndefined();
    });

    it('should be a no-op when no fields are specified', async () => {
      await userConnections.insert(connC, '5003');
      await userConnections.updateConnectionInfo(connC, {
        subscriptionKeys: { pk: 'THREAD#p#i#SUB', sk: 123 },
      });

      await userConnections.updateConnectionInfo(connC, {});

      const result = await dynamodb.executeStatement({
        Statement: `SELECT subscriptionKeys FROM "${process.env.TABLE_CONNECTIONS}" WHERE connectionId = ?`,
        Parameters: [{ S: connC }],
      });
      expect(result.Items?.[0]?.subscriptionKeys).toBeDefined();
    });

    it('should not throw when connection does not exist', async () => {
      await expect(
        userConnections.updateConnectionInfo(connA, {
          subscriptionKeys: { pk: 'THREAD#p#i#SUB', sk: 123 },
        })
      ).resolves.not.toThrow();
    });

  });

  describe('delete with metadata', () => {

    it('should return subscriptionKeys when present', async () => {
      await userConnections.insert(connG, '6001');
      const subscriptionKeys = { pk: 'THREAD#part123#item456#SUB', sk: 9876543210 };
      await userConnections.updateConnectionInfo(connG, { subscriptionKeys });

      const result = await userConnections.delete(connG);

      expect(result).not.toBeNull();
      const subKeysSchema = z.object({ pk: z.string(), sk: safeNumber });
      expect(subKeysSchema.parse(result?.subscriptionKeys)).toEqual(subscriptionKeys);
    });

    it('should return undefined subscriptionKeys when not set', async () => {
      await userConnections.insert(connH, '6002');

      const result = await userConnections.delete(connH);

      expect(result).not.toBeNull();
      expect(result?.subscriptionKeys).toBeUndefined();
    });

  });

  describe('countDistinctUsers', () => {

    it('should return 0 when no users are connected', async () => {
      const count = await userConnections.countDistinctUsers();
      expect(count).toBe(0);
    });

    it('should count distinct users correctly', async () => {
      await userConnections.insert(connA, '800');
      await userConnections.insert(connB, '900');
      await userConnections.insert(connC, '1000');

      const count = await userConnections.countDistinctUsers();
      expect(count).toBe(3);
    });

    it('should not double-count a user with multiple connections', async () => {
      await userConnections.insert(connA, '1100');
      await userConnections.insert(connB, '1100');
      await userConnections.insert(connC, '1200');

      const count = await userConnections.countDistinctUsers();
      expect(count).toBe(2);
    });

    it('should exclude entries with expired TTL', async () => {
      await userConnections.insert(connA, '1500');
      await putExpiredConnection(connB, '1600');

      const count = await userConnections.countDistinctUsers();
      expect(count).toBe(1);
    });

    it('should decrement count after connection is deleted', async () => {
      await userConnections.insert(connA, '1300');
      await userConnections.insert(connB, '1400');

      await userConnections.delete(connA);

      const count = await userConnections.countDistinctUsers();
      expect(count).toBe(1);
    });

  });

  describe('live activity', () => {

    it('should subscribe a connection to live activity', async () => {
      await userConnections.insert(connA, '7001');

      await userConnections.subscribeLiveActivity(connA);

      const subscribers = await userConnections.getLiveActivitySubscribers();
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0]?.connectionId).toBe(connA);
    });

    it('should return multiple subscribers', async () => {
      await userConnections.insert(connA, '7001');
      await userConnections.insert(connB, '7002');
      await userConnections.insert(connC, '7003');

      await userConnections.subscribeLiveActivity(connA);
      await userConnections.subscribeLiveActivity(connB);

      const subscribers = await userConnections.getLiveActivitySubscribers();
      expect(subscribers).toHaveLength(2);
      expect(subscribers.map(s => s.connectionId).sort()).toEqual([ connA, connB ].sort());
    });

    it('should unsubscribe a connection from live activity', async () => {
      await userConnections.insert(connA, '7001');
      await userConnections.subscribeLiveActivity(connA);

      await userConnections.unsubscribeLiveActivity(connA);

      const subscribers = await userConnections.getLiveActivitySubscribers();
      expect(subscribers).toHaveLength(0);
    });

    it('should not affect other subscribers when unsubscribing', async () => {
      await userConnections.insert(connA, '7001');
      await userConnections.insert(connB, '7002');
      await userConnections.insert(connC, '7003');

      await userConnections.subscribeLiveActivity(connA);
      await userConnections.subscribeLiveActivity(connB);
      await userConnections.subscribeLiveActivity(connC);

      await userConnections.unsubscribeLiveActivity(connB);

      const subscribers = await userConnections.getLiveActivitySubscribers();
      expect(subscribers).toHaveLength(2);
      expect(subscribers.map(s => s.connectionId).sort()).toEqual([ connA, connC ].sort());
    });

    it('should automatically remove subscriber when connection is deleted', async () => {
      await userConnections.insert(connA, '7001');
      await userConnections.subscribeLiveActivity(connA);

      await userConnections.delete(connA);

      const subscribers = await userConnections.getLiveActivitySubscribers();
      expect(subscribers).toHaveLength(0);
    });

    it('should return empty array when no subscribers exist', async () => {
      const subscribers = await userConnections.getLiveActivitySubscribers();
      expect(subscribers).toEqual([]);
    });

  });

});
