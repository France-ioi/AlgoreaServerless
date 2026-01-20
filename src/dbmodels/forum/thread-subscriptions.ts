import { ConnectionId } from '../../websocket-client';
import { Table, TableKey, wsConnectionTtl } from '../table';
import { ThreadId } from './thread';
import { z } from 'zod';

function pk(thread: ThreadId): string {
  const stage = process.env.STAGE || 'dev';
  return `${stage}#THREAD#${thread.participantId}#${thread.itemId}#SUB`;
}

/**
 * Serialize a ThreadId to a string for storage in connection info.
 */
export function serializeThreadId(thread: ThreadId): string {
  return `${thread.participantId}#${thread.itemId}`;
}

/**
 * Deserialize a ThreadId from its string representation.
 * @throws Error if the serialized string is invalid
 */
export function deserializeThreadId(serialized: string): ThreadId {
  const parts = serialized.split('#');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid serialized ThreadId: ${serialized}`);
  }
  return { participantId: parts[0], itemId: parts[1] };
}

/**
 * Thread subscriptions are stored in the database with the following schema:
 * - pk: see above
 * - sk: insertion time
 * - connectionId: the connection id
 * - ttl: auto-deletion time
 * - userId: the user id of the subscriber
 */
export class ThreadSubscriptions extends Table {

  async getSubscribers(filter: { threadId: ThreadId, connectionId?: ConnectionId }): Promise<{ connectionId: ConnectionId, sk: number }[]> {
    let query = `SELECT connectionId, sk FROM "${ this.tableName }" WHERE pk = ?`;
    const params = [ pk(filter.threadId) ];
    if (filter.connectionId) {
      query += ' AND connectionId = ?';
      params.push(filter.connectionId);
    }
    const results = await this.sqlRead({ query, params });
    // TODO filter those which cannot be parsed and log them in function that can be reused everywhere
    return z.array(
      z.object({
        connectionId: z.string(),
        sk: z.number(),
      })).parse(results);
  }

  async subscribe(thread: ThreadId, connectionId: ConnectionId, userId: string): Promise<void> {
    // TODO: we should check what error we get if we resubscribe while we didn't unsubscribe properly before .. and do something
    await this.sqlWrite({
      query: `INSERT INTO "${ this.tableName }" VALUE { 'pk': ?, 'sk': ?, 'connectionId': ?, 'ttl': ?, 'userId': ? }`,
      params: [ pk(thread), Date.now(), connectionId, wsConnectionTtl(), userId ]
    });
  }

  private async delete(keys: TableKey[]): Promise<void> {
    await this.sqlWrite(keys.map(k => ({
      query: `DELETE FROM "${ this.tableName }" WHERE pk = ? AND sk = ?`,
      params: [ k.pk, k.sk ],
    })));
  }

  async unsubscribeSet(thread: ThreadId, sks: number[]): Promise<void> {
    if (sks.length === 0) return;
    await this.delete(sks.map(sk => ({ pk: pk(thread), sk })));
  }

  async unsubscribeConnectionId(threadId: ThreadId, connectionId: ConnectionId): Promise<void> {
    const entry = await this.getSubscribers({ threadId, connectionId });
    if (!entry.length) {
      // eslint-disable-next-line no-console
      console.warn('Unexpected: unsubscribing from a not existing connection.', JSON.stringify(threadId), connectionId);
      return;
    }
    await this.unsubscribeSet(threadId, entry.map(e => e.sk));
  }
}
