import { Table, TableKey } from './table';
import { z } from 'zod';
import { dynamodb } from '../dynamodb';

/**
 * Notification TTL in seconds (~2 months / 60 days).
 */
export const NOTIFICATION_TTL_SECONDS = 60 * 60 * 24 * 60;

/**
 * Calculates the TTL value for a notification in seconds since epoch.
 */
export function notificationTtl(): number {
  return Math.floor(Date.now() / 1000) + NOTIFICATION_TTL_SECONDS;
}

function pk(userId: string): string {
  const stage = process.env.STAGE || 'dev';
  return `${stage}#USER#${userId}#NOTIF`;
}

export const notificationSchema = z.object({
  sk: z.number(),
  notificationType: z.string(),
  payload: z.record(z.string(), z.unknown()),
  readTime: z.number().optional(),
});

export type Notification = z.infer<typeof notificationSchema>;

export type NotificationInput = Pick<Notification, 'notificationType' | 'payload'>;

/**
 * User Notifications - Per-user notification storage
 *
 * Database schema:
 * - pk: ${stage}#USER#${userId}#NOTIF
 * - sk: creation time (milliseconds)
 * - ttl: auto-deletion time (~2 months after creation)(seconds since epoch, DynamoDB TTL format)
 * - notificationType: string identifying the notification type
 * - payload: arbitrary JSON data specific to the notification type
 * - readTime: timestamp (milliseconds) when marked as read (undefined = unread)
 */
export class Notifications extends Table {

  /**
   * Get notifications for a user.
   * - Returns notifications in descending order (newest first)
   * - The limit may be constrained by DynamoDB query limits
   * - Entries that cannot be parsed against the schema are silently ignored
   */
  async getNotifications(userId: string, limit: number): Promise<Notification[]> {
    const results = await this.query({
      pk: pk(userId),
      projectionAttributes: [ 'sk', 'notificationType', 'payload', 'readTime' ],
      limit,
      scanIndexForward: false, // false = DESC order (newest first)
    });
    return results
      .map(r => notificationSchema.safeParse(r))
      .filter(r => r.success)
      .map(r => r.data);
  }

  async create(userId: string, notification: NotificationInput): Promise<number> {
    const sk = Date.now();
    await this.createWithSk(userId, sk, notification);
    return sk;
  }

  /**
   * Create a notification with a pre-determined sk (timestamp).
   * Useful when sk needs to be known upfront (e.g., for parallel WS delivery).
   */
  async createWithSk(userId: string, sk: number, notification: NotificationInput): Promise<void> {
    await this.sqlWrite({
      query: `INSERT INTO "${this.tableName}" VALUE { 'pk': ?, 'sk': ?, 'notificationType': ?, 'payload': ?, 'ttl': ? }`,
      params: [ pk(userId), sk, notification.notificationType, notification.payload, notificationTtl() ],
    });
  }

  async delete(userId: string, sk: number): Promise<void> {
    await this.sqlWrite({
      query: `DELETE FROM "${this.tableName}" WHERE pk = ? AND sk = ?`,
      params: [ pk(userId), sk ],
    });
  }

  async deleteAll(userId: string): Promise<void> {
    // First get all notifications for this user
    const results = await this.query({
      pk: pk(userId),
      projectionAttributes: [ 'sk' ],
    });

    if (results.length === 0) return;

    // Delete them in batches
    const keys: TableKey[] = results
      .filter(r => typeof r.sk === 'number')
      .map(r => ({ pk: pk(userId), sk: r.sk as number }));

    if (keys.length === 0) return;

    await this.sqlWrite(keys.map(k => ({
      query: `DELETE FROM "${this.tableName}" WHERE pk = ? AND sk = ?`,
      params: [ k.pk, k.sk ],
    })));
  }

  async setReadTime(userId: string, sk: number, readTime: number | undefined): Promise<void> {
    if (readTime !== undefined) {
      await this.sqlWrite({
        query: `UPDATE "${this.tableName}" SET readTime = ? WHERE pk = ? AND sk = ?`,
        params: [ readTime, pk(userId), sk ],
      });
    } else {
      await this.sqlWrite({
        query: `UPDATE "${this.tableName}" REMOVE readTime WHERE pk = ? AND sk = ?`,
        params: [ pk(userId), sk ],
      });
    }
  }
}

/** Singleton instance for use across the application */
export const notificationsTable = new Notifications(dynamodb);
