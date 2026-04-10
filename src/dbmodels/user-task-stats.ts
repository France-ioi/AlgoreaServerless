/* eslint-disable @typescript-eslint/naming-convention */
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { Table } from './table';
import { z } from 'zod';
import { safeNumber, docClient } from '../dynamodb';
import { DBError } from '../utils/errors';

/**
 * UserTaskStats — per-item per-group cumulative statistics.
 *
 * Key: pk = itemId (string), sk = groupId (string)
 *
 * Attributes:
 * - total_time_spent: accumulated session durations (ms)
 * - abstime_begin: absolute time (ms since epoch) of the first recorded activity
 * - time_to_reach_N / abstime_N (N = 10..100): cumulative session time and
 *   absolute time when the score first reached the N-percent threshold.
 *   These are kept at the minimum observed value to handle out-of-order events.
 * - missingEarlierActivity: true when the chronologically first session for this user/item
 *   was not marked with `firstActivity`, meaning the user may have started the task before
 *   data collection began and the stats may be incomplete.
 */
export const userTaskStatSchema = z.object({
  itemId: z.string(),
  groupId: z.string(),
  total_time_spent: safeNumber.optional(),
  abstime_begin: safeNumber.optional(),
  missingEarlierActivity: z.boolean().optional(),
  time_to_reach_10: safeNumber.optional(),
  time_to_reach_20: safeNumber.optional(),
  time_to_reach_30: safeNumber.optional(),
  time_to_reach_40: safeNumber.optional(),
  time_to_reach_50: safeNumber.optional(),
  time_to_reach_60: safeNumber.optional(),
  time_to_reach_70: safeNumber.optional(),
  time_to_reach_80: safeNumber.optional(),
  time_to_reach_90: safeNumber.optional(),
  time_to_reach_100: safeNumber.optional(),
  abstime_10: safeNumber.optional(),
  abstime_20: safeNumber.optional(),
  abstime_30: safeNumber.optional(),
  abstime_40: safeNumber.optional(),
  abstime_50: safeNumber.optional(),
  abstime_60: safeNumber.optional(),
  abstime_70: safeNumber.optional(),
  abstime_80: safeNumber.optional(),
  abstime_90: safeNumber.optional(),
  abstime_100: safeNumber.optional(),
});
export type UserTaskStat = z.infer<typeof userTaskStatSchema>;

export class UserTaskStats extends Table {
  protected override readonly pkAttribute = 'itemId';
  protected override readonly skAttribute = 'groupId';

  constructor(db: DynamoDBDocumentClient) {
    super(db, 'TABLE_USER_TASK_STATS');
  }

  async get(itemId: string, groupId: string): Promise<UserTaskStat | undefined> {
    const results = await this.sqlRead({
      query: `SELECT * FROM "${this.tableName}" WHERE "itemId" = ? AND "groupId" = ?`,
      params: [ itemId, groupId ],
    });
    if (results.length === 0) return undefined;
    const parsed = userTaskStatSchema.safeParse(results[0]);
    if (!parsed.success) return undefined;
    return parsed.data;
  }

  /**
   * Atomically adds duration to total_time_spent (creates the item if needed).
   * abstime_begin is set only on the first call (if_not_exists).
   */
  async addTimeSpent(itemId: string, groupId: string, duration: number, sessionStartTime: number): Promise<void> {
    try {
      await this.db.send(new UpdateCommand({
        TableName: this.tableName,
        Key: { itemId, groupId },
        UpdateExpression: 'ADD total_time_spent :duration SET abstime_begin = if_not_exists(abstime_begin, :sessionStart)',
        ExpressionAttributeValues: {
          ':duration': duration,
          ':sessionStart': sessionStartTime,
        },
      }));
    } catch (err) {
      const key = JSON.stringify({ itemId, groupId });
      if (err instanceof Error) throw new DBError(`[${err.name}] ${err.message}`, key, { cause: err });
      else throw err;
    }
  }

  /**
   * Overwrites time_to_reach_N and abstime_N for the given levels.
   * The caller is responsible for only passing values that improve (lower) the existing ones.
   * abstime_begin uses if_not_exists to preserve the first-ever recorded value.
   */
  async updateScoreLevels(itemId: string, groupId: string, updates: {
    abstime_begin?: number,
    missingEarlierActivity?: boolean,
    levels: Array<{ level: number, timeToReach: number, abstime: number }>,
  }): Promise<void> {
    if (updates.levels.length === 0 && updates.abstime_begin === undefined && updates.missingEarlierActivity === undefined) return;

    const setExpressions: string[] = [];
    const expressionValues: Record<string, unknown> = {};

    if (updates.abstime_begin !== undefined) {
      setExpressions.push('abstime_begin = if_not_exists(abstime_begin, :abstime_begin)');
      expressionValues[':abstime_begin'] = updates.abstime_begin;
    }

    if (updates.missingEarlierActivity !== undefined) {
      setExpressions.push('missingEarlierActivity = :mea');
      expressionValues[':mea'] = updates.missingEarlierActivity;
    }

    for (const { level, timeToReach, abstime } of updates.levels) {
      const ttrKey = `time_to_reach_${level}`;
      const atKey = `abstime_${level}`;
      setExpressions.push(`${ttrKey} = :${ttrKey}`);
      setExpressions.push(`${atKey} = :${atKey}`);
      expressionValues[`:${ttrKey}`] = timeToReach;
      expressionValues[`:${atKey}`] = abstime;
    }

    try {
      await this.db.send(new UpdateCommand({
        TableName: this.tableName,
        Key: { itemId, groupId },
        UpdateExpression: `SET ${setExpressions.join(', ')}`,
        ExpressionAttributeValues: expressionValues,
      }));
    } catch (err) {
      const key = JSON.stringify({ itemId, groupId });
      if (err instanceof Error) throw new DBError(`[${err.name}] ${err.message}`, key, { cause: err });
      else throw err;
    }
  }
}

export const userTaskStatsTable = new UserTaskStats(docClient);
