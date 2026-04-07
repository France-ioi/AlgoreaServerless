import { onSessionEnded, onGradeSavedStats } from './user-task-stats';
import { UserTaskActivities } from '../dbmodels/user-task-activities';
import { UserTaskStats } from '../dbmodels/user-task-stats';
import { GradeSavedPayload } from '../events/grade-saved';
import { docClient } from '../dynamodb';
import { clearTable } from '../testutils/db';

describe('user-task-stats handlers', () => {
  let activitiesTable: UserTaskActivities;
  let statsTable: UserTaskStats;
  const itemId = 'item-1';
  const groupId = 'user-1';

  beforeEach(async () => {
    activitiesTable = new UserTaskActivities(docClient);
    statsTable = new UserTaskStats(docClient);
    await clearTable();
  });

  function makePayload(overrides: Partial<GradeSavedPayload> = {}): GradeSavedPayload {
    return {
      answer_id: 'answer-1',
      participant_id: groupId,
      attempt_id: 'attempt-1',
      item_id: itemId,
      validated: false,
      caller_id: 'caller-1',
      score: 50,
      score_improved: true,
      ...overrides,
    };
  }

  describe('onSessionEnded', () => {
    it('should create a stat entry with duration and abstime_begin', async () => {
      await onSessionEnded(itemId, groupId, 1000, 6000);
      const stat = await statsTable.get(itemId, groupId);
      expect(stat?.total_time_spent).toBe(5000);
      expect(stat?.abstime_begin).toBe(1000);
    });

    it('should accumulate time across multiple sessions', async () => {
      await onSessionEnded(itemId, groupId, 1000, 4000);
      await onSessionEnded(itemId, groupId, 5000, 9000);
      const stat = await statsTable.get(itemId, groupId);
      expect(stat?.total_time_spent).toBe(7000);
    });

    it('should preserve abstime_begin from the first session', async () => {
      await onSessionEnded(itemId, groupId, 1000, 4000);
      await onSessionEnded(itemId, groupId, 500, 1500);
      const stat = await statsTable.get(itemId, groupId);
      expect(stat?.abstime_begin).toBe(1000);
    });
  });

  describe('onGradeSavedStats', () => {
    it('should ignore score=0', async () => {
      await onGradeSavedStats(makePayload({ score: 0 }), 5000);
      const stat = await statsTable.get(itemId, groupId);
      expect(stat).toBeUndefined();
    });

    it('should ignore score_improved=false', async () => {
      await onGradeSavedStats(makePayload({ score_improved: false }), 5000);
      const stat = await statsTable.get(itemId, groupId);
      expect(stat).toBeUndefined();
    });

    it('should ignore scores below 10 (no level threshold reached)', async () => {
      await onGradeSavedStats(makePayload({ score: 5 }), 5000);
      const stat = await statsTable.get(itemId, groupId);
      expect(stat).toBeUndefined();
    });

    it('should set time_to_reach and abstime for the reached level and all lower levels', async () => {
      const sessionStart = 1000;
      const sessionEnd = 4000;
      await activitiesTable.insertSession(itemId, groupId, sessionStart, {
        latestUpdateTime: sessionEnd,
        endTime: sessionEnd,
      });

      const envelopeTime = 5000;
      await onGradeSavedStats(makePayload({ score: 30 }), envelopeTime);

      const stat = await statsTable.get(itemId, groupId);
      expect(stat?.time_to_reach_10).toBe(3000);
      expect(stat?.time_to_reach_20).toBe(3000);
      expect(stat?.time_to_reach_30).toBe(3000);
      expect(stat?.abstime_10).toBe(envelopeTime);
      expect(stat?.abstime_20).toBe(envelopeTime);
      expect(stat?.abstime_30).toBe(envelopeTime);
      expect(stat?.time_to_reach_40).toBeUndefined();
    });

    it('should set abstime_begin when no stat entry exists', async () => {
      await activitiesTable.insertSession(itemId, groupId, 1000, {
        latestUpdateTime: 2000,
        endTime: 2000,
      });

      await onGradeSavedStats(makePayload({ score: 10 }), 3000);
      const stat = await statsTable.get(itemId, groupId);
      expect(stat?.abstime_begin).toBe(3000);
    });

    it('should not overwrite abstime_begin when stat entry already exists', async () => {
      await onSessionEnded(itemId, groupId, 500, 1500);

      await activitiesTable.insertSession(itemId, groupId, 500, {
        latestUpdateTime: 1500,
        endTime: 1500,
      });

      await onGradeSavedStats(makePayload({ score: 10 }), 3000);
      const stat = await statsTable.get(itemId, groupId);
      expect(stat?.abstime_begin).toBe(500);
    });

    it('should keep the lower value when the level is already recorded with a lower time', async () => {
      await activitiesTable.insertSession(itemId, groupId, 1000, {
        latestUpdateTime: 2000,
        endTime: 2000,
      });
      await onGradeSavedStats(makePayload({ score: 20 }), 3000);

      await activitiesTable.insertSession(itemId, groupId, 4000, {
        latestUpdateTime: 8000,
        endTime: 8000,
      });
      await onGradeSavedStats(makePayload({ score: 20 }), 9000);

      const stat = await statsTable.get(itemId, groupId);
      expect(stat?.time_to_reach_20).toBe(1000);
      expect(stat?.abstime_20).toBe(3000);
    });

    it('should update to a lower value when an earlier event arrives late', async () => {
      // Second event (higher cumulative) arrives first
      await activitiesTable.insertSession(itemId, groupId, 1000, {
        latestUpdateTime: 4000,
        endTime: 4000,
      });
      await activitiesTable.insertSession(itemId, groupId, 5000, {
        latestUpdateTime: 8000,
        endTime: 8000,
      });
      await onGradeSavedStats(makePayload({ score: 20 }), 9000);

      const statBefore = await statsTable.get(itemId, groupId);
      expect(statBefore?.time_to_reach_20).toBe(6000);

      // First event (lower cumulative) arrives late -- only the first session
      // existed at that point, so cumulative time is lower
      await onGradeSavedStats(makePayload({ score: 20 }), 4500);

      const stat = await statsTable.get(itemId, groupId);
      expect(stat?.time_to_reach_20).toBe(3000);
      expect(stat?.abstime_20).toBe(4500);
    });

    it('should count partial time when event falls inside a now-ended session', async () => {
      // Session started at 1000, ended at 6000, but event is at 4000
      await activitiesTable.insertSession(itemId, groupId, 1000, {
        latestUpdateTime: 6000,
        endTime: 6000,
      });

      await onGradeSavedStats(makePayload({ score: 10 }), 4000);
      const stat = await statsTable.get(itemId, groupId);
      // Should count 4000 - 1000 = 3000, not the full 5000
      expect(stat?.time_to_reach_10).toBe(3000);
    });

    it('should count partial time for an open session up to the event time', async () => {
      // Session started at 1000, still open (no endTime)
      await activitiesTable.insertSession(itemId, groupId, 1000, {
        latestUpdateTime: 3000,
      });

      await onGradeSavedStats(makePayload({ score: 10 }), 5000);
      const stat = await statsTable.get(itemId, groupId);
      // Should count 5000 - 1000 = 4000
      expect(stat?.time_to_reach_10).toBe(4000);
    });

    it('should count 0 when there are no sessions at all', async () => {
      await onGradeSavedStats(makePayload({ score: 10 }), 5000);
      const stat = await statsTable.get(itemId, groupId);
      expect(stat?.time_to_reach_10).toBe(0);
    });

    it('should only count ended sessions when none spans the event time', async () => {
      // Ended session before event
      await activitiesTable.insertSession(itemId, groupId, 1000, {
        latestUpdateTime: 3000,
        endTime: 3000,
      });
      // Session starting after event
      await activitiesTable.insertSession(itemId, groupId, 6000, {
        latestUpdateTime: 8000,
        endTime: 8000,
      });

      await onGradeSavedStats(makePayload({ score: 10 }), 5000);
      const stat = await statsTable.get(itemId, groupId);
      // Only the first session counts: 3000 - 1000 = 2000
      expect(stat?.time_to_reach_10).toBe(2000);
    });

    it('should combine ended sessions and partial active session', async () => {
      // Fully ended session before event
      await activitiesTable.insertSession(itemId, groupId, 1000, {
        latestUpdateTime: 3000,
        endTime: 3000,
      });
      // Open session spanning the event time
      await activitiesTable.insertSession(itemId, groupId, 4000, {
        latestUpdateTime: 7000,
      });

      await onGradeSavedStats(makePayload({ score: 10 }), 6000);
      const stat = await statsTable.get(itemId, groupId);
      // First session: 3000 - 1000 = 2000, second: 6000 - 4000 = 2000
      expect(stat?.time_to_reach_10).toBe(4000);
    });

    it('should handle score=100 by setting all levels', async () => {
      await activitiesTable.insertSession(itemId, groupId, 1000, {
        latestUpdateTime: 6000,
        endTime: 6000,
      });

      await onGradeSavedStats(makePayload({ score: 100 }), 7000);
      const stat = await statsTable.get(itemId, groupId);
      expect(stat?.time_to_reach_10).toBe(5000);
      expect(stat?.time_to_reach_50).toBe(5000);
      expect(stat?.time_to_reach_100).toBe(5000);
      expect(stat?.abstime_10).toBe(7000);
      expect(stat?.abstime_50).toBe(7000);
      expect(stat?.abstime_100).toBe(7000);
    });

    it('should cap at level 100 when score exceeds 100', async () => {
      await activitiesTable.insertSession(itemId, groupId, 1000, {
        latestUpdateTime: 6000,
        endTime: 6000,
      });

      await onGradeSavedStats(makePayload({ score: 150 }), 7000);
      const stat = await statsTable.get(itemId, groupId);
      expect(stat?.time_to_reach_100).toBe(5000);
      expect(stat?.abstime_100).toBe(7000);
      // No spurious attributes beyond 100
      expect((stat as Record<string, unknown>)?.['time_to_reach_110']).toBeUndefined();
    });

    it('should not overwrite existing lower level values (if_not_exists)', async () => {
      await activitiesTable.insertSession(itemId, groupId, 1000, {
        latestUpdateTime: 2000,
        endTime: 2000,
      });
      await onGradeSavedStats(makePayload({ score: 10 }), 3000);

      await activitiesTable.insertSession(itemId, groupId, 4000, {
        latestUpdateTime: 8000,
        endTime: 8000,
      });
      await onGradeSavedStats(makePayload({ score: 30 }), 9000);

      const stat = await statsTable.get(itemId, groupId);
      // Level 10 should keep its original value
      expect(stat?.time_to_reach_10).toBe(1000);
      expect(stat?.abstime_10).toBe(3000);
      // Levels 20 and 30 should be set from the second call
      expect(stat?.time_to_reach_20).toBe(5000);
      expect(stat?.time_to_reach_30).toBe(5000);
    });

    it('should set missingEarlierActivity when first session lacks firstActivity', async () => {
      await activitiesTable.insertSession(itemId, groupId, 1000, {
        latestUpdateTime: 2000,
        endTime: 2000,
      });
      await onGradeSavedStats(makePayload({ score: 10 }), 3000);
      const stat = await statsTable.get(itemId, groupId);
      expect(stat?.missingEarlierActivity).toBe(true);
    });

    it('should not set missingEarlierActivity when first session has firstActivity', async () => {
      await activitiesTable.insertSession(itemId, groupId, 1000, {
        latestUpdateTime: 2000,
        endTime: 2000,
        firstActivity: true,
      });
      await onGradeSavedStats(makePayload({ score: 10 }), 3000);
      const stat = await statsTable.get(itemId, groupId);
      expect(stat?.missingEarlierActivity).toBe(false);
    });

    it('should set missingEarlierActivity when there are no sessions', async () => {
      await onGradeSavedStats(makePayload({ score: 10 }), 5000);
      const stat = await statsTable.get(itemId, groupId);
      expect(stat?.missingEarlierActivity).toBe(true);
    });
  });
});
