import { ValidationCounts, validationDayTtl } from './validation-counts';
import { docClient } from '../dynamodb';
import { clearTable, getAll } from '../testutils/db';

describe('ValidationCounts', () => {
  let validationCounts: ValidationCounts;

  beforeEach(async () => {
    validationCounts = new ValidationCounts(docClient);
    await clearTable();
  });

  describe('incrementDay', () => {
    it('should atomically increment daily count and set ttl', async () => {
      const time = new Date('2026-03-10T12:00:00Z').getTime();
      await validationCounts.incrementDay(time);
      await validationCounts.incrementDay(time);

      const items = await getAll();
      const stage = process.env.STAGE || 'dev';
      const dayItems = items.filter(item => item.pk === `${stage}#VALIDATIONS#DAY`);
      const dayEntry = dayItems[0] as { sk: { value: string }, count: { value: string }, ttl: { value: string } };

      expect(dayItems).toHaveLength(1);
      expect(Number(dayEntry.sk.value)).toBe(20260310);
      expect(Number(dayEntry.count.value)).toBe(2);
      expect(Number(dayEntry.ttl.value)).toBe(validationDayTtl(time));
    });
  });

  describe('sumLastDays', () => {
    it('should return rolling sums over UTC day buckets', async () => {
      await validationCounts.incrementDay(new Date('2026-03-08T09:00:00Z').getTime());

      await validationCounts.incrementDay(new Date('2026-03-09T10:00:00Z').getTime());
      await validationCounts.incrementDay(new Date('2026-03-09T14:00:00Z').getTime());

      await validationCounts.incrementDay(new Date('2026-03-10T10:00:00Z').getTime());
      await validationCounts.incrementDay(new Date('2026-03-10T14:00:00Z').getTime());
      await validationCounts.incrementDay(new Date('2026-03-10T18:00:00Z').getTime());

      const now = new Date('2026-03-10T23:00:00Z').getTime();
      expect(await validationCounts.sumLastDays(1, now)).toBe(3);
      expect(await validationCounts.sumLastDays(2, now)).toBe(5);
      expect(await validationCounts.sumLastDays(3, now)).toBe(6);
      expect(await validationCounts.sumLastDays(30, now)).toBe(6);
    });
  });
});
