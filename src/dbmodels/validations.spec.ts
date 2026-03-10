import { Validations } from './validations';
import { docClient } from '../dynamodb';
import { clearTable } from '../testutils/db';

describe('Validations', () => {
  let validations: Validations;

  beforeEach(async () => {
    validations = new Validations(docClient);
    await clearTable();
  });

  describe('insert', () => {
    it('should insert a validation and retrieve it', async () => {
      const time = Date.now();
      await validations.insert(time, {
        participantId: 'participant-1',
        itemId: 'item-1',
        answerId: 'answer-1',
      });

      const result = await validations.getLatest(10);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        sk: time,
        participantId: 'participant-1',
        itemId: 'item-1',
        answerId: 'answer-1',
      });
    });
  });

  describe('getLatest', () => {
    it('should return empty array when no validations exist', async () => {
      const result = await validations.getLatest(10);
      expect(result).toEqual([]);
    });

    it('should return validations in descending order (newest first)', async () => {
      const baseTime = Date.now();
      await validations.insert(baseTime, {
        participantId: 'p1', itemId: 'i1', answerId: 'a1',
      });
      await validations.insert(baseTime + 100, {
        participantId: 'p2', itemId: 'i2', answerId: 'a2',
      });
      await validations.insert(baseTime + 200, {
        participantId: 'p3', itemId: 'i3', answerId: 'a3',
      });

      const result = await validations.getLatest(10);
      expect(result).toHaveLength(3);
      expect(result[0]?.participantId).toBe('p3');
      expect(result[1]?.participantId).toBe('p2');
      expect(result[2]?.participantId).toBe('p1');
    });

    it('should respect the limit parameter', async () => {
      const baseTime = Date.now();
      for (let i = 0; i < 5; i++) {
        await validations.insert(baseTime + i * 100, {
          participantId: `p${i}`, itemId: `i${i}`, answerId: `a${i}`,
        });
      }

      const result = await validations.getLatest(3);
      expect(result).toHaveLength(3);
    });
  });
});
