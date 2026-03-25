import { z } from 'zod';
import { Table } from './table';
import { docClient, safeNumber } from '../dynamodb';
import { safeParseArray } from '../utils/zod-utils';
export const VALIDATION_DAY_TTL_SECONDS = 2 * 365 * 24 * 60 * 60;

function dayPk(): string {
  const stage = process.env.STAGE || 'dev';
  return `${stage}#VALIDATIONS#DAY`;
}

function utcDayStartMs(timeMs: number): number {
  const date = new Date(timeMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function dayKeyFromTimeMs(timeMs: number): number {
  const date = new Date(timeMs);
  return date.getUTCFullYear() * 10_000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}

function dayStartMsForWindow(nowMs: number, days: number): number {
  const now = new Date(nowMs);
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1));
}

export function validationDayTtl(dayTimeMs: number): number {
  return Math.floor(utcDayStartMs(dayTimeMs) / 1000) + VALIDATION_DAY_TTL_SECONDS;
}

const validationDayCountSchema = z.object({
  sk: safeNumber,
  count: safeNumber,
});

/**
 * Daily aggregated validation counts.
 * One entry per UTC day.
 */
export class ValidationCounts extends Table {

  async incrementDay(timeMs: number): Promise<void> {
    await this.incrementCounter(
      { pk: dayPk(), sk: dayKeyFromTimeMs(timeMs) },
      { ttl: validationDayTtl(timeMs) },
    );
  }

  async sumLastDays(days: number, nowMs: number = Date.now()): Promise<number> {
    const sums = await this.sumWindows([ days ], nowMs);
    return sums[0]!;
  }

  /**
   * Compute sums for multiple rolling windows from a single query.
   * Fetches data for the largest window and partitions rows into each window.
   */
  async sumWindows(windows: number[], nowMs: number = Date.now()): Promise<number[]> {
    const maxDays = Math.max(...windows);
    if (maxDays <= 0) return windows.map(() => 0);

    const results = await this.query({
      pk: dayPk(),
      skRange: { start: dayKeyFromTimeMs(dayStartMsForWindow(nowMs, maxDays)) },
      projectionAttributes: [ 'sk', 'count' ],
    });

    const rows = safeParseArray(results, validationDayCountSchema, 'validation daily count');
    return windows.map(days => {
      if (days <= 0) return 0;
      const startKey = dayKeyFromTimeMs(dayStartMsForWindow(nowMs, days));
      return rows
        .filter(row => row.sk >= startKey)
        .reduce((acc, row) => acc + row.count, 0);
    });
  }
}

/** Singleton instance for use across the application */
export const validationCountsTable = new ValidationCounts(docClient);
