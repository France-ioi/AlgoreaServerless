import { HandlerFunction } from 'lambda-api';
import { RequestWithIdentityToken } from '../auth/identity-token-middleware';
import { activeUsersTable } from '../dbmodels/active-users';
import { validationsTable } from '../dbmodels/validations';
import { validationCountsTable } from '../dbmodels/validation-counts';

interface WindowCounts {
  last24h: number,
  last30d: number,
  last1y: number,
}

interface StatsResponse {
  validations: WindowCounts,
  activeUsers: WindowCounts,
}

const MS_24H = 24 * 60 * 60 * 1000;

/**
 * GET /stats
 * Returns rolling counters for validations and active users.
 */
async function get(_req: RequestWithIdentityToken): Promise<StatsResponse> {
  const now = Date.now();
  const [ validations24h, validationDaySums, activeUserCounts ] = await Promise.all([
    validationsTable.countSince(now - MS_24H),
    validationCountsTable.sumWindows([ 30, 365 ], now),
    activeUsersTable.countWindows([ 1, 30, 365 ], now),
  ]);

  return {
    validations: {
      last24h: validations24h,
      last30d: validationDaySums[0]!,
      last1y: validationDaySums[1]!,
    },
    activeUsers: {
      last24h: activeUserCounts[0]!,
      last30d: activeUserCounts[1]!,
      last1y: activeUserCounts[2]!,
    },
  };
}

export const getStats = get as unknown as HandlerFunction;
