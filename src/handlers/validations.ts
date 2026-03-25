import { HandlerFunction } from 'lambda-api';
import { RequestWithIdentityToken } from '../auth/identity-token-middleware';
import { validationsTable } from '../dbmodels/validations';
import { validationCountsTable } from '../dbmodels/validation-counts';

interface ValidatedTaskEntry {
  time: number,
  participantId: string,
  itemId: string,
  answerId: string,
}

interface ValidationResponse {
  validations: ValidatedTaskEntry[],
}

interface ValidationStatsResponse {
  last24h: number,
  last30d: number,
  last1y: number,
}

/**
 * GET /validations
 * Returns the latest 30 validations (newest first).
 */
async function get(_req: RequestWithIdentityToken): Promise<ValidationResponse> {
  const result = await validationsTable.getLatest(30);
  return {
    validations: result.map(v => ({
      time: v.sk,
      participantId: v.participantId,
      itemId: v.itemId,
      answerId: v.answerId,
    })),
  };
}

/**
 * GET /validations/stats
 * Returns aggregated validation counters for fixed rolling windows.
 */
async function getStats(_req: RequestWithIdentityToken): Promise<ValidationStatsResponse> {
  const now = Date.now();
  const [ last24h, daySums ] = await Promise.all([
    validationsTable.countSince(now - 24 * 60 * 60 * 1000),
    validationCountsTable.sumWindows([ 30, 365 ], now),
  ]);

  return { last24h, last30d: daySums[0]!, last1y: daySums[1]! };
}

export const getLatestValidations = get as unknown as HandlerFunction;
export const getValidationStats = getStats as unknown as HandlerFunction;
