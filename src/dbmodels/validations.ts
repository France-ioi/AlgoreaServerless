import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Table } from './table';
import { z } from 'zod';
import { safeNumber, docClient } from '../dynamodb';
import { safeParseArray } from '../utils/zod-utils';

/**
 * Validation TTL in seconds (2 weeks).
 */
export const VALIDATION_TTL_SECONDS = 14 * 24 * 60 * 60;

/**
 * Calculates the TTL value for a validation entry in seconds since epoch.
 */
export function validationTtl(): number {
  return Math.floor(Date.now() / 1000) + VALIDATION_TTL_SECONDS;
}

function pk(): string {
  return 'VALIDATIONS';
}

export const validationSchema = z.object({
  sk: safeNumber,
  participantId: z.string(),
  itemId: z.string(),
  answerId: z.string(),
});

export type Validation = z.infer<typeof validationSchema>;

export type ValidationInput = Omit<Validation, 'sk'>;

/**
 * Validations - Global record of successful new task validations
 *
 * Stores grade_saved events where validated=true and score_improved=true.
 *
 * Database schema:
 * - pk: VALIDATIONS
 * - sk: event envelope time (milliseconds)
 * - participantId: the participant who validated
 * - itemId: the validated task
 * - answerId: the answer that triggered validation (should be unique among all entries)
 * - ttl: auto-deletion time (2 weeks after creation, seconds since epoch)
 */
export class Validations extends Table {
  constructor(db: DynamoDBDocumentClient) {
    super(db, 'TABLE_STATS');
  }

  /**
   * Get the latest validations.
   * Returns validations in descending order (newest first).
   */
  async getLatest(limit: number): Promise<Validation[]> {
    const results = await this.query({
      pk: pk(),
      projectionAttributes: [ 'sk', 'participantId', 'itemId', 'answerId' ],
      limit,
      scanIndexForward: false,
    });
    return safeParseArray(results, validationSchema, 'validation');
  }

  /**
   * Count validations since the given timestamp.
   * Only accurate for `sinceMs` within the last `VALIDATION_TTL_SECONDS` (2 weeks),
   * as older entries may have been purged by DynamoDB TTL.
   */
  async countSince(sinceMs: number): Promise<number> {
    return this.countByPk(pk(), { skRange: { start: sinceMs } });
  }

  async insert(time: number, input: ValidationInput): Promise<void> {
    await this.sqlWrite({
      query: `INSERT INTO "${this.tableName}" VALUE { 'pk': ?, 'sk': ?, 'participantId': ?, 'itemId': ?, 'answerId': ?, 'ttl': ? }`,
      params: [ pk(), time, input.participantId, input.itemId, input.answerId, validationTtl() ],
    });
  }
}

/** Singleton instance for use across the application */
export const validationsTable = new Validations(docClient);
