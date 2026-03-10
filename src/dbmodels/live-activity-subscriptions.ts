import { ConnectionId } from '../websocket-client';
import { Table, TableKey, wsConnectionTtl } from './table';
import { z } from 'zod';
import { dbNumber, docClient } from '../dynamodb';
import { safeParseArray } from '../utils/zod-utils';

/**
 * The DynamoDB keys for a live activity subscription entry.
 * Can be used to directly delete the subscription without querying.
 */
export interface LiveActivitySubscriptionKeys {
  pk: string,
  sk: number,
}

function pk(): string {
  const stage = process.env.STAGE || 'dev';
  return `${stage}#LIVE_ACTIVITY#SUB`;
}

/**
 * Live Activity Subscriptions - Connection-level real-time activity tracking
 *
 * A subscription links a specific WebSocket connection to live activity updates.
 *
 * Database schema:
 * - pk: stage#LIVE_ACTIVITY#SUB
 * - sk: insertion timestamp (milliseconds since epoch)
 * - connectionId: the WebSocket connection id
 * - ttl: auto-deletion time (seconds since epoch, DynamoDB TTL format)
 */
export class LiveActivitySubscriptions extends Table {

  async getSubscribers(
    filter?: { connectionId?: ConnectionId }
  ): Promise<{ connectionId: ConnectionId, sk: number }[]> {
    let query = `SELECT connectionId, sk FROM "${this.tableName}" WHERE pk = ?`;
    const params: unknown[] = [ pk() ];
    if (filter?.connectionId) {
      query += ' AND connectionId = ?';
      params.push(filter.connectionId);
    }
    const results = await this.sqlRead({ query, params });
    const subscriberSchema = z.object({
      connectionId: z.string(),
      sk: dbNumber,
    });
    return safeParseArray(results as unknown[], subscriberSchema, 'live activity subscriber');
  }

  async insert(connectionId: ConnectionId): Promise<LiveActivitySubscriptionKeys> {
    const keys: LiveActivitySubscriptionKeys = { pk: pk(), sk: Date.now() };
    await this.sqlWrite({
      query: `INSERT INTO "${this.tableName}" VALUE { 'pk': ?, 'sk': ?, 'connectionId': ?, 'ttl': ? }`,
      params: [ keys.pk, keys.sk, connectionId, wsConnectionTtl() ]
    });
    return keys;
  }

  private async deleteRows(keys: TableKey[]): Promise<void> {
    await this.sqlWrite(keys.map(k => ({
      query: `DELETE FROM "${this.tableName}" WHERE pk = ? AND sk = ?`,
      params: [ k.pk, k.sk ],
    })));
  }

  async deleteByConnectionId(connectionId: ConnectionId): Promise<void> {
    const entries = await this.getSubscribers({ connectionId });
    if (!entries.length) {
      // eslint-disable-next-line no-console
      console.warn('Unexpected: deleting a non-existing live activity subscription.', connectionId);
      return;
    }
    await this.deleteRows(entries.map(e => ({ pk: pk(), sk: e.sk })));
  }

  /**
   * Delete subscription using the keys directly.
   * More efficient than deleteByConnectionId as it doesn't require a query.
   */
  async deleteByKeys(keys: LiveActivitySubscriptionKeys): Promise<void> {
    await this.deleteRows([ keys ]);
  }
}

/** Singleton instance for use across the application */
export const liveActivitySubscriptionsTable = new LiveActivitySubscriptions(docClient);
