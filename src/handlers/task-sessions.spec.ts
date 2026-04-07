import {
  UserTaskActivities, Session, KEEP_ALIVE_INTERVAL_MS, STALE_THRESHOLD_MS,
} from '../dbmodels/user-task-activities';
import { docClient } from '../dynamodb';
import { clearTable } from '../testutils/db';

/**
 * Replays the handler logic with a controlled clock.
 * Each method mirrors the corresponding handler in task-sessions.ts
 * but takes an explicit `now` instead of calling Date.now().
 */
class SessionSimulator {
  constructor(
    private table: UserTaskActivities,
    private itemId: string,
    private participantId: string,
  ) {}

  private isStale(session: Session, now: number): boolean {
    return session.latestUpdateTime < now - STALE_THRESHOLD_MS;
  }

  private async closeStaleSession(session: Session): Promise<void> {
    await this.table.setEndTime(
      this.itemId, this.participantId, session.time,
      session.latestUpdateTime + KEEP_ALIVE_INTERVAL_MS / 2,
    );
  }

  async start(now: number, attemptId: string, resultStartedAt?: number): Promise<void> {
    const last = await this.table.getLastSession(this.itemId, this.participantId);
    const isFirstSession = last === undefined;
    if (last && last.endTime === undefined) {
      if (this.isStale(last, now)) {
        await this.closeStaleSession(last);
      } else {
        await this.table.updateLatestTime(this.itemId, this.participantId, last.time, now);
        return;
      }
    }
    const firstActivity = isFirstSession
      && resultStartedAt !== undefined
      && now <= resultStartedAt + 60_000;
    await this.table.insertSession(this.itemId, this.participantId, now, {
      attemptId, latestUpdateTime: now,
      ...(firstActivity ? { firstActivity: true } : {}),
    });
  }

  async continue(now: number, attemptId: string): Promise<void> {
    const last = await this.table.getLastSession(this.itemId, this.participantId);
    if (last && last.endTime === undefined) {
      if (this.isStale(last, now)) {
        await this.closeStaleSession(last);
      } else {
        await this.table.updateLatestTime(this.itemId, this.participantId, last.time, now);
        return;
      }
    } else if (last && last.endTime !== undefined && !this.isStale(last, now)) {
      await this.table.reopenSession(this.itemId, this.participantId, last.time, now);
      return;
    }
    await this.table.insertSession(this.itemId, this.participantId, now - KEEP_ALIVE_INTERVAL_MS / 2, {
      attemptId, latestUpdateTime: now,
    });
  }

  async stop(now: number): Promise<void> {
    const last = await this.table.getLastSession(this.itemId, this.participantId);
    if (last && last.endTime === undefined) {
      if (this.isStale(last, now)) {
        await this.closeStaleSession(last);
      } else {
        await this.table.setEndTime(this.itemId, this.participantId, last.time, now);
        return;
      }
    } else if (last && last.endTime !== undefined && !this.isStale(last, now)) {
      await this.table.setEndTime(this.itemId, this.participantId, last.time, now);
      return;
    }
    await this.table.insertSession(this.itemId, this.participantId, now - KEEP_ALIVE_INTERVAL_MS / 2, {
      latestUpdateTime: now, endTime: now,
    });
  }
}

/** Shorthand: convert minutes to ms offset from a base. */
function min(m: number): number {
  return m * 60_000;
}

