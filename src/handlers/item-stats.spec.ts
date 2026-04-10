import { computeItemStats } from './item-stats';
import { UserTaskStat } from '../dbmodels/user-task-stats';

function makeStat(overrides: Partial<UserTaskStat> = {}): UserTaskStat {
  return {
    itemId: 'item1',
    groupId: `user-${Math.random()}`,
    ...overrides,
  };
}

describe('computeItemStats', () => {

  it('should return empty stats for no users', () => {
    const result = computeItemStats([]);
    expect(result).toEqual({
      userCount: 0,
      medianTimeSpent: null,
      medianTimeToValidate: null,
      medianDropoutTimeLowScore: null,
      avgScore: null,
      scoreDistribution: [],
    });
  });

  it('should compute userCount', () => {
    const stats = [ makeStat(), makeStat(), makeStat() ];
    const result = computeItemStats(stats);
    expect(result.userCount).toBe(3);
  });

  it('should compute medianTimeSpent', () => {
    const stats = [
      makeStat({ total_time_spent: 10000 }),
      makeStat({ total_time_spent: 30000 }),
      makeStat({ total_time_spent: 20000 }),
    ];
    expect(computeItemStats(stats).medianTimeSpent).toBe(20000);
  });

  it('should compute medianTimeToValidate from time_to_reach_100', () => {
    const stats = [
      makeStat({ time_to_reach_100: 50000 }),
      makeStat({ time_to_reach_100: 70000 }),
      makeStat({}),
    ];
    expect(computeItemStats(stats).medianTimeToValidate).toBe(60000);
  });

  it('should return null medianTimeToValidate when no one validated', () => {
    const stats = [ makeStat({ total_time_spent: 10000 }) ];
    expect(computeItemStats(stats).medianTimeToValidate).toBeNull();
  });

  it('should compute medianDropoutTimeLowScore for users with score < 10', () => {
    const stats = [
      makeStat({ total_time_spent: 5000 }),
      makeStat({ total_time_spent: 15000 }),
      makeStat({ total_time_spent: 30000, current_score: 10 }),
    ];
    expect(computeItemStats(stats).medianDropoutTimeLowScore).toBe(10000);
  });

  it('should compute avgScore', () => {
    const stats = [
      makeStat({ current_score: 20 }),
      makeStat({ current_score: 10 }),
      makeStat({}), // score 0
    ];
    expect(computeItemStats(stats).avgScore).toBe(10); // (20+10+0)/3
  });

  it('should compute scoreDistribution with 10 entries', () => {
    const stats = [
      makeStat({ time_to_reach_10: 1000, time_to_reach_20: 2000 }),
      makeStat({ time_to_reach_10: 5000 }),
      makeStat({}),
    ];
    const result = computeItemStats(stats);
    expect(result.scoreDistribution).toHaveLength(10);
    expect(result.scoreDistribution[0]!.score).toBe(10);
    expect(result.scoreDistribution[9]!.score).toBe(100);
  });

  it('should compute pctUsersAbove correctly', () => {
    const stats = [
      makeStat({ current_score: 100, time_to_reach_10: 1000, time_to_reach_20: 2000, time_to_reach_100: 5000 }),
      makeStat({ current_score: 20, time_to_reach_10: 3000, time_to_reach_20: 4000 }),
      makeStat({ current_score: 10, time_to_reach_10: 2000 }),
      makeStat({}),
    ];
    const result = computeItemStats(stats);
    // score 10: 3 of 4 users
    expect(result.scoreDistribution[0]!.pctUsersAbove).toBe(75);
    // score 20: 2 of 4 users
    expect(result.scoreDistribution[1]!.pctUsersAbove).toBe(50);
    // score 100: 1 of 4 users
    expect(result.scoreDistribution[9]!.pctUsersAbove).toBe(25);
  });

  it('should compute pctByTime correctly', () => {
    const stats = [
      makeStat({ time_to_reach_10: 30_000 }), // 0.5 min
      makeStat({ time_to_reach_10: 90_000 }), // 1.5 min
      makeStat({ time_to_reach_10: 180_000 }), // 3 min
      makeStat({}),
    ];
    const result = computeItemStats(stats);
    const dist10 = result.scoreDistribution[0]!;
    // At 1 min (60000ms): 1 user (30000 <= 60000)
    expect(dist10.pctByTime[1]).toBe(25);
    // At 2 min (120000ms): 2 users (30000, 90000 <= 120000)
    expect(dist10.pctByTime[2]).toBe(50);
    // At 3 min (180000ms): 3 users
    expect(dist10.pctByTime[3]).toBe(75);
    // At 60 min: still 3 users (4th has no time_to_reach_10)
    expect(dist10.pctByTime[60]).toBe(75);
  });

  it('should use current_score for avgScore', () => {
    const stats = [
      makeStat({ current_score: 75 }),
      makeStat({ current_score: 25 }),
    ];
    expect(computeItemStats(stats).avgScore).toBe(50);
  });

  it('should default to 0 when current_score is absent', () => {
    const stats = [ makeStat({}) ];
    expect(computeItemStats(stats).avgScore).toBe(0);
  });

});
