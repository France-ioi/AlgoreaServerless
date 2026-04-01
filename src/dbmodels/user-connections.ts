/* eslint-disable @typescript-eslint/naming-convention */
import { Table, wsConnectionTtl } from './table';
import { QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { docClient } from '../dynamodb';
import { DBError } from '../utils/errors';

export type ConnectionId = string;
export type UserId = string;

const connectionEntrySchema = z.looseObject({
  userId: z.string(),
});

type ConnectionEntry = z.infer<typeof connectionEntrySchema>;

/**
 * Arbitrary metadata that can be stored/updated on a connection.
 * Keys present with a value are SET, keys present with `undefined` are REMOVED,
 * absent keys are left untouched.
 */
type ConnectionInfo = Record<string, unknown>;

const LIVE_ACTIVITY_PK = 'LIVE_ACTIVITY_SUB';

/**
 * UserConnections tracks WebSocket connections in a dedicated table.
 *
 * One item per connection:
 *   connectionId (S, partition key), userId, creationTime, ttl, optional metadata
 *
 * GSI "user-connections": pk=userId, sk=connectionId — used by getAll(userId)
 * Sparse GSI "live-activity-subscribers": pk=liveActivityPk, sk=connectionId
 *   — only items with liveActivityPk attribute appear in this index
 */
export class UserConnections extends Table {

  constructor(db = docClient) {
    super(db, 'TABLE_CONNECTIONS');
  }

  async insert(connectionId: ConnectionId, userId: UserId): Promise<void> {
    const creationTime = Date.now();
    const ttl = wsConnectionTtl();
    await this.upsert({ connectionId, userId, creationTime, ttl });
  }

  /**
   * Delete a connection by connectionId.
   * @returns The deleted connection entry (core fields + any extra metadata), or null if not found
   */
  async delete(connectionId: ConnectionId): Promise<ConnectionEntry | null> {
    const results = await this.sqlRead({
      query: `SELECT * FROM "${this.tableName}" WHERE connectionId = ?`,
      params: [ connectionId ],
    });

    if (results.length === 0) return null;

    const entry = connectionEntrySchema.parse(results[0]);

    await this.sqlWrite({
      query: `DELETE FROM "${this.tableName}" WHERE connectionId = ?`,
      params: [ connectionId ],
    });

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
    query += ' WHERE connectionId = ? AND attribute_exists(connectionId)';
    params.push(connectionId);

    try {
      await this.sqlWrite({ query, params });
    } catch (err) {
      if (err instanceof DBError && err.cause instanceof Error && err.cause.name.includes('ConditionalCheckFailed')) return;
      throw err;
    }
  }

  /**
   * Get all connection IDs for a given user via the user-connections GSI.
   */
  async getAll(userId: UserId): Promise<ConnectionId[]> {
    try {
      const results: ConnectionId[] = [];
      let lastEvaluatedKey: Record<string, unknown> | undefined;

      do {
        const output = await this.db.send(new QueryCommand({
          TableName: this.tableName,
          IndexName: 'user-connections',
          KeyConditionExpression: 'userId = :userId',
          ExpressionAttributeValues: { ':userId': userId },
          ProjectionExpression: 'connectionId',
          ExclusiveStartKey: lastEvaluatedKey,
        }));

        for (const item of output.Items ?? []) {
          if (typeof item.connectionId === 'string') results.push(item.connectionId);
        }
        lastEvaluatedKey = output.LastEvaluatedKey as Record<string, unknown> | undefined;
      } while (lastEvaluatedKey);

      return results;
    } catch (err) {
      if (err instanceof Error) throw new DBError(`[${err.name}] ${err.message}`, userId, { cause: err });
      throw err;
    }
  }

  /** Count the number of distinct users currently connected (scan + dedup, table is small). */
  async countDistinctUsers(): Promise<number> {
    try {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const userIds = new Set<string>();
      let lastEvaluatedKey: Record<string, unknown> | undefined;

      do {
        const output = await this.db.send(new ScanCommand({
          TableName: this.tableName,
          ProjectionExpression: 'userId',
          FilterExpression: '#ttl > :now',
          ExpressionAttributeNames: { '#ttl': 'ttl' },
          ExpressionAttributeValues: { ':now': nowSeconds },
          ExclusiveStartKey: lastEvaluatedKey,
        }));

        for (const item of output.Items ?? []) {
          if (typeof item.userId === 'string') {
            userIds.add(item.userId);
          }
        }
        lastEvaluatedKey = output.LastEvaluatedKey as Record<string, unknown> | undefined;
      } while (lastEvaluatedKey);

      return userIds.size;
    } catch (err) {
      if (err instanceof Error) throw new DBError(`[${err.name}] ${err.message}`, 'countDistinctUsers', { cause: err });
      throw err;
    }
  }

  /** Subscribe a connection to live activity updates (sets sparse GSI attribute). */
  async subscribeLiveActivity(connectionId: ConnectionId): Promise<void> {
    try {
      await this.db.send(new UpdateCommand({
        TableName: this.tableName,
        Key: { connectionId },
        UpdateExpression: 'SET liveActivityPk = :val',
        ExpressionAttributeValues: { ':val': LIVE_ACTIVITY_PK },
      }));
    } catch (err) {
      if (err instanceof Error) throw new DBError(`[${err.name}] ${err.message}`, connectionId, { cause: err });
      throw err;
    }
  }

  /** Unsubscribe a connection from live activity updates (removes sparse GSI attribute). */
  async unsubscribeLiveActivity(connectionId: ConnectionId): Promise<void> {
    try {
      await this.db.send(new UpdateCommand({
        TableName: this.tableName,
        Key: { connectionId },
        UpdateExpression: 'REMOVE liveActivityPk',
      }));
    } catch (err) {
      if (err instanceof Error) throw new DBError(`[${err.name}] ${err.message}`, connectionId, { cause: err });
      throw err;
    }
  }

  /** Get all connections subscribed to live activity via the sparse GSI. */
  async getLiveActivitySubscribers(): Promise<{ connectionId: ConnectionId }[]> {
    try {
      const results: { connectionId: ConnectionId }[] = [];
      let lastEvaluatedKey: Record<string, unknown> | undefined;

      do {
        const output = await this.db.send(new QueryCommand({
          TableName: this.tableName,
          IndexName: 'live-activity-subscribers',
          KeyConditionExpression: 'liveActivityPk = :pk',
          ExpressionAttributeValues: { ':pk': LIVE_ACTIVITY_PK },
          ExclusiveStartKey: lastEvaluatedKey,
        }));

        for (const item of output.Items ?? []) {
          if (typeof item.connectionId === 'string') {
            results.push({ connectionId: item.connectionId });
          }
        }
        lastEvaluatedKey = output.LastEvaluatedKey as Record<string, unknown> | undefined;
      } while (lastEvaluatedKey);

      return results;
    } catch (err) {
      if (err instanceof Error) throw new DBError(`[${err.name}] ${err.message}`, 'getLiveActivitySubscribers', { cause: err });
      throw err;
    }
  }
}

/** Singleton instance for use across the application */
export const userConnectionsTable = new UserConnections(docClient);
