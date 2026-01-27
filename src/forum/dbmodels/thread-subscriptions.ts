import { ConnectionId } from '../../websocket-client';
import { Table, TableKey, wsConnectionTtl } from '../../dbmodels/table';
import { ThreadId } from './thread';
import { z } from 'zod';
import { dynamodb } from '../../dynamodb';
import { safeParseArray } from '../../utils/zod-utils';

/**
 * The DynamoDB keys for a subscription entry.
 * Can be used to directly delete the subscription without querying.
 */
export interface SubscriptionKeys {
  pk: string,
  sk: number,
}

function pk(thread: ThreadId): string {
  const stage = process.env.STAGE || 'dev';
  return `${stage}#THREAD#${thread.participantId}#${thread.itemId}#SUB`;
}

/**
 * Thread Subscriptions - Connection-level real-time update tracking
 *
 * A subscription links a specific WebSocket connection to a thread, enabling real-time
 * message delivery to that particular frontend instance (browser tab/window).
 *
 * Key distinction from ThreadFollows:
 * - Subscription = connection-specific, short-lived (TTL-based), for live updates
 * - Follow = user-specific, persistent, for notifications
 *
 * Database schema:
 * - pk: stage#THREAD#{participantId}#{itemId}#SUB
 * - sk: insertion timestamp (milliseconds since epoch, allows multiple subscriptions per thread)
 * - connectionId: the WebSocket connection id
 * - ttl: auto-deletion time (seconds since epoch, DynamoDB TTL format, tied to WebSocket connection lifetime)
 * - userId: the user id of the subscriber
 */
export class ThreadSubscriptions extends Table {

  async getSubscribers(
    filter: { threadId: ThreadId, connectionId?: ConnectionId }
  ): Promise<{ connectionId: ConnectionId, sk: number, userId: string }[]> {
    let query = `SELECT connectionId, sk, userId FROM "${ this.tableName }" WHERE pk = ?`;
    const params = [ pk(filter.threadId) ];
    if (filter.connectionId) {
      query += ' AND connectionId = ?';
      params.push(filter.connectionId);
    }
    const results = await this.sqlRead({ query, params });
    const subscriberSchema = z.object({
      connectionId: z.string(),
      sk: z.number(),
      userId: z.string(),
    });
    return safeParseArray(results as unknown[], subscriberSchema, 'thread subscriber');
  }

  async insert(thread: ThreadId, connectionId: ConnectionId, userId: string): Promise<SubscriptionKeys> {
    const keys: SubscriptionKeys = { pk: pk(thread), sk: Date.now() };
    await this.sqlWrite({
      query: `INSERT INTO "${ this.tableName }" VALUE { 'pk': ?, 'sk': ?, 'connectionId': ?, 'ttl': ?, 'userId': ? }`,
      params: [ keys.pk, keys.sk, connectionId, wsConnectionTtl(), userId ]
    });
    return keys;
  }

  private async deleteRows(keys: TableKey[]): Promise<void> {
    await this.sqlWrite(keys.map(k => ({
      query: `DELETE FROM "${ this.tableName }" WHERE pk = ? AND sk = ?`,
      params: [ k.pk, k.sk ],
    })));
  }

  async deleteSet(thread: ThreadId, sks: number[]): Promise<void> {
    if (sks.length === 0) return;
    await this.deleteRows(sks.map(sk => ({ pk: pk(thread), sk })));
  }

  async deleteByConnectionId(threadId: ThreadId, connectionId: ConnectionId): Promise<void> {
    const entry = await this.getSubscribers({ threadId, connectionId });
    if (!entry.length) {
      // eslint-disable-next-line no-console
      console.warn('Unexpected: deleting a non-existing subscription.', JSON.stringify(threadId), connectionId);
      return;
    }
    await this.deleteSet(threadId, entry.map(e => e.sk));
  }

  /**
   * Delete subscription using the keys directly.
   * More efficient than deleteByConnectionId as it doesn't require a query.
   */
  async deleteByKeys(keys: SubscriptionKeys): Promise<void> {
    await this.deleteRows([ keys ]);
  }
}

/** Singleton instance for use across the application */
export const threadSubscriptionsTable = new ThreadSubscriptions(dynamodb);
