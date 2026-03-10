import { Table, wsConnectionTtl } from './table';
import { z } from 'zod';
import { dynamodb } from '../dynamodb';

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

const c2uEntrySchema = z.looseObject({
  userId: z.string(),
  creationTime: z.number(),
});

type C2uEntry = z.infer<typeof c2uEntrySchema>;

/**
 * Arbitrary metadata that can be stored/updated on a connection.
 * Keys present with a value are SET, keys present with `undefined` are REMOVED,
 * absent keys are left untouched.
 */
type ConnectionInfo = Record<string, unknown>;

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
   * @returns The deleted connection entry (core fields + any extra metadata), or null if not found
   */
  async delete(connectionId: ConnectionId): Promise<C2uEntry | null> {
    const c2uResults = await this.sqlRead({
      query: `SELECT * FROM "${this.tableName}" WHERE pk = ? AND sk = ?`,
      params: [ c2uPk(connectionId), 0 ],
    });

    if (c2uResults.length === 0) {
      // Connection not found, nothing to delete
      return null;
    }

    const entry = c2uEntrySchema.parse(c2uResults[0]);

    // 2) Delete both entries in a transaction
    await this.sqlWrite([
      {
        query: `DELETE FROM "${this.tableName}" WHERE pk = ? AND sk = ?`,
        params: [ c2uPk(connectionId), 0 ],
      },
      {
        query: `DELETE FROM "${this.tableName}" WHERE pk = ? AND sk = ?`,
        params: [ u2cPk(entry.userId), entry.creationTime ],
      },
    ]);

    return entry;
  }

  /**
   * Update additional info for a connection (e.g., subscription info).
   * Only fields explicitly present in `info` are affected:
   * - Provided with a value: SET the field
   * - Provided as undefined: REMOVE the field
   * - Not present at all: left untouched
   * This is a best-effort operation - if the connection doesn't exist, it silently succeeds.
   */
  async updateConnectionInfo(connectionId: ConnectionId, info: ConnectionInfo): Promise<void> {
    const setClauses: string[] = [];
    const removeClauses: string[] = [];
    const params: unknown[] = [];

    for (const key of Object.keys(info)) {
      const value = info[key];
      if (value !== undefined) {
        setClauses.push(`${key} = ?`);
        params.push(value);
      } else {
        removeClauses.push(key);
      }
    }

    if (setClauses.length === 0 && removeClauses.length === 0) return;

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

/** Singleton instance for use across the application */
export const userConnectionsTable = new UserConnections(dynamodb);
