import { UserTaskStats } from './user-task-stats';
import { docClient } from '../dynamodb';
import { clearTable, getAllUserTaskStats } from '../testutils/db';

describe('UserTaskStats', () => {
  let table: UserTaskStats;
  const itemId = 'item-1';
  const groupId = 'user-1';

  beforeEach(async () => {
    table = new UserTaskStats(docClient);
    await clearTable();
  });

  describe('get', () => {
    it('should return undefined when no stat exists', async () => {
      const result = await table.get(itemId, groupId);
      expect(result).toBeUndefined();
    });

    it('should return the stat entry after addTimeSpent', async () => {
      await table.addTimeSpent(itemId, groupId, 5000, 1000);
      const result = await table.get(itemId, groupId);
      expect(result).toMatchObject({
        itemId,
        groupId,
        total_time_spent: 5000,
        abstime_begin: 1000,
      });
    });
  });

  describe('addTimeSpent', () => {
    it('should create an entry with duration and abstime_begin when none exists', async () => {
      await table.addTimeSpent(itemId, groupId, 10_000, 500);
      const items = await getAllUserTaskStats();
      expect(items).toHaveLength(1);
      const result = await table.get(itemId, groupId);
      expect(result?.total_time_spent).toBe(10_000);
      expect(result?.abstime_begin).toBe(500);
    });

    it('should accumulate total_time_spent on subsequent calls', async () => {
      await table.addTimeSpent(itemId, groupId, 10_000, 500);
      await table.addTimeSpent(itemId, groupId, 5_000, 600);
      const result = await table.get(itemId, groupId);
      expect(result?.total_time_spent).toBe(15_000);
    });

    it('should not overwrite abstime_begin on subsequent calls', async () => {
      await table.addTimeSpent(itemId, groupId, 10_000, 500);
      await table.addTimeSpent(itemId, groupId, 5_000, 200);
      const result = await table.get(itemId, groupId);
      expect(result?.abstime_begin).toBe(500);
    });

    it('should isolate stats between different item/user pairs', async () => {
      await table.addTimeSpent('item-A', 'user-X', 1000, 100);
      await table.addTimeSpent('item-B', 'user-X', 2000, 200);
      const a = await table.get('item-A', 'user-X');
      const b = await table.get('item-B', 'user-X');
      expect(a?.total_time_spent).toBe(1000);
      expect(b?.total_time_spent).toBe(2000);
    });
  });

  describe('updateScoreLevels', () => {
    it('should set time_to_reach and abstime for given levels', async () => {
      await table.updateScoreLevels(itemId, groupId, {
        levels: [
          { level: 10, timeToReach: 5000, abstime: 1000 },
          { level: 20, timeToReach: 8000, abstime: 2000 },
        ],
      });
      const result = await table.get(itemId, groupId);
      expect(result?.time_to_reach_10).toBe(5000);
      expect(result?.abstime_10).toBe(1000);
      expect(result?.time_to_reach_20).toBe(8000);
      expect(result?.abstime_20).toBe(2000);
    });

    it('should set abstime_begin when provided', async () => {
      await table.updateScoreLevels(itemId, groupId, {
        abstime_begin: 900,
        levels: [{ level: 10, timeToReach: 5000, abstime: 1000 }],
      });
      const result = await table.get(itemId, groupId);
      expect(result?.abstime_begin).toBe(900);
    });

    it('should overwrite existing level values with new ones', async () => {
      await table.updateScoreLevels(itemId, groupId, {
        levels: [{ level: 10, timeToReach: 5000, abstime: 1000 }],
      });
      await table.updateScoreLevels(itemId, groupId, {
        levels: [{ level: 10, timeToReach: 3000, abstime: 800 }],
      });
      const result = await table.get(itemId, groupId);
      expect(result?.time_to_reach_10).toBe(3000);
      expect(result?.abstime_10).toBe(800);
    });

    it('should do nothing when levels array is empty and no abstime_begin', async () => {
      await table.updateScoreLevels(itemId, groupId, { levels: [] });
      const items = await getAllUserTaskStats();
      expect(items).toHaveLength(0);
    });

    it('should not affect other attributes when updating levels', async () => {
      await table.addTimeSpent(itemId, groupId, 10_000, 500);
      await table.updateScoreLevels(itemId, groupId, {
        levels: [{ level: 30, timeToReach: 7000, abstime: 3000 }],
      });
      const result = await table.get(itemId, groupId);
      expect(result?.total_time_spent).toBe(10_000);
      expect(result?.abstime_begin).toBe(500);
      expect(result?.time_to_reach_30).toBe(7000);
    });
  });
});
