import { Table } from './table';
import { z } from 'zod';
import { safeNumber, deepConvertNumberValues, docClient } from '../dynamodb';
import { safeParseArray } from '../utils/zod-utils';

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

export const notificationSchema = z.object({
  creationTime: safeNumber,
  notificationType: z.string(),
  payload: z.record(z.string(), z.unknown()).transform(p => deepConvertNumberValues(p) as Record<string, unknown>),
  readTime: safeNumber.optional(),
}).transform(({ creationTime, ...rest }) => ({ sk: creationTime, ...rest }));

export type Notification = z.infer<typeof notificationSchema>;

export type NotificationInput = Pick<Notification, 'notificationType' | 'payload'>;

/**
 * User Notifications - Per-user notification storage in a dedicated table.
 *
 * Database schema (table: TABLE_NOTIFICATIONS):
 * - userId (S): partition key — the user who owns the notification
 * - creationTime (N): sort key — creation time in milliseconds
 * - ttl: auto-deletion time (~2 months after creation, seconds since epoch, DynamoDB TTL format)
 * - notificationType: string identifying the notification type
 * - payload: arbitrary JSON data specific to the notification type
 * - readTime: timestamp (milliseconds) when marked as read (undefined = unread)
 */
export class Notifications extends Table {
  protected override readonly pkAttribute = 'userId';
  protected override readonly skAttribute = 'creationTime';

  constructor(db: typeof docClient) {
    super(db, 'TABLE_NOTIFICATIONS');
  }

  /**
   * Get notifications for a user.
   * - Returns notifications in descending order (newest first)
   * - The limit may be constrained by DynamoDB query limits
   * - Entries that cannot be parsed against the schema are filtered out and logged
   */
  async getNotifications(userId: string, limit: number): Promise<Notification[]> {
    const results = await this.query({
      pk: userId,
      projectionAttributes: [ this.skAttribute, 'notificationType', 'payload', 'readTime' ],
      limit,
      scanIndexForward: false, // false = DESC order (newest first)
    });
    return safeParseArray(results, notificationSchema, 'notification');
  }

  async insert(userId: string, notification: NotificationInput): Promise<number> {
    const sk = Date.now();
    await this.insertWithSk(userId, sk, notification);
    return sk;
  }

  /**
   * Insert a notification with a pre-determined sk (timestamp).
   * Useful when sk needs to be known upfront (e.g., for parallel WS delivery).
   */
  async insertWithSk(userId: string, sk: number, notification: NotificationInput): Promise<void> {
    await this.sqlWrite({
      query: `INSERT INTO "${this.tableName}" VALUE { 'userId': ?, 'creationTime': ?, 'notificationType': ?, 'payload': ?, 'ttl': ? }`,
      params: [ userId, sk, notification.notificationType, notification.payload, notificationTtl() ],
    });
  }

  async delete(userId: string, sk: number): Promise<void> {
    await this.sqlWrite({
      query: `DELETE FROM "${this.tableName}" WHERE userId = ? AND creationTime = ?`,
      params: [ userId, sk ],
    });
  }

  async deleteAll(userId: string): Promise<void> {
    const results = await this.query({
      pk: userId,
      projectionAttributes: [ this.skAttribute ],
    });

    if (results.length === 0) return;

    const skSchema = z.object({ creationTime: safeNumber });
    const items = safeParseArray(results, skSchema, 'notification creationTime');
    if (items.length === 0) return;

    await this.sqlWrite(items.map(r => ({
      query: `DELETE FROM "${this.tableName}" WHERE userId = ? AND creationTime = ?`,
      params: [ userId, r.creationTime ],
    })));
  }

  async setReadTime(userId: string, sk: number, readTime: number | undefined): Promise<void> {
    if (readTime !== undefined) {
      await this.sqlWrite({
        query: `UPDATE "${this.tableName}" SET readTime = ? WHERE userId = ? AND creationTime = ?`,
        params: [ readTime, userId, sk ],
      });
    } else {
      await this.sqlWrite({
        query: `UPDATE "${this.tableName}" REMOVE readTime WHERE userId = ? AND creationTime = ?`,
        params: [ userId, sk ],
      });
    }
  }
}

/** Singleton instance for use across the application */
export const notificationsTable = new Notifications(docClient);
