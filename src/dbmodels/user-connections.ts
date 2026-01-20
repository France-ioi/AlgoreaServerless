import { Table, wsConnectionTtl } from './table';
import { z } from 'zod';

export type ConnectionId = string;
export type UserId = string;

function c2uPk(connectionId: ConnectionId): string {
  const stage = process.env.STAGE || 'dev';
  return `${stage}#CONN#${connectionId}#USER`;
}

function u2cPk(userId: UserId): string {
  const stage = process.env.STAGE || 'dev';
  return `${stage}#USER#${userId}#CONN`;
}

const c2uEntrySchema = z.object({
  userId: z.string(),
  creationTime: z.number(),
});

const u2cEntrySchema = z.object({
  connectionId: z.string(),
  sk: z.number(),
});

/**
 * UserConnections tracks WebSocket connections per user.
 *
 * Two entry types are stored:
 * - c2u (connection to user): pk: `${stage}#CONN#${connectionId}#USER`, sk: 0
 *   Contains: userId, creationTime, ttl
 * - u2c (user to connection): pk: `${stage}#USER#${userId}#CONN`, sk: creationTime
 *   Contains: connectionId, ttl
 */
export class UserConnections extends Table {

  /**
   * Insert a new user connection (creates both c2u and u2c entries).
   */
  async insert(connectionId: ConnectionId, userId: UserId): Promise<void> {
    const creationTime = Date.now();
    const ttl = wsConnectionTtl();

    await this.sqlWrite([
      {
        query: `INSERT INTO "${this.tableName}" VALUE { 'pk': ?, 'sk': ?, 'ttl': ?, 'userId': ?, 'creationTime': ? }`,
        params: [ c2uPk(connectionId), 0, ttl, userId, creationTime ],
      },
      {
        query: `INSERT INTO "${this.tableName}" VALUE { 'pk': ?, 'sk': ?, 'ttl': ?, 'connectionId': ? }`,
        params: [ u2cPk(userId), creationTime, ttl, connectionId ],
      },
    ]);
  }

  /**
   * Delete a user connection by connectionId.
   * Removes both c2u and u2c entries.
   */
  async delete(connectionId: ConnectionId): Promise<void> {
    // 1) Get c2u entry to find userId and creationTime
    const c2uResults = await this.sqlRead({
      query: `SELECT userId, creationTime FROM "${this.tableName}" WHERE pk = ? AND sk = ?`,
      params: [ c2uPk(connectionId), 0 ],
    });

    if (c2uResults.length === 0) {
      // Connection not found, nothing to delete
      return;
    }

    const { userId, creationTime } = c2uEntrySchema.parse(c2uResults[0]);

    // 2) Delete both entries in a transaction
    await this.sqlWrite([
      {
        query: `DELETE FROM "${this.tableName}" WHERE pk = ? AND sk = ?`,
        params: [ c2uPk(connectionId), 0 ],
      },
      {
        query: `DELETE FROM "${this.tableName}" WHERE pk = ? AND sk = ?`,
        params: [ u2cPk(userId), creationTime ],
      },
    ]);
  }

  /**
   * Get all connection IDs for a given user.
   */
  async getAll(userId: UserId): Promise<ConnectionId[]> {
    const results = await this.sqlRead({
      query: `SELECT connectionId, sk FROM "${this.tableName}" WHERE pk = ?`,
      params: [ u2cPk(userId) ],
    });

    return z.array(u2cEntrySchema).parse(results).map(entry => entry.connectionId);
  }
}
