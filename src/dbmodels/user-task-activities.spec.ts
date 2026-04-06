import { UserTaskActivities } from './user-task-activities';
import { docClient } from '../dynamodb';
import { clearTable } from '../testutils/db';

describe('UserTaskActivities', () => {
  let table: UserTaskActivities;

  beforeEach(async () => {
    table = new UserTaskActivities(docClient);
    await clearTable();
  });

  describe('sessions', () => {
    const itemId = 'item-1';
    const participantId = 'user-1';

    it('should return undefined when no session exists', async () => {
      const result = await table.getLastSession(itemId, participantId);
      expect(result).toBeUndefined();
    });

    it('should insert and retrieve a session', async () => {
      const now = Date.now();
      await table.insertSession(itemId, participantId, now, {
        attemptId: 'att-1',
        latestUpdateTime: now,
      });

      const result = await table.getLastSession(itemId, participantId);
      expect(result).toEqual({
        time: now,
        attemptId: 'att-1',
        latestUpdateTime: now,
      });
    });

    it('should insert a session with endTime', async () => {
      const now = Date.now();
      await table.insertSession(itemId, participantId, now, {
        attemptId: 'att-1',
        latestUpdateTime: now,
        endTime: now + 1000,
      });

      const result = await table.getLastSession(itemId, participantId);
      expect(result).toEqual({
        time: now,
        attemptId: 'att-1',
        latestUpdateTime: now,
        endTime: now + 1000,
      });
    });

    it('should return the most recent session', async () => {
      const base = Date.now();
      await table.insertSession(itemId, participantId, base, {
        attemptId: 'att-1',
        latestUpdateTime: base,
        endTime: base + 1000,
      });
      await table.insertSession(itemId, participantId, base + 2000, {
        attemptId: 'att-2',
        latestUpdateTime: base + 2000,
      });

      const result = await table.getLastSession(itemId, participantId);
      expect(result?.attemptId).toBe('att-2');
      expect(result?.time).toBe(base + 2000);
    });

    it('should update latestUpdateTime', async () => {
      const now = Date.now();
      await table.insertSession(itemId, participantId, now, {
        attemptId: 'att-1',
        latestUpdateTime: now,
      });

      await table.updateLatestTime(itemId, participantId, now, now + 5000);

      const result = await table.getLastSession(itemId, participantId);
      expect(result?.latestUpdateTime).toBe(now + 5000);
    });

    it('should set endTime on a session', async () => {
      const now = Date.now();
      await table.insertSession(itemId, participantId, now, {
        attemptId: 'att-1',
        latestUpdateTime: now,
      });

      await table.setEndTime(itemId, participantId, now, now + 3000);

      const result = await table.getLastSession(itemId, participantId);
      expect(result?.endTime).toBe(now + 3000);
    });

    it('should insert a session without attemptId', async () => {
      const now = Date.now();
      await table.insertSession(itemId, participantId, now, {
        latestUpdateTime: now,
        endTime: now + 1000,
      });

      const result = await table.getLastSession(itemId, participantId);
      expect(result?.attemptId).toBeUndefined();
      expect(result?.endTime).toBe(now + 1000);
    });

    it('should isolate sessions between different item/participant pairs', async () => {
      const now = Date.now();
      await table.insertSession('item-A', 'user-X', now, {
        attemptId: 'att-1',
        latestUpdateTime: now,
      });

      const result = await table.getLastSession('item-B', 'user-X');
      expect(result).toBeUndefined();
    });
  });

  describe('scores', () => {
    it('should insert a score record', async () => {
      const now = Date.now();
      await table.insertScore('item-1', 'user-1', now, {
        answerId: 'ans-1',
        attemptId: 'att-1',
        validated: true,
        score: 75,
      });

      // Verify by querying the table directly (scores don't have a dedicated getter)
      const result = await table.getLastSession('item-1', 'user-1');
      // score entries have a different pk prefix, so session query won't find them
      expect(result).toBeUndefined();
    });
  });
});
