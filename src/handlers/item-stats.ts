import { HandlerFunction } from 'lambda-api';
import { RequestWithPermissionsToken } from '../auth/permissions-token';
import { userTaskStatsTable, UserTaskStat } from '../dbmodels/user-task-stats';
import { median, average, countAtOrBelow } from '../utils/stats';

const scoreThresholds = [ 10, 20, 30, 40, 50, 60, 70, 80, 90, 100 ] as const;

const timeBucketsMinutes = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  20, 25, 30, 35, 40, 45, 50, 55, 60,
];

type ScoreThreshold = typeof scoreThresholds[number];

function getTimeToReach(stat: UserTaskStat, level: ScoreThreshold): number | undefined {
  return stat[`time_to_reach_${level}`];
}

interface ScoreDistributionEntry {
  score: number,
  pctUsersAbove: number,
  pctByTime: Record<number, number>,
}

export interface ItemStatsResponse {
  userCount: number,
  medianTimeSpent: number | null,
  medianTimeToValidate: number | null,
  medianDropoutTimeLowScore: number | null,
  avgScore: number | null,
  scoreDistribution: ScoreDistributionEntry[],
}

export function computeItemStats(stats: UserTaskStat[]): ItemStatsResponse {
  const userCount = stats.length;

  if (userCount === 0) {
    return {
      userCount: 0,
      medianTimeSpent: null,
      medianTimeToValidate: null,
      medianDropoutTimeLowScore: null,
      avgScore: null,
      scoreDistribution: [],
    };
  }

  const timeSpentValues = stats.map(s => s.total_time_spent).filter((v): v is number => v !== undefined);
  const timeToValidateValues = stats.map(s => s.time_to_reach_100).filter((v): v is number => v !== undefined);
  const scores = stats.map(s => s.current_score ?? 0);
  const dropoutTimes = stats
    .filter(s => (s.current_score ?? 0) < 10 && s.total_time_spent !== undefined)
    .map(s => s.total_time_spent!);

  const scoreDistribution: ScoreDistributionEntry[] = scoreThresholds.map(threshold => {
    const usersAbove = scores.filter(s => s >= threshold).length;
    const timeToReachValues = stats
      .map(s => getTimeToReach(s, threshold))
      .filter((v): v is number => v !== undefined)
      .sort((a, b) => a - b);

    const pctByTime: Record<number, number> = {};
    for (const minutes of timeBucketsMinutes) {
      const ms = minutes * 60_000;
      const count = countAtOrBelow(timeToReachValues, ms);
      pctByTime[minutes] = Math.round(count / userCount * 10000) / 100;
    }

    return {
      score: threshold,
      pctUsersAbove: Math.round(usersAbove / userCount * 10000) / 100,
      pctByTime,
    };
  });

  return {
    userCount,
    medianTimeSpent: median(timeSpentValues),
    medianTimeToValidate: median(timeToValidateValues),
    medianDropoutTimeLowScore: median(dropoutTimes),
    avgScore: average(scores),
    scoreDistribution,
  };
}

async function get(req: RequestWithPermissionsToken): Promise<ItemStatsResponse> {
  const stats = await userTaskStatsTable.getAllByItem(req.permissionsToken.itemId);
  return computeItemStats(stats);
}

export const getItemStats = get as unknown as HandlerFunction;
