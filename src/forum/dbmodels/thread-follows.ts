import { Table } from '../../dbmodels/table';
import { ThreadId } from './thread';
import { z } from 'zod';
import { safeNumber, docClient } from '../../dynamodb';
import { NumberValue } from '@aws-sdk/lib-dynamodb';
import { id64 } from '../../utils/id64';
import { DBError } from '../../utils/errors';
/**
 * TTL for thread follows after the thread is closed (2 weeks).
 */
export const THREAD_FOLLOW_TTL_AFTER_CLOSE_SECONDS = 60 * 60 * 24 * 14;

/**
 * Calculates the TTL value for a thread follow after closing, in seconds since epoch.
 */
export function threadFollowTtlAfterClose(): number {
  return Math.floor(Date.now() / 1000) + THREAD_FOLLOW_TTL_AFTER_CLOSE_SECONDS;
}

function pk(thread: ThreadId): string {
  const stage = process.env.STAGE || 'dev';
  return `${stage}#THREAD#${thread.participantId}#${thread.itemId}#FOLLOW`;
}

const threadFollowSchema = z.object({
  pk: z.string(),
  sk: id64,
  ttl: safeNumber.optional(),
});

export type ThreadFollow = z.infer<typeof threadFollowSchema>;

/**
 * Thread follows are stored in the database with the following schema:
 * - pk: ${stage}#THREAD#${participantId}#${itemId}#FOLLOW
 * - sk: userId as a number (64-bit integer via NumberValue)
 * - ttl: optional auto-deletion time (seconds since epoch, DynamoDB TTL format)
 */
export class ThreadFollows extends Table {

  /**
   * Check if an entry exists for a user on a thread.
   */
  async exists(threadId: ThreadId, userId: string): Promise<boolean> {
    const results = await this.sqlRead({
      query: `SELECT sk FROM "${this.tableName}" WHERE pk = ? AND sk = ?`,
      params: [ pk(threadId), NumberValue.from(userId) ],
    });
    return results.length > 0;
  }

  /**
   * Insert a follow entry for a user on a thread.
   * If the user is already following, this is a no-op.
   * @param ttl Optional TTL in seconds since epoch for auto-deletion
   */
  async insert(threadId: ThreadId, userId: string, ttl?: number): Promise<void> {
    try {
      await this.sqlWrite({
        query: `INSERT INTO "${this.tableName}" VALUE { 'pk': ?, 'sk': ?${ttl !== undefined ? ", 'ttl': ?" : ''} }`,
        params: ttl !== undefined
          ? [ pk(threadId), NumberValue.from(userId), ttl ]
          : [ pk(threadId), NumberValue.from(userId) ],
      });
    } catch (err) {
      if (err instanceof DBError && err.cause instanceof Error && err.cause.name.includes('DuplicateItem')) return;
      throw err;
    }
  }

  /**
   * Delete a follow entry for a user on a thread.
   * If the user is not following, this is a no-op.
   */
  async deleteByUserId(threadId: ThreadId, userId: string): Promise<void> {
    await this.sqlWrite({
      query: `DELETE FROM "${this.tableName}" WHERE pk = ? AND sk = ?`,
      params: [ pk(threadId), NumberValue.from(userId) ],
    });
  }

  /**
   * Get all followers of a thread.
   */
  async getFollowers(threadId: ThreadId): Promise<{ userId: string }[]> {
    const results = await this.sqlRead({
      query: `SELECT sk FROM "${this.tableName}" WHERE pk = ?`,
      params: [ pk(threadId) ],
    });
    return z.array(z.object({ sk: id64 }))
      .parse(results)
      .map(({ sk }) => ({ userId: sk }));
  }

  /**
   * Set TTL for all followers of a thread.
   * Used when a thread is closed to schedule automatic cleanup.
   */
  async setTtlForAllFollowers(threadId: ThreadId, ttl: number): Promise<void> {
    const followers = await this.getFollowers(threadId);
    if (followers.length === 0) return;

    const pkValue = pk(threadId);
    await this.sqlWrite(followers.map(f => ({
      query: `UPDATE "${this.tableName}" SET ttl = ? WHERE pk = ? AND sk = ?`,
      params: [ ttl, pkValue, NumberValue.from(f.userId) ],
    })));
  }

  /**
   * Remove TTL from all followers of a thread.
   * Used when a thread is reopened to prevent automatic cleanup.
   * @returns The list of existing follower userIds
   */
  async removeTtlForAllFollowers(threadId: ThreadId): Promise<string[]> {
    const followers = await this.getFollowers(threadId);
    if (followers.length === 0) return [];

    const pkValue = pk(threadId);
    await this.sqlWrite(followers.map(f => ({
      query: `UPDATE "${this.tableName}" REMOVE ttl WHERE pk = ? AND sk = ?`,
      params: [ pkValue, NumberValue.from(f.userId) ],
    })));

    return followers.map(f => f.userId);
  }
}

/** Singleton instance for use across the application */
export const threadFollowsTable = new ThreadFollows(docClient);
