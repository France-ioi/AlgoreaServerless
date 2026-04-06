import { HandlerFunction, Response } from 'lambda-api';
import { RequestWithTaskToken } from '../auth/task-token';
import { DecodingError } from '../utils/errors';
import { created } from '../utils/rest-responses';
import {
  userTaskActivitiesTable, Session, KEEP_ALIVE_INTERVAL_MS, STALE_THRESHOLD_MS,
} from '../dbmodels/user-task-activities';

function isStale(session: Session, now: number): boolean {
  return session.latestUpdateTime < now - STALE_THRESHOLD_MS;
}

/**
 * Closes a session whose keep-alives stopped arriving. The endTime is estimated
 * as the last known activity + half the keep-alive interval.
 */
async function closeStaleSession(
  itemId: string, participantId: string, session: Session,
): Promise<void> {
  await userTaskActivitiesTable.setEndTime(
    itemId, participantId, session.time,
    session.latestUpdateTime + KEEP_ALIVE_INTERVAL_MS / 2,
  );
}

function requireAttemptId(query: Record<string, string | undefined>): string {
  const attemptId = query['attempt_id'];
  if (!attemptId) throw new DecodingError('attempt_id query parameter is required');
  return attemptId;
}

/**
 * Called when the user opens a task. Three cases:
 * - Active session exists and is fresh → treat as a keep-alive (update latestUpdateTime).
 *   This handles multiple frontends sharing the same session.
 * - Active session exists but is stale → close it, then create a new session.
 * - No active session → create a new session.
 */
async function start(req: RequestWithTaskToken, resp: Response): Promise<ReturnType<typeof created>> {
  const { itemId, participantId } = req.taskToken;
  const attemptId = requireAttemptId(req.query);
  const now = Date.now();

  const last = await userTaskActivitiesTable.getLastSession(itemId, participantId);

  if (last && last.endTime === undefined) {
    if (isStale(last, now)) {
      await closeStaleSession(itemId, participantId, last);
    } else {
      await userTaskActivitiesTable.updateLatestTime(itemId, participantId, last.time, now);
      return created(resp);
    }
  }

  await userTaskActivitiesTable.insertSession(itemId, participantId, now, {
    attemptId,
    latestUpdateTime: now,
  });
  return created(resp);
}

/**
 * Keep-alive sent periodically by the frontend. Four cases:
 * - Active session exists and is fresh → update latestUpdateTime (happy path).
 * - Active session exists but is stale → close it, then create a backdated session.
 * - Recently ended session (not stale) → reopen it (remove endTime, update latestUpdateTime).
 *   This handles a second frontend continuing after the first one stopped.
 * - No session at all → create a backdated session (the start call was likely missed).
 *
 * Backdated sessions start at (now - keepAlive/2) to better approximate the
 * actual start time when the initial start call was missed.
 */
async function cont(req: RequestWithTaskToken, resp: Response): Promise<ReturnType<typeof created>> {
  const { itemId, participantId } = req.taskToken;
  const attemptId = requireAttemptId(req.query);
  const now = Date.now();

  const last = await userTaskActivitiesTable.getLastSession(itemId, participantId);

  if (last && last.endTime === undefined) {
    if (isStale(last, now)) {
      await closeStaleSession(itemId, participantId, last);
    } else {
      await userTaskActivitiesTable.updateLatestTime(itemId, participantId, last.time, now);
      return created(resp);
    }
  } else if (last && last.endTime !== undefined && !isStale(last, now)) {
    await userTaskActivitiesTable.reopenSession(itemId, participantId, last.time, now);
    return created(resp);
  }

  await userTaskActivitiesTable.insertSession(itemId, participantId, now - KEEP_ALIVE_INTERVAL_MS / 2, {
    attemptId,
    latestUpdateTime: now,
  });
  return created(resp);
}

/**
 * Called when the user leaves the task. Four cases:
 * - Active session exists and is fresh → set endTime (happy path).
 * - Active session exists but is stale → close it with estimated endTime,
 *   then create a minimal completed session.
 * - Recently ended session (not stale) → update its endTime to now.
 *   This handles a second frontend stopping after the first one already stopped.
 * - No session at all → create a minimal completed backdated session.
 */
async function stop(req: RequestWithTaskToken, resp: Response): Promise<ReturnType<typeof created>> {
  const { itemId, participantId } = req.taskToken;
  const now = Date.now();

  const last = await userTaskActivitiesTable.getLastSession(itemId, participantId);

  if (last && last.endTime === undefined) {
    if (isStale(last, now)) {
      await closeStaleSession(itemId, participantId, last);
    } else {
      await userTaskActivitiesTable.setEndTime(itemId, participantId, last.time, now);
      return created(resp);
    }
  } else if (last && last.endTime !== undefined && !isStale(last, now)) {
    await userTaskActivitiesTable.setEndTime(itemId, participantId, last.time, now);
    return created(resp);
  }

  await userTaskActivitiesTable.insertSession(itemId, participantId, now - KEEP_ALIVE_INTERVAL_MS / 2, {
    latestUpdateTime: now,
    endTime: now,
  });
  return created(resp);
}

export const startSession = start as unknown as HandlerFunction;
export const continueSession = cont as unknown as HandlerFunction;
export const stopSession = stop as unknown as HandlerFunction;
