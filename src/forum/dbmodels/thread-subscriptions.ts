import { ConnectionId } from '../../websocket-client';
import { Table, wsConnectionTtl } from '../../dbmodels/table';
import { ThreadId } from './thread';
import { z } from 'zod';
import { docClient } from '../../dynamodb';
import { safeParseArray } from '../../utils/zod-utils';
import { connectionIdToNumberValue, dbConnectionId } from '../../utils/connection-id-number';

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
 * - sk: connectionId encoded as a number (base64 → big-endian unsigned integer)
 * - connectionId: the WebSocket connection id string (stored for debugging, not read back)
 * - ttl: auto-deletion time (seconds since epoch, DynamoDB TTL format, tied to WebSocket connection lifetime)
 * - userId: the user id of the subscriber
 */
export class ThreadSubscriptions extends Table {

  async getSubscribers(threadId: ThreadId): Promise<{ connectionId: ConnectionId, userId: string }[]> {
    const results = await this.sqlRead({
      query: `SELECT sk, userId FROM "${ this.tableName }" WHERE pk = ?`,
      params: [ pk(threadId) ],
    });
    const subscriberSchema = z.object({
      sk: dbConnectionId,
      userId: z.string(),
    }).transform(({ sk, userId }) => ({ connectionId: sk, userId }));
    return safeParseArray(results, subscriberSchema, 'thread subscriber');
  }

  async insert(threadId: ThreadId, connectionId: ConnectionId, userId: string): Promise<void> {
    const sk = connectionIdToNumberValue(connectionId);
    await this.sqlWrite({
      query: `INSERT INTO "${ this.tableName }" VALUE { 'pk': ?, 'sk': ?, 'connectionId': ?, 'ttl': ?, 'userId': ? }`,
      params: [ pk(threadId), sk, connectionId, wsConnectionTtl(), userId ]
    });
  }

  async deleteByConnectionId(threadId: ThreadId, connectionId: ConnectionId): Promise<void> {
    const sk = connectionIdToNumberValue(connectionId);
    await this.sqlWrite({
      query: `DELETE FROM "${ this.tableName }" WHERE pk = ? AND sk = ?`,
      params: [ pk(threadId), sk ],
    });
  }
}

/** Singleton instance for use across the application */
export const threadSubscriptionsTable = new ThreadSubscriptions(docClient);