describe('task session logic', () => {
  let table: UserTaskActivities;
  const itemId = 'item-1';
  const participantId = 'user-1';

  beforeEach(async () => {
    table = new UserTaskActivities(docClient);
    await clearTable();
  });

  describe('start session flow', () => {
    it('should create a new session when no previous session exists', async () => {
      const now = Date.now();
      const last = await table.getLastSession(itemId, participantId);
      expect(last).toBeUndefined();

      await table.insertSession(itemId, participantId, now, {
        attemptId: 'att-1',
        latestUpdateTime: now,
      });

      const session = await table.getLastSession(itemId, participantId);
      expect(session).toEqual({
        time: now,
        attemptId: 'att-1',
        latestUpdateTime: now,
      });
    });

    it('should update latestUpdateTime when active session exists (not stale)', async () => {
      const startTime = Date.now();
      await table.insertSession(itemId, participantId, startTime, {
        attemptId: 'att-1',
        latestUpdateTime: startTime,
      });

      const now = startTime + 60_000; // 1 min later, not stale
      const last = await table.getLastSession(itemId, participantId);
      expect(last).toBeDefined();
      expect(last!.endTime).toBeUndefined();
      expect(last!.latestUpdateTime).toBeGreaterThanOrEqual(now - STALE_THRESHOLD_MS);

      await table.updateLatestTime(itemId, participantId, last!.time, now);

      const updated = await table.getLastSession(itemId, participantId);
      expect(updated?.latestUpdateTime).toBe(now);
      expect(updated?.endTime).toBeUndefined();
    });

    it('should close stale session and create new one', async () => {
      const startTime = Date.now() - STALE_THRESHOLD_MS - 10_000;
      await table.insertSession(itemId, participantId, startTime, {
        attemptId: 'att-1',
        latestUpdateTime: startTime,
      });

      const now = Date.now();
      const last = await table.getLastSession(itemId, participantId);
      expect(last).toBeDefined();
      expect(last!.endTime).toBeUndefined();
      expect(last!.latestUpdateTime).toBeLessThan(now - STALE_THRESHOLD_MS);

      await table.setEndTime(itemId, participantId, last!.time, last!.latestUpdateTime + KEEP_ALIVE_INTERVAL_MS / 2);
      await table.insertSession(itemId, participantId, now, {
        attemptId: 'att-2',
        latestUpdateTime: now,
      });

      const newSession = await table.getLastSession(itemId, participantId);
      expect(newSession?.attemptId).toBe('att-2');
      expect(newSession?.time).toBe(now);
    });
  });

  describe('continue session flow', () => {
    it('should create a session backdated by KEEP_ALIVE_INTERVAL/2 when no session exists', async () => {
      const now = Date.now();
      const sessionTime = now - KEEP_ALIVE_INTERVAL_MS / 2;

      await table.insertSession(itemId, participantId, sessionTime, {
        attemptId: 'att-1',
        latestUpdateTime: now,
      });

      const session = await table.getLastSession(itemId, participantId);
      expect(session?.time).toBe(sessionTime);
      expect(session?.latestUpdateTime).toBe(now);
    });
  });

  describe('stop session flow', () => {
    it('should set endTime on active session', async () => {
      const startTime = Date.now();
      await table.insertSession(itemId, participantId, startTime, {
        attemptId: 'att-1',
        latestUpdateTime: startTime,
      });

      const stopTime = startTime + 30_000;
      await table.setEndTime(itemId, participantId, startTime, stopTime);

      const session = await table.getLastSession(itemId, participantId);
      expect(session?.endTime).toBe(stopTime);
    });

    it('should create a completed session when no active session exists', async () => {
      const now = Date.now();
      const sessionTime = now - KEEP_ALIVE_INTERVAL_MS / 2;

      await table.insertSession(itemId, participantId, sessionTime, {
        latestUpdateTime: now,
        endTime: now,
      });

      const session = await table.getLastSession(itemId, participantId);
      expect(session?.time).toBe(sessionTime);
      expect(session?.endTime).toBe(now);
      expect(session?.latestUpdateTime).toBe(now);
      expect(session?.attemptId).toBeUndefined();
    });
  });

  describe('stale detection', () => {
    it('should detect a stale session correctly', async () => {
      const staleTime = Date.now() - STALE_THRESHOLD_MS - 1;
      await table.insertSession(itemId, participantId, staleTime - 60_000, {
        attemptId: 'att-1',
        latestUpdateTime: staleTime,
      });

      const last = await table.getLastSession(itemId, participantId);
      expect(last).toBeDefined();
      expect(last!.latestUpdateTime).toBeLessThan(Date.now() - STALE_THRESHOLD_MS);
    });

    it('should not consider a recent session as stale', async () => {
      const recentTime = Date.now() - 30_000; // 30 seconds ago
      await table.insertSession(itemId, participantId, recentTime - 60_000, {
        attemptId: 'att-1',
        latestUpdateTime: recentTime,
      });

      const last = await table.getLastSession(itemId, participantId);
      expect(last).toBeDefined();
      expect(last!.latestUpdateTime).toBeGreaterThan(Date.now() - STALE_THRESHOLD_MS);
    });
  });

  describe('realistic scenarios', () => {
    let sim: SessionSimulator;
    let t0: number;

    beforeEach(() => {
      sim = new SessionSimulator(table, itemId, participantId);
      t0 = 1_700_000_000_000; // fixed base to keep sk values stable
    });

    it('single client: start, keep-alives, stop', async () => {
      // t=0  start
      // t=2  continue
      // t=4  continue
      // t=6  continue
      // t=8  stop
      await sim.start(t0, 'att-1');
      await sim.continue(t0 + min(2), 'att-1');
      await sim.continue(t0 + min(4), 'att-1');
      await sim.continue(t0 + min(6), 'att-1');
      await sim.stop(t0 + min(8));

      const sessions = await table.getAllSessions(itemId, participantId);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toEqual({
        time: t0,
        attemptId: 'att-1',
        latestUpdateTime: t0 + min(8),
        endTime: t0 + min(8),
      });
    });

    it('single client: start, no keep-alive (stale), then new start', async () => {
      // t=0   start
      // t=10  start again (previous session is stale after 4.5 min)
      await sim.start(t0, 'att-1');
      await sim.start(t0 + min(10), 'att-2');

      const sessions = await table.getAllSessions(itemId, participantId);
      expect(sessions).toHaveLength(2);

      // First session auto-closed at latestUpdateTime + keepAlive/2
      expect(sessions[0]?.endTime).toBe(t0 + KEEP_ALIVE_INTERVAL_MS / 2);
      expect(sessions[1]?.time).toBe(t0 + min(10));
      expect(sessions[1]?.attemptId).toBe('att-2');
      expect(sessions[1]?.endTime).toBeUndefined();
    });

    it('two frontends: overlapping keep-alives merge into one session', async () => {
      // Frontend A: start at t=1, keep-alive at t=3, t=5, t=7
      // Frontend B: start at t=5 (session already active, just updates)
      //             keep-alive at t=6, t=8
      // Both send keep-alives interleaved — all update the same session.
      // Result: a single session with latestUpdateTime advancing.

      await sim.start(t0 + min(1), 'att-1');
      await sim.continue(t0 + min(3), 'att-1');
      await sim.continue(t0 + min(5), 'att-1');
      await sim.start(t0 + min(5) + 1, 'att-1');
      await sim.continue(t0 + min(6), 'att-1');
      await sim.continue(t0 + min(7), 'att-1');
      await sim.continue(t0 + min(8), 'att-1');

      const sessions = await table.getAllSessions(itemId, participantId);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.time).toBe(t0 + min(1));
      expect(sessions[0]?.latestUpdateTime).toBe(t0 + min(8));
      expect(sessions[0]?.endTime).toBeUndefined();
    });

    it('two frontends: one stops, the other continues then stops', async () => {
      // t=1   A starts
      // t=3   A keep-alive
      // t=5   B starts (session active → just updates)
      // t=5   A keep-alive
      // t=6   B keep-alive
      // t=7   A keep-alive
      // t=8   A stops → sets endTime on the session
      // t=9   B keep-alive → session recently ended → reopens it
      // t=10  B stops → sets endTime again
      //
      // Result: one single session spanning t=1 to t=10.

      await sim.start(t0 + min(1), 'att-1');
      await sim.continue(t0 + min(3), 'att-1');
      await sim.start(t0 + min(5), 'att-1');
      await sim.continue(t0 + min(5) + 1, 'att-1');
      await sim.continue(t0 + min(6), 'att-1');
      await sim.continue(t0 + min(7), 'att-1');
      await sim.stop(t0 + min(8)); // A stops
      await sim.continue(t0 + min(9), 'att-1'); // B reopens the session
      await sim.stop(t0 + min(10)); // B stops

      const sessions = await table.getAllSessions(itemId, participantId);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.time).toBe(t0 + min(1));
      expect(sessions[0]?.latestUpdateTime).toBe(t0 + min(10));
      expect(sessions[0]?.endTime).toBe(t0 + min(10));
    });

    it('two frontends: both stop nearly simultaneously produces one session', async () => {
      // A stops at t=8, B stops at t=8+1ms.
      // B's stop sees the recently-ended session and just updates its endTime.

      await sim.start(t0 + min(1), 'att-1');
      await sim.continue(t0 + min(3), 'att-1');
      await sim.start(t0 + min(5), 'att-1');
      await sim.continue(t0 + min(6), 'att-1');
      await sim.continue(t0 + min(7), 'att-1');
      await sim.stop(t0 + min(8)); // A stops
      await sim.stop(t0 + min(8) + 1); // B stops — updates endTime

      const sessions = await table.getAllSessions(itemId, participantId);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.time).toBe(t0 + min(1));
      expect(sessions[0]?.endTime).toBe(t0 + min(8) + 1);
    });

    it('continue without prior start creates a backdated session', async () => {
      // User's frontend sends continue before any start
      // (e.g. page was refreshed and missed the start call)
      await sim.continue(t0 + min(2), 'att-1');

      const sessions = await table.getAllSessions(itemId, participantId);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.time).toBe(t0 + min(2) - KEEP_ALIVE_INTERVAL_MS / 2);
      expect(sessions[0]?.latestUpdateTime).toBe(t0 + min(2));
      expect(sessions[0]?.endTime).toBeUndefined();
    });

    it('stop without prior start creates a minimal completed session', async () => {
      await sim.stop(t0 + min(5));

      const sessions = await table.getAllSessions(itemId, participantId);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.endTime).toBe(t0 + min(5));
      expect(sessions[0]?.time).toBe(t0 + min(5) - KEEP_ALIVE_INTERVAL_MS / 2);
    });
  });

  describe('firstActivity flag', () => {
    let sim: SessionSimulator;
    let t0: number;

    beforeEach(() => {
      sim = new SessionSimulator(table, itemId, participantId);
      t0 = 1_700_000_000_000;
    });

    it('should set firstActivity when first session and resultStartedAt within 1min', async () => {
      await sim.start(t0, 'att-1', t0 - 10_000);

      const session = await table.getLastSession(itemId, participantId);
      expect(session?.firstActivity).toBe(true);
    });

    it('should not set firstActivity when resultStartedAt is older than 1min', async () => {
      await sim.start(t0, 'att-1', t0 - 61_000);

      const session = await table.getLastSession(itemId, participantId);
      expect(session?.firstActivity).toBeUndefined();
    });

    it('should not set firstActivity when a previous session exists', async () => {
      await sim.start(t0, 'att-1');
      await sim.stop(t0 + min(5));
      await sim.start(t0 + min(10), 'att-2', t0 + min(10) - 5_000);

      const session = await table.getLastSession(itemId, participantId);
      expect(session?.firstActivity).toBeUndefined();
    });

    it('should not set firstActivity when resultStartedAt is not provided', async () => {
      await sim.start(t0, 'att-1');

      const session = await table.getLastSession(itemId, participantId);
      expect(session?.firstActivity).toBeUndefined();
    });

    it('should not set firstActivity when a stale session exists', async () => {
      await sim.start(t0, 'att-1');
      // Wait long enough for the session to become stale, then start again with resultStartedAt
      const laterTime = t0 + STALE_THRESHOLD_MS + 10_000;
      await sim.start(laterTime, 'att-2', laterTime - 5_000);

      const sessions = await table.getAllSessions(itemId, participantId);
      expect(sessions).toHaveLength(2);
      expect(sessions[1]?.firstActivity).toBeUndefined();
    });
  });
});
