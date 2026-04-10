import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Table } from './table';
import { z } from 'zod';
import { safeNumber, docClient } from '../dynamodb';
import { safeParseArray } from '../utils/zod-utils';

/** The interval at which the frontend client is expected to call the keep-alive endpoint to signal the session is still active. */
export const KEEP_ALIVE_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
export const STALE_THRESHOLD_MS = KEEP_ALIVE_INTERVAL_MS * 2 + 30_000; // 4min 30sec

function sessionPk(itemId: string, participantId: string): string {
  return `session#${itemId}#${participantId}`;
}

function scorePk(itemId: string, participantId: string): string {
  return `score#${itemId}#${participantId}`;
}

export const sessionSchema = z.object({
  time: safeNumber,
  attemptId: z.string().optional(),
  latestUpdateTime: safeNumber,
  endTime: safeNumber.optional(),
  /**
   * Set on the very first session for a user/item pair when the frontend provides a valid resultStartedAt timestamp.
   * Used to identify users whose activity data is complete from the start, so that stats can exclude users who had
   * already begun working on a task before this stat collection was set up (their data would be partial/misleading).
   */
  firstActivity: z.boolean().optional(),
});

export type Session = z.infer<typeof sessionSchema>;

/**
 * UserTaskActivities - Log of user activities on tasks
 *
 * Key: pk (string, composite), sk = time (number, ms)
 *
 * Two entity types via pk prefix:
 * - score#{item_id}#{participant_id}: score updates from grade_saved events
 *   sk (time) = event envelope time (ms)
 * - session#{item_id}#{participant_id}: work sessions
 *   sk (time) = session start time (ms)
 */
export class UserTaskActivities extends Table {
  protected override readonly skAttribute = 'time';

  constructor(db: DynamoDBDocumentClient) {
    super(db, 'TABLE_USER_TASK_ACTIVITIES');
  }

  async getLastSession(itemId: string, participantId: string): Promise<Session | undefined> {
    const results = await this.query({
      pk: sessionPk(itemId, participantId),
      limit: 1,
      scanIndexForward: false,
    });
    if (results.length === 0) return undefined;
    const parsed = sessionSchema.safeParse(results[0]);
    if (!parsed.success) return undefined;
    return parsed.data;
  }

  async insertSession(itemId: string, participantId: string, time: number, attrs: {
    attemptId?: string,
    latestUpdateTime: number,
    endTime?: number,
    firstActivity?: boolean,
  }): Promise<void> {
    const fields: Record<string, unknown> = {
      pk: sessionPk(itemId, participantId),
      time,
      latestUpdateTime: attrs.latestUpdateTime,
    };
    if (attrs.attemptId !== undefined) fields.attemptId = attrs.attemptId;
    if (attrs.endTime !== undefined) fields.endTime = attrs.endTime;
    if (attrs.firstActivity !== undefined) fields.firstActivity = attrs.firstActivity;

    const entries = Object.entries(fields);
    const valuePairs = entries.map(([ k ]) => `'${k}': ?`).join(', ');
    await this.sqlWrite({
      query: `INSERT INTO "${this.tableName}" VALUE { ${valuePairs} }`,
      params: entries.map(([ , v ]) => v),
    });
  }

  async getFirstSession(itemId: string, participantId: string): Promise<Session | undefined> {
    const results = await this.query({
      pk: sessionPk(itemId, participantId),
      limit: 1,
      scanIndexForward: true,
    });
    if (results.length === 0) return undefined;
    const parsed = sessionSchema.safeParse(results[0]);
    if (!parsed.success) return undefined;
    return parsed.data;
  }

  async updateLatestTime(itemId: string, participantId: string, time: number, latestUpdateTime: number): Promise<void> {
    await this.sqlWrite({
      query: `UPDATE "${this.tableName}" SET latestUpdateTime = ? WHERE pk = ? AND "time" = ?`,
      params: [ latestUpdateTime, sessionPk(itemId, participantId), time ],
    });
  }

  async setEndTime(itemId: string, participantId: string, time: number, endTime: number): Promise<void> {
    await this.sqlWrite({
      query: `UPDATE "${this.tableName}" SET endTime = ?, latestUpdateTime = ? WHERE pk = ? AND "time" = ?`,
      params: [ endTime, endTime, sessionPk(itemId, participantId), time ],
    });
  }

  async reopenSession(itemId: string, participantId: string, time: number, latestUpdateTime: number): Promise<void> {
    await this.sqlWrite({
      query: `UPDATE "${this.tableName}" SET latestUpdateTime = ? REMOVE endTime WHERE pk = ? AND "time" = ?`,
      params: [ latestUpdateTime, sessionPk(itemId, participantId), time ],
    });
  }

  async getAllSessions(itemId: string, participantId: string): Promise<Session[]> {
    const results = await this.query({
      pk: sessionPk(itemId, participantId),
    });
    return safeParseArray(results, sessionSchema, 'session');
  }

  async insertScore(itemId: string, participantId: string, time: number, attrs: {
    answerId: string,
    attemptId: string,
    validated: boolean,
    score: number,
  }): Promise<void> {
    await this.sqlWrite({
      query: `INSERT INTO "${this.tableName}" VALUE { 'pk': ?, 'time': ?, 'answerId': ?, 'attemptId': ?, 'validated': ?, 'score': ? }`,
      params: [ scorePk(itemId, participantId), time, attrs.answerId, attrs.attemptId, attrs.validated, attrs.score ],
    });
  }
}

export const userTaskActivitiesTable = new UserTaskActivities(docClient);
