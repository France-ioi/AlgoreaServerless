import { ConnectionId } from '../../websocket-client';
import { ForumTable, TableKey } from '../table';
import { ThreadId } from './thread';
import { z } from 'zod';

function ttl(): number {
  /**
   * ttl is the TimeToLive value of the db entry expressed in *seconds*.
   * It is contrained by the connection duration for WebSocket API on API Gateway, which is 2h.
   * https://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html
   */
  const subscribeTtl = 7_200; // 2 hours
  return Date.now()/1000 + subscribeTtl;
}

function pk(thread: ThreadId): string {
  const stage = process.env.STAGE || 'dev';
  return `${stage}#THREAD#${thread.participantId}#${thread.itemId}#SUB`;
}

/**
 * Thread subscriptions are stored in the database with the following schema:
 * - pk: see above
 * - sk: insertion time
 * - connectionId: the connection id
 * - ttl: auto-deletion time
 * - userId: the user id of the subscriber
 */
export class ThreadSubscriptions extends ForumTable {

  async getSubscribers(thread: ThreadId): Promise<{ connectionId: ConnectionId, sk: number }[]> {
    const results = await this.sqlRead({
      query: `SELECT connectionId, sk FROM "${ this.tableName }" WHERE pk = ?;`,
      params: [ pk(thread) ],
    });
    // TODO filter those which cannot be parsed and log them in function that can be reused everywhere
    return z.array(
      z.object({
        connectionId: z.string(),
        sk: z.number(),
      })).parse(results);
  }

  async getSubscriber(thread: ThreadId, connectionId: ConnectionId): Promise<{ sk: number }|undefined> {
    const results = await this.sqlRead({
      query: `SELECT sk FROM "${ this.tableName }" WHERE pk = ? AND connectionId = ? LIMIT 1;`,
      params: [ pk(thread), connectionId ],
    });
    return z.array(
      z.object({
        sk: z.number(),
      })).parse(results)[0];
  }

  async subscribe(thread: ThreadId, connectionId: ConnectionId, userId: string): Promise<void> {
    // TODO: we should check what error we get if we resubscribe while we didn't unsubscribe properly before .. and do something
    await this.sqlWrite({
      query: `INSERT INTO "${ this.tableName }" VALUE { 'pk': ?, 'sk': ?, 'connectionId': ?, 'ttl': ?, 'userId': ? }`,
      params: [ pk(thread), Date.now(), connectionId, ttl(), userId ]
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

  async unsubscribeConnectionId(thread: ThreadId, connectionId: ConnectionId): Promise<void> {
    const entry = await this.getSubscriber(thread, connectionId);
    if (!entry) {
      // eslint-disable-next-line no-console
      console.warn('Unexpected: unsubscribing from a not existing connection.', JSON.stringify(thread), connectionId);
      return;
    }
    await this.delete([{ pk: pk(thread), sk: entry.sk }]);
  }
}
