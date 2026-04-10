import { GradeSavedPayload } from '../events/grade-saved';
import { userTaskStatsTable, UserTaskStat } from '../dbmodels/user-task-stats';
import { userTaskActivitiesTable } from '../dbmodels/user-task-activities';

type ScoreLevel = 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100;

/**
 * Called whenever a session's endTime is set for the first time.
 * Accumulates the session duration into the user-task-stats table.
 */
export async function onSessionEnded(
  itemId: string, participantId: string, sessionStartTime: number, endTime: number,
): Promise<void> {
  const duration = endTime - sessionStartTime;
  await userTaskStatsTable.addTimeSpent(itemId, participantId, duration, sessionStartTime);
}

/**
 * Called on every grade_saved event to record score-milestone timestamps.
 *
 * For each 10-percent threshold (10, 20, …, 100) up to the reached level,
 * we keep the minimum observed cumulative session time (time_to_reach_N) and
 * absolute time (abstime_N). This handles events arriving out of order:
 * a later-arriving event with lower values will overwrite the existing ones.
 */
export async function onGradeSavedStats(payload: GradeSavedPayload, envelopeTimeMs: number): Promise<void> {
  if (payload.score === 0 || !payload.score_improved) return;

  const level = Math.min(Math.floor(payload.score / 10) * 10, 100);
  if (level < 10) return;

  const existingStat = await userTaskStatsTable.get(payload.item_id, payload.participant_id);

  // Sum session time up to the event timestamp. For each session that started
  // before the event: use full duration if it ended before, or partial duration
  // (up to event time) if it spans the event or is still open.
  const sessions = await userTaskActivitiesTable.getAllSessions(payload.item_id, payload.participant_id);
  const cumulativeTime = sessions
    .filter(s => s.time <= envelopeTimeMs)
    .reduce((sum, s) => {
      const effectiveEnd = Math.min(s.endTime ?? envelopeTimeMs, envelopeTimeMs);
      return sum + (effectiveEnd - s.time);
    }, 0);

  // For each threshold, update if either time_to_reach or abstime can be improved
  const levels: Array<{ level: number, timeToReach: number, abstime: number }> = [];
  for (let l = 10 as ScoreLevel; l <= level; l = (l + 10) as ScoreLevel) {
    const ttrKey = `time_to_reach_${l}` as const satisfies keyof UserTaskStat;
    const atKey = `abstime_${l}` as const satisfies keyof UserTaskStat;
    const existingTtr = existingStat?.[ttrKey];
    const existingAt = existingStat?.[atKey];
    if (
      (existingTtr === undefined || cumulativeTime < existingTtr) ||
      (existingAt === undefined || envelopeTimeMs < existingAt)
    ) {
      levels.push({
        level: l,
        timeToReach: Math.min(cumulativeTime, existingTtr ?? Infinity),
        abstime: Math.min(envelopeTimeMs, existingAt ?? Infinity),
      });
    }
  }

  const missingEarlierActivity = sessions[0]?.firstActivity !== true;
  const currentScore = Math.max(payload.score, existingStat?.current_score ?? 0);

  await userTaskStatsTable.updateScoreLevels(payload.item_id, payload.participant_id, {
    abstime_begin: existingStat ? undefined : envelopeTimeMs,
    current_score: currentScore,
    missingEarlierActivity,
    levels,
  });
}
