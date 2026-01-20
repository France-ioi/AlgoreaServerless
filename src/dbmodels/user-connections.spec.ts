import { UserConnections } from './user-connections';
import { dynamodb } from '../dynamodb';
import { clearTable } from '../testutils/db';

describe('UserConnections', () => {
  let userConnections: UserConnections;

  beforeEach(async () => {
    userConnections = new UserConnections(dynamodb);
    await clearTable();
  });

  describe('insert', () => {

    it('should create both c2u and u2c entries', async () => {
      await userConnections.insert('conn-123', 'user-456');

      // Verify c2u entry exists
      const c2uResult = await dynamodb.executeStatement({
        Statement: `SELECT * FROM "${process.env.TABLE_NAME}" WHERE pk = ? AND sk = ?`,
        Parameters: [
          { S: `${process.env.STAGE}#CONN#conn-123#USER` },
          { N: '0' },
        ],
      });
      expect(c2uResult.Items).toHaveLength(1);
      const c2uEntry = c2uResult.Items?.[0];
      expect(c2uEntry?.userId?.S).toBe('user-456');
      expect(c2uEntry?.creationTime?.N).toBeDefined();
      expect(c2uEntry?.ttl?.N).toBeDefined();

      // Verify u2c entry exists
      const u2cResult = await dynamodb.executeStatement({
        Statement: `SELECT * FROM "${process.env.TABLE_NAME}" WHERE pk = ?`,
        Parameters: [
          { S: `${process.env.STAGE}#USER#user-456#CONN` },
        ],
      });
      expect(u2cResult.Items).toHaveLength(1);
      const u2cEntry = u2cResult.Items?.[0];
      expect(u2cEntry?.connectionId?.S).toBe('conn-123');
      expect(u2cEntry?.ttl?.N).toBeDefined();
    });

    it('should set matching creationTime in both entries', async () => {
      await userConnections.insert('conn-abc', 'user-xyz');

      const c2uResult = await dynamodb.executeStatement({
        Statement: `SELECT creationTime FROM "${process.env.TABLE_NAME}" WHERE pk = ? AND sk = ?`,
        Parameters: [
          { S: `${process.env.STAGE}#CONN#conn-abc#USER` },
          { N: '0' },
        ],
      });

      const u2cResult = await dynamodb.executeStatement({
        Statement: `SELECT sk FROM "${process.env.TABLE_NAME}" WHERE pk = ?`,
        Parameters: [
          { S: `${process.env.STAGE}#USER#user-xyz#CONN` },
        ],
      });

      // creationTime in c2u should match sk in u2c
      const c2uEntry = c2uResult.Items?.[0];
      const u2cEntry = u2cResult.Items?.[0];
      expect(c2uEntry?.creationTime?.N).toBe(u2cEntry?.sk?.N);
    });

    it('should handle multiple connections for the same user', async () => {
      await userConnections.insert('conn-1', 'user-multi');
      await userConnections.insert('conn-2', 'user-multi');
      await userConnections.insert('conn-3', 'user-multi');

      const connections = await userConnections.getAll('user-multi');
      expect(connections).toHaveLength(3);
      expect(connections).toContain('conn-1');
      expect(connections).toContain('conn-2');
      expect(connections).toContain('conn-3');
    });

  });

  describe('delete', () => {

    it('should remove both c2u and u2c entries', async () => {
      await userConnections.insert('conn-del', 'user-del');

      await userConnections.delete('conn-del');

      // Verify c2u entry is gone
      const c2uResult = await dynamodb.executeStatement({
        Statement: `SELECT * FROM "${process.env.TABLE_NAME}" WHERE pk = ?`,
        Parameters: [
          { S: `${process.env.STAGE}#CONN#conn-del#USER` },
        ],
      });
      expect(c2uResult.Items).toHaveLength(0);

      // Verify u2c entry is gone
      const u2cResult = await dynamodb.executeStatement({
        Statement: `SELECT * FROM "${process.env.TABLE_NAME}" WHERE pk = ?`,
        Parameters: [
          { S: `${process.env.STAGE}#USER#user-del#CONN` },
        ],
      });
      expect(u2cResult.Items).toHaveLength(0);
    });

    it('should not throw when connection does not exist', async () => {
      await expect(userConnections.delete('non-existent-conn')).resolves.not.toThrow();
    });

    it('should only delete the specified connection for a user with multiple connections', async () => {
      await userConnections.insert('conn-keep-1', 'user-partial');
      await userConnections.insert('conn-delete', 'user-partial');
      await userConnections.insert('conn-keep-2', 'user-partial');

      await userConnections.delete('conn-delete');

      const connections = await userConnections.getAll('user-partial');
      expect(connections).toHaveLength(2);
      expect(connections).toContain('conn-keep-1');
      expect(connections).toContain('conn-keep-2');
      expect(connections).not.toContain('conn-delete');
    });

  });

  describe('getAll', () => {

    it('should return all connections for a user', async () => {
      await userConnections.insert('conn-a', 'user-getall');
      await userConnections.insert('conn-b', 'user-getall');

      const connections = await userConnections.getAll('user-getall');

      expect(connections).toHaveLength(2);
      expect(connections).toContain('conn-a');
      expect(connections).toContain('conn-b');
    });

    it('should return empty array when user has no connections', async () => {
      const connections = await userConnections.getAll('user-no-connections');

      expect(connections).toEqual([]);
    });

    it('should not return connections from other users', async () => {
      await userConnections.insert('conn-user1', 'user-1');
      await userConnections.insert('conn-user2', 'user-2');

      const user1Connections = await userConnections.getAll('user-1');
      const user2Connections = await userConnections.getAll('user-2');

      expect(user1Connections).toEqual([ 'conn-user1' ]);
      expect(user2Connections).toEqual([ 'conn-user2' ]);
    });

  });

});
