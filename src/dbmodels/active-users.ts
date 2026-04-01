import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { Table } from './table';
import { docClient, safeNumber } from '../dynamodb';
import { safeParseArray } from '../utils/zod-utils';

const ACTIVE_USER_TTL_SECONDS = 365 * 24 * 60 * 60;

const GSI_PK_VALUE = 'ALL';

const activeUserTimeSchema = z.object({
  lastConnectedTime: safeNumber,
});

const BY_TIME_INDEX = {
  name: 'by-time',
  pkAttribute: 'gsiPk',
  skAttribute: 'lastConnectedTime',
} as const;

/**
 * Tracks distinct users who have connected via WebSocket.
 * One item per user (pk = userId), upserted on each connect with the latest timestamp.
 * Used for rolling "active users" counts over 24h / 30d / 1y windows.
 *
 * GSI `by-time` (pk = gsiPk "ALL", sk = lastConnectedTime) enables efficient
 * time-range queries without fetching all items.
 */
export class ActiveUsers extends Table {
  protected override readonly pkAttribute = 'userId';

  constructor(db: DynamoDBDocumentClient) {
    super(db, 'TABLE_ACTIVE_USERS');
  }

  async insert(userId: string): Promise<void> {
    const lastConnectedTime = Date.now();
    const ttl = Math.floor(lastConnectedTime / 1000) + ACTIVE_USER_TTL_SECONDS;
    await this.upsert({
      userId,
      lastConnectedTime,
      ttl,
      gsiPk: GSI_PK_VALUE,
    });
  }

  /**
   * Count distinct active users for multiple rolling windows (in days) in a single query.
   * Queries the by-time GSI with the largest window's cutoff, then partitions client-side.
   */
  async countWindows(windowsDays: number[], nowMs: number = Date.now()): Promise<number[]> {
    const msPerDay = 24 * 60 * 60 * 1000;
    const maxDays = Math.max(...windowsDays);
    if (maxDays <= 0) return windowsDays.map(() => 0);

    const cutoff = nowMs - maxDays * msPerDay;
    const items = await this.query({
      pk: GSI_PK_VALUE,
      skRange: { start: cutoff },
      index: BY_TIME_INDEX,
    });
    const parsed = safeParseArray(items, activeUserTimeSchema, 'active user');
    return windowsDays.map(days =>
      parsed.filter(u => u.lastConnectedTime > nowMs - days * msPerDay).length
    );
  }
}

/** Singleton instance for use across the application */
export const activeUsersTable = new ActiveUsers(docClient);
