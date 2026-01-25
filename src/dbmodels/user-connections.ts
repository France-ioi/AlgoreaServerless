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
  subscribedThreadId: z.string().optional(), // Serialized as `participantId#itemId`
});

type C2uEntry = z.infer<typeof c2uEntrySchema>;

/**
 * Additional info that can be stored/updated on a connection.
 * Derived from c2uEntrySchema, excluding core fields (userId, creationTime).
 */
export type ConnectionInfo = Partial<Omit<C2uEntry, 'userId' | 'creationTime'>>;

const u2cEntrySchema = z.object({
  connectionId: z.string(),
  sk: z.number(),
});

/**
 * UserConnections tracks WebSocket connections per user.
 *
 * Two entry types are stored:
 * - c2u (connection to user): pk: `${stage}#CONN#${connectionId}#USER`, sk: 0
 *   Contains: userId, creationTime (ms since epoch), ttl (seconds since epoch, DynamoDB TTL format)
 * - u2c (user to connection): pk: `${stage}#USER#${userId}#CONN`, sk: creationTime (ms since epoch)
 *   Contains: connectionId, ttl (seconds since epoch, DynamoDB TTL format)
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
   * @returns The deleted connection info, or null if the connection was not found
   */
  async delete(connectionId: ConnectionId): Promise<C2uEntry | null> {
    // 1) Get c2u entry to find userId, creationTime, and any subscription info
    const c2uResults = await this.sqlRead({
      query: `SELECT userId, creationTime, subscribedThreadId FROM "${this.tableName}" WHERE pk = ? AND sk = ?`,
      params: [ c2uPk(connectionId), 0 ],
    });

    if (c2uResults.length === 0) {
      // Connection not found, nothing to delete
      return null;
    }

    const { userId, creationTime, subscribedThreadId } = c2uEntrySchema.parse(c2uResults[0]);

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

    return { userId, creationTime, subscribedThreadId };
  }

  /**
   * Update additional info for a connection (e.g., subscription info).
   * Uses SET for provided values and REMOVE for undefined values.
   * This is a best-effort operation - if the connection doesn't exist, it silently succeeds.
   */
  async updateConnectionInfo(connectionId: ConnectionId, info: ConnectionInfo): Promise<void> {
    const setClauses: string[] = [];
    const removeClauses: string[] = [];
    const params: unknown[] = [];

    if (info.subscribedThreadId !== undefined) {
      setClauses.push('subscribedThreadId = ?');
      params.push(info.subscribedThreadId);
    } else {
      removeClauses.push('subscribedThreadId');
    }

    let query = `UPDATE "${this.tableName}"`;
    if (setClauses.length > 0) {
      query += ` SET ${setClauses.join(', ')}`;
    }
    if (removeClauses.length > 0) {
      query += ` REMOVE ${removeClauses.join(', ')}`;
    }
    query += ' WHERE pk = ? AND sk = ? AND attribute_exists(pk)';
    params.push(c2uPk(connectionId), 0);

    try {
      await this.sqlWrite({ query, params });
    } catch (err) {
      // Ignore ConditionalCheckFailedException - connection might have been deleted or TTL'd
      if (err instanceof Error && err.message.includes('ConditionalCheckFailedException')) {
        return;
      }
      throw err;
    }
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
