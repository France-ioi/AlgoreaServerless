import { Table } from '../../dbmodels/table';
import { ThreadId } from './thread';
import { z } from 'zod';
import { dynamodb } from '../../dynamodb';

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
  sk: z.number(),
  userId: z.string(),
  ttl: z.number().optional(),
});

export type ThreadFollow = z.infer<typeof threadFollowSchema>;

/**
 * Thread follows are stored in the database with the following schema:
 * - pk: ${stage}#THREAD#${participantId}#${itemId}#FOLLOW
 * - sk: insertion timestamp (milliseconds since epoch)
 * - userId: the user id of the follower
 * - ttl: optional auto-deletion time (seconds since epoch, DynamoDB TTL format)
 */
export class ThreadFollows extends Table {

  /**
   * Check if a user is following a thread
   */
  async isFollowing(threadId: ThreadId, userId: string): Promise<boolean> {
    const results = await this.sqlRead({
      query: `SELECT sk FROM "${this.tableName}" WHERE pk = ? AND userId = ?`,
      params: [ pk(threadId), userId ],
      limit: 1,
    });
    return results.length > 0;
  }

  /**
   * Add a user to the thread followers.
   * If the user is already following, this is a no-op.
   * @param ttl Optional TTL in seconds since epoch for auto-deletion
   */
  async follow(threadId: ThreadId, userId: string, ttl?: number): Promise<void> {
    // Check if already following
    const alreadyFollowing = await this.isFollowing(threadId, userId);
    if (alreadyFollowing) {
      return; // User is already following, ignore
    }

    const sk = Date.now();

    await this.sqlWrite({
      query: `INSERT INTO "${this.tableName}" VALUE { 'pk': ?, 'sk': ?, 'userId': ?${ttl !== undefined ? ", 'ttl': ?" : ''} }`,
      params: ttl !== undefined ? [ pk(threadId), sk, userId, ttl ] : [ pk(threadId), sk, userId ],
    });
  }

  /**
   * Remove a user from the thread followers.
   * If the user is not following, this is a no-op.
   */
  async unfollow(threadId: ThreadId, userId: string): Promise<void> {
    // Find the user's follow entry
    const results = await this.sqlRead({
      query: `SELECT sk FROM "${this.tableName}" WHERE pk = ? AND userId = ?`,
      params: [ pk(threadId), userId ],
    });

    if (results.length === 0) {
      return; // User is not following, ignore
    }

    // Delete all matching entries (should be only one, but handle edge cases)
    const sks = z.array(z.object({ sk: z.number() })).parse(results).map(r => r.sk);
    await this.sqlWrite(sks.map(sk => ({
      query: `DELETE FROM "${this.tableName}" WHERE pk = ? AND sk = ?`,
      params: [ pk(threadId), sk ],
    })));
  }

  /**
   * Get all followers of a thread
   */
  async getFollowers(threadId: ThreadId): Promise<{ userId: string, sk: number }[]> {
    const results = await this.sqlRead({
      query: `SELECT userId, sk FROM "${this.tableName}" WHERE pk = ?`,
      params: [ pk(threadId) ],
    });
    return z.array(z.object({
      userId: z.string(),
      sk: z.number(),
    })).parse(results);
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
      params: [ ttl, pkValue, f.sk ],
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
      params: [ pkValue, f.sk ],
    })));

    return followers.map(f => f.userId);
  }
}

/** Singleton instance for use across the application */
export const threadFollowsTable = new ThreadFollows(dynamodb);
