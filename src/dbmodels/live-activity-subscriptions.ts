import { ConnectionId } from '../websocket-client';
import { Table, wsConnectionTtl } from './table';
import { z } from 'zod';
import { docClient } from '../dynamodb';
import { safeParseArray } from '../utils/zod-utils';
import { connectionIdToNumberValue, dbConnectionId } from '../utils/connection-id-number';

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
 * - sk: connectionId encoded as a number (base64 → big-endian unsigned integer)
 * - connectionId: the WebSocket connection id string (stored for debugging, not read back)
 * - ttl: auto-deletion time (seconds since epoch, DynamoDB TTL format)
 */
export class LiveActivitySubscriptions extends Table {

  async getSubscribers(): Promise<{ connectionId: ConnectionId }[]> {
    const results = await this.sqlRead({
      query: `SELECT sk FROM "${this.tableName}" WHERE pk = ?`,
      params: [ pk() ],
    });
    const subscriberSchema = z.object({
      sk: dbConnectionId,
    }).transform(({ sk }) => ({ connectionId: sk }));
    return safeParseArray(results, subscriberSchema, 'live activity subscriber');
  }

  async insert(connectionId: ConnectionId): Promise<void> {
    const sk = connectionIdToNumberValue(connectionId);
    await this.sqlWrite({
      query: `INSERT INTO "${this.tableName}" VALUE { 'pk': ?, 'sk': ?, 'connectionId': ?, 'ttl': ? }`,
      params: [ pk(), sk, connectionId, wsConnectionTtl() ],
    });
  }

  async deleteByConnectionId(connectionId: ConnectionId): Promise<void> {
    const sk = connectionIdToNumberValue(connectionId);
    await this.sqlWrite({
      query: `DELETE FROM "${this.tableName}" WHERE pk = ? AND sk = ?`,
      params: [ pk(), sk ],
    });
  }
}

/** Singleton instance for use across the application */
export const liveActivitySubscriptionsTable = new LiveActivitySubscriptions(docClient);
