import { ActiveUsers } from './active-users';
import { docClient } from '../dynamodb';
import { clearTable, getAll } from '../testutils/db';

describe('ActiveUsers', () => {
  let activeUsers: ActiveUsers;

  beforeEach(async () => {
    activeUsers = new ActiveUsers(docClient);
    await clearTable();
  });

  describe('insert', () => {
    it('should create an entry for a new user', async () => {
      await activeUsers.insert('12345');

      const items = await getAll();
      const stage = process.env.STAGE || 'dev';
      const entries = items.filter(item => item.pk === `${stage}#ACTIVE_USERS`);

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        pk: `${stage}#ACTIVE_USERS`,
      });
      expect(entries[0]).toHaveProperty('lastConnectedTime');
      expect(entries[0]).toHaveProperty('ttl');
    });

    it('should upsert (overwrite) when the same user connects again', async () => {
      await activeUsers.insert('12345');
      const before = Date.now();
      await activeUsers.insert('12345');

      const items = await getAll();
      const stage = process.env.STAGE || 'dev';
      const entries = items.filter(item => item.pk === `${stage}#ACTIVE_USERS`);

      expect(entries).toHaveLength(1);
      const lastConnectedTime = Number((entries[0]!.lastConnectedTime as { value: string }).value);
      expect(lastConnectedTime).toBeGreaterThanOrEqual(before);
    });

    it('should create separate entries for different users', async () => {
      await activeUsers.insert('111');
      await activeUsers.insert('222');
      await activeUsers.insert('333');

      const items = await getAll();
      const stage = process.env.STAGE || 'dev';
      const entries = items.filter(item => item.pk === `${stage}#ACTIVE_USERS`);

      expect(entries).toHaveLength(3);
    });
  });

  describe('countWindows', () => {
    const msPerDay = 24 * 60 * 60 * 1000;

    it('should return zero counts when no entries exist', async () => {
      const counts = await activeUsers.countWindows([ 1 ]);
      expect(counts).toEqual([ 0 ]);
    });

    it('should count users within windows correctly', async () => {
      await activeUsers.insert('111');
      await activeUsers.insert('222');
      await activeUsers.insert('333');

      const now = Date.now();
      const counts = await activeUsers.countWindows([ 1, 30, 365 ], now + 1000);
      expect(counts).toEqual([ 3, 3, 3 ]);
    });

    it('should exclude users outside the window', async () => {
      await activeUsers.insert('111');
      await activeUsers.insert('222');

      const now = Date.now();
      const counts = await activeUsers.countWindows([ 1 ], now + 2 * msPerDay);
      expect(counts).toEqual([ 0 ]);
    });

    it('should count multiple windows from a single query', async () => {
      await activeUsers.insert('111');

      const now = Date.now();
      const countsNow = await activeUsers.countWindows([ 1, 30 ], now + 1000);
      expect(countsNow).toEqual([ 1, 1 ]);

      const countsLater = await activeUsers.countWindows([ 1, 30 ], now + 2 * msPerDay);
      expect(countsLater).toEqual([ 0, 1 ]);
    });

    it('should deduplicate users who connected multiple times', async () => {
      await activeUsers.insert('111');
      await activeUsers.insert('111');
      await activeUsers.insert('111');

      const now = Date.now();
      const counts = await activeUsers.countWindows([ 1 ], now + 1000);
      expect(counts).toEqual([ 1 ]);
    });
  });
});
