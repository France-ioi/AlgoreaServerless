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
  /** % of users who opened the task and left without engaging. See computeBounceRate. */
  bounceRate: number | null,
  avgScore: number | null,
  scoreDistribution: ScoreDistributionEntry[],
}

/**
 * Minimum session time for a visit to count toward the bounce rate.
 * Below this, we assume the user opened the task by accident (misclick, fast back-button)
 * and including them would inflate the metric without reflecting a real engagement decision.
 */
const MIN_VISIT_MS = 3_000;

/**
 * Lower bound on the bounce-window threshold T.
 * Even if the task-calibrated value (BOUNCE_THRESHOLD_RATIO * median(time_to_reach_10))
 * is very small (e.g. trivial tasks where users reach score 10 in seconds), we require at least
 * 30s of presence-without-progress to call a visit a "bounce". This avoids labeling people who
 * are actively working on a fast task but haven't yet hit the first score milestone.
 * Also used as the fallback threshold when no user has reached score 10 yet.
 */
const MIN_BOUNCE_THRESHOLD_MS = 30_000;

/**
 * Fraction of median(time_to_reach_10) used as the bounce-window threshold.
 * Reads as: "users who left before spending even 30% of the typical time-to-first-progress
 * are likely not engaging with the task". Lower values make the metric more conservative
 * (fewer users counted as bounced); higher values make it more aggressive.
 */
const BOUNCE_THRESHOLD_RATIO = 0.3;

/**
 * Bounce rate = % of real visits that ended with no progress and minimal effort.
 * - real visit: total_time_spent >= MIN_VISIT_MS (filters out accidental opens)
 * - bounced: real visit AND current_score == 0 AND total_time_spent < bounceThreshold
 * - bounceThreshold = max(MIN_BOUNCE_THRESHOLD_MS, BOUNCE_THRESHOLD_RATIO * median(time_to_reach_10))
 *   (task-calibrated so quick and long tasks are evaluated fairly)
 *
 * High bounce rate = engagement problem (first impression / clarity), distinct from "task is hard"
 * which would instead show as low avgScore with normal bounceRate.
 *
 * Returns null when no real visit was recorded (cannot compute a meaningful ratio).
 */
function computeBounceRate(stats: UserTaskStat[]): number | null {
  const timeToFirstProgress = stats
    .map(s => s.time_to_reach_10)
    .filter((v): v is number => v !== undefined);
  const medianFirstProgress = median(timeToFirstProgress);
  // when nobody has reached score 10 we can't calibrate a meaningful threshold; fall back to the floor
  const bounceThreshold = medianFirstProgress === null
    ? MIN_BOUNCE_THRESHOLD_MS
    : Math.max(MIN_BOUNCE_THRESHOLD_MS, BOUNCE_THRESHOLD_RATIO * medianFirstProgress);

  // accidental opens (time < MIN_VISIT_MS or no time recorded) are excluded from BOTH numerator and
  // denominator: they don't represent a real engagement decision, so counting them either way would
  // skew the metric.
  const realVisits = stats.filter(s => s.total_time_spent !== undefined && s.total_time_spent >= MIN_VISIT_MS);
  if (realVisits.length === 0) return null;

  const bounced = realVisits.filter(s => (s.current_score ?? 0) === 0 && s.total_time_spent! < bounceThreshold).length;

  return Math.round(bounced / realVisits.length * 10000) / 100;
}

export function computeItemStats(stats: UserTaskStat[]): ItemStatsResponse {
  const userCount = stats.length;

  if (userCount === 0) {
    return {
      userCount: 0,
      medianTimeSpent: null,
      medianTimeToValidate: null,
      bounceRate: null,
      avgScore: null,
      scoreDistribution: [],
    };
  }

  const timeSpentValues = stats.map(s => s.total_time_spent).filter((v): v is number => v !== undefined);
  const timeToValidateValues = stats.map(s => s.time_to_reach_100).filter((v): v is number => v !== undefined);
  const scores = stats.map(s => s.current_score ?? 0);

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
    bounceRate: computeBounceRate(stats),
    avgScore: average(scores),
    scoreDistribution,
  };
}

async function get(req: RequestWithPermissionsToken): Promise<ItemStatsResponse> {
  const stats = await userTaskStatsTable.getAllByItem(req.permissionsToken.itemId);
  return computeItemStats(stats);
}

export const getItemStats = get as unknown as HandlerFunction;
