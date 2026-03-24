import { UserConnections } from './user-connections';
import { safeNumber, docClient, dynamodb } from '../dynamodb';
import { clearTable } from '../testutils/db';
import { connectionIdToNumberValue } from '../utils/connection-id-number';
import { z } from 'zod';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function queryPresenceEntries() {
  return dynamodb.executeStatement({
    Statement: `SELECT * FROM "${process.env.TABLE_NAME}" WHERE pk = ?`,
    Parameters: [{ S: `${process.env.STAGE}#CONNECTED_USERS` }],
  });
}

// Valid base64 connectionIds for tests (first byte must be non-zero for number encoding round-trip)
const connA = 'L0SM9cOFIAMCIdw=';
const connB = 'dGVzdENvbm4=';
const connC = 'YWJjZGVmZw==';
const connD = 'KCwwNDg8QEQ=';
const connE = 'Mjc8QUZLUFU=';
const connF = 'PEJITlRaYGY=';
const connG = 'Rk1UW2JpcHc=';
const connH = 'UFhgaHB4gIg=';

describe('UserConnections', () => {
  let userConnections: UserConnections;

  beforeEach(async () => {
    userConnections = new UserConnections(docClient);
    await clearTable();
  });

  describe('create', () => {

    it('should create both c2u and u2c entries', async () => {
      await userConnections.insert(connA, '456');

      // Verify c2u entry exists
      const c2uResult = await dynamodb.executeStatement({
        Statement: `SELECT * FROM "${process.env.TABLE_NAME}" WHERE pk = ? AND sk = ?`,
        Parameters: [
          { S: `${process.env.STAGE}#CONN#${connA}#USER` },
          { N: '0' },
        ],
      });
      expect(c2uResult.Items).toHaveLength(1);
      const c2uEntry = c2uResult.Items?.[0];
      expect(c2uEntry?.userId?.S).toBe('456');
      expect(c2uEntry?.creationTime?.N).toBeDefined();
      expect(c2uEntry?.ttl?.N).toBeDefined();

      // Verify u2c entry exists
      const u2cResult = await dynamodb.executeStatement({
        Statement: `SELECT * FROM "${process.env.TABLE_NAME}" WHERE pk = ?`,
        Parameters: [
          { S: `${process.env.STAGE}#USER#456#CONN` },
        ],
      });
      expect(u2cResult.Items).toHaveLength(1);
      const u2cEntry = u2cResult.Items?.[0];
      expect(u2cEntry?.connectionId?.S).toBe(connA);
      expect(u2cEntry?.ttl?.N).toBeDefined();
    });

    it('should store connectionId encoded as number in u2c sk', async () => {
      await userConnections.insert(connA, '789');

      const u2cResult = await dynamodb.executeStatement({
        Statement: `SELECT sk FROM "${process.env.TABLE_NAME}" WHERE pk = ?`,
        Parameters: [
          { S: `${process.env.STAGE}#USER#789#CONN` },
        ],
      });

      const u2cEntry = u2cResult.Items?.[0];
      expect(u2cEntry?.sk?.N).toBe(connectionIdToNumberValue(connA).value);
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

    it('should round-trip short connectionIds that encode to JS-safe numbers', async () => {
      const shortConn = 'Aw=='; // 1 byte [3] → sk = 3
      await userConnections.insert(shortConn, '1002');

      const connections = await userConnections.getAll('1002');
      expect(connections).toEqual([ shortConn ]);
    });

  });

  describe('delete', () => {

    it('should remove both c2u and u2c entries', async () => {
      await userConnections.insert(connA, '2001');

      await userConnections.delete(connA);

      // Verify c2u entry is gone
      const c2uResult = await dynamodb.executeStatement({
        Statement: `SELECT * FROM "${process.env.TABLE_NAME}" WHERE pk = ?`,
        Parameters: [
          { S: `${process.env.STAGE}#CONN#${connA}#USER` },
        ],
      });
      expect(c2uResult.Items).toHaveLength(0);

      // Verify u2c entry is gone
      const u2cResult = await dynamodb.executeStatement({
        Statement: `SELECT * FROM "${process.env.TABLE_NAME}" WHERE pk = ?`,
        Parameters: [
          { S: `${process.env.STAGE}#USER#2001#CONN` },
        ],
      });
      expect(u2cResult.Items).toHaveLength(0);
    });

    it('should return null when connection does not exist', async () => {
      const result = await userConnections.delete(connA);
      expect(result).toBeNull();
    });

    it('should return the deleted userId and creationTime', async () => {
      await userConnections.insert(connA, '2002');

      const result = await userConnections.delete(connA);

      expect(result).not.toBeNull();
      expect(result?.userId).toBe('2002');
      expect(result?.creationTime).toBeGreaterThan(0);
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

      const subscriptionKeys = { pk: 'dev#THREAD#participant123#item456#SUB', sk: 1234567890 };
      await userConnections.updateConnectionInfo(connA, { subscriptionKeys });

      // Verify the field was set
      const result = await dynamodb.executeStatement({
        Statement: `SELECT subscriptionKeys FROM "${process.env.TABLE_NAME}" WHERE pk = ? AND sk = ?`,
        Parameters: [
          { S: `${process.env.STAGE}#CONN#${connA}#USER` },
          { N: '0' },
        ],
      });
      const storedKeys = result.Items?.[0]?.subscriptionKeys?.M;
      expect(storedKeys?.pk?.S).toBe(subscriptionKeys.pk);
      expect(storedKeys?.sk?.N).toBe(String(subscriptionKeys.sk));
    });

    it('should remove subscriptionKeys when explicitly set to undefined', async () => {
      await userConnections.insert(connB, '5002');
      await userConnections.updateConnectionInfo(connB, {
        subscriptionKeys: { pk: 'dev#THREAD#p#i#SUB', sk: 123 },
      });

      await userConnections.updateConnectionInfo(connB, { subscriptionKeys: undefined });

      const result = await dynamodb.executeStatement({
        Statement: `SELECT subscriptionKeys FROM "${process.env.TABLE_NAME}" WHERE pk = ? AND sk = ?`,
        Parameters: [
          { S: `${process.env.STAGE}#CONN#${connB}#USER` },
          { N: '0' },
        ],
      });
      expect(result.Items?.[0]?.subscriptionKeys).toBeUndefined();
    });

    it('should be a no-op when no fields are specified', async () => {
      await userConnections.insert(connC, '5003');
      await userConnections.updateConnectionInfo(connC, {
        subscriptionKeys: { pk: 'dev#THREAD#p#i#SUB', sk: 123 },
      });

      await userConnections.updateConnectionInfo(connC, {});

      const result = await dynamodb.executeStatement({
        Statement: `SELECT subscriptionKeys FROM "${process.env.TABLE_NAME}" WHERE pk = ? AND sk = ?`,
        Parameters: [
          { S: `${process.env.STAGE}#CONN#${connC}#USER` },
          { N: '0' },
        ],
      });
      expect(result.Items?.[0]?.subscriptionKeys).toBeDefined();
    });

    it('should not throw when connection does not exist', async () => {
      await expect(
        userConnections.updateConnectionInfo(connA, {
          subscriptionKeys: { pk: 'dev#THREAD#p#i#SUB', sk: 123 },
        })
      ).resolves.not.toThrow();
    });

  });

  describe('delete with subscriptionKeys', () => {

    it('should return subscriptionKeys when present', async () => {
      await userConnections.insert(connG, '6001');
      const subscriptionKeys = { pk: 'dev#THREAD#part123#item456#SUB', sk: 9876543210 };
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

  describe('presence entries', () => {

    it('should create a presence entry on insert', async () => {
      await userConnections.insert(connA, '100');

      const result = await queryPresenceEntries();
      expect(result.Items).toHaveLength(1);
      expect(result.Items?.[0]?.userId?.S).toBe('100');
    });

    it('should create only one presence entry for multiple connections from the same user', async () => {
      await userConnections.insert(connA, '200');
      await userConnections.insert(connB, '200');
      await userConnections.insert(connC, '200');

      const result = await queryPresenceEntries();
      expect(result.Items).toHaveLength(1);
      expect(result.Items?.[0]?.userId?.S).toBe('200');
    });

    it('should keep presence entry when deleting one of multiple connections', async () => {
      await userConnections.insert(connD, '300');
      await userConnections.insert(connE, '300');

      await userConnections.delete(connD);

      const result = await queryPresenceEntries();
      expect(result.Items).toHaveLength(1);
      expect(result.Items?.[0]?.userId?.S).toBe('300');
    });

    it('should remove presence entry when deleting the last connection', async () => {
      await userConnections.insert(connA, '400');

      await userConnections.delete(connA);

      const result = await queryPresenceEntries();
      expect(result.Items).toHaveLength(0);
    });

    it('should remove presence entry after deleting all connections one by one', async () => {
      await userConnections.insert(connA, '500');
      await userConnections.insert(connB, '500');

      await userConnections.delete(connA);
      await userConnections.delete(connB);

      const result = await queryPresenceEntries();
      expect(result.Items).toHaveLength(0);
    });

    it('should not remove other users presence entries on delete', async () => {
      await userConnections.insert(connA, '600');
      await userConnections.insert(connB, '700');

      await userConnections.delete(connA);

      const result = await queryPresenceEntries();
      expect(result.Items).toHaveLength(1);
      expect(result.Items?.[0]?.userId?.S).toBe('700');
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

    it('should decrement count after last connection is deleted', async () => {
      await userConnections.insert(connA, '1300');
      await userConnections.insert(connB, '1400');

      await userConnections.delete(connA);

      const count = await userConnections.countDistinctUsers();
      expect(count).toBe(1);
    });

  });

});
