import { NumberValue } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { Table } from './table';
import { docClient, safeNumber } from '../dynamodb';
import { safeParseArray } from '../utils/zod-utils';

const ACTIVE_USER_TTL_SECONDS = 365 * 24 * 60 * 60;

function activeUsersPk(): string {
  const stage = process.env.STAGE || 'dev';
  return `${stage}#ACTIVE_USERS`;
}

const activeUserTimeSchema = z.object({
  lastConnectedTime: safeNumber,
});

/**
 * Tracks distinct users who have connected via WebSocket.
 * One entry per user (sk = userId), upserted on each connect with the latest timestamp.
 * Used for rolling "active users" counts over 24h / 30d / 1y windows.
 */
export class ActiveUsers extends Table {

  async insert(userId: string): Promise<void> {
    const lastConnectedTime = Date.now();
    const ttl = Math.floor(lastConnectedTime / 1000) + ACTIVE_USER_TTL_SECONDS;
    await this.upsert({
      pk: activeUsersPk(),
      sk: NumberValue.from(userId),
      lastConnectedTime,
      ttl,
    });
  }

  /**
   * Count distinct active users for multiple rolling windows (in days) in a single query.
   * Fetches all entries (projected to lastConnectedTime) and counts client-side.
   * Viable because user count is bounded (<50k).
   */
  async countWindows(windowsDays: number[], nowMs: number = Date.now()): Promise<number[]> {
    const items = await this.query({
      pk: activeUsersPk(),
      projectionAttributes: [ 'lastConnectedTime' ],
    });
    const parsed = safeParseArray(items, activeUserTimeSchema, 'active user');
    const msPerDay = 24 * 60 * 60 * 1000;
    return windowsDays.map(days =>
      parsed.filter(u => u.lastConnectedTime > nowMs - days * msPerDay).length
    );
  }
}

/** Singleton instance for use across the application */
export const activeUsersTable = new ActiveUsers(docClient);
