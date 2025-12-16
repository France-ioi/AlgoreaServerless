import { ForumTable } from './table';
import { dynamodb } from '../dynamodb';
import { clearTable } from '../testutils/db';

describe('ForumTable', () => {
  let table: ForumTable;

  beforeEach(async () => {
    table = new ForumTable(dynamodb);
    await clearTable();
  });

  describe('constructor', () => {
    it('should throw error if TABLE_NAME is not set', () => {
      const originalTableName = process.env.TABLE_NAME;
      delete process.env.TABLE_NAME;

      expect(() => new ForumTable(dynamodb)).toThrow('env variable "TABLE_NAME" not set!');

      process.env.TABLE_NAME = originalTableName;
    });

    it('should set tableName from environment variable', () => {
      expect(table['tableName']).toBe(process.env.TABLE_NAME);
    });
  });

  describe('batchUpdate', () => {
    it('should insert items in batches', async () => {
      const items = Array.from({ length: 30 }, (_, i) => ({
        pk: `test-pk-${i}`,
        sk: Date.now() + i,
        data: `item-${i}`,
      }));

      await table['batchUpdate'](items);

      // Verify items were inserted
      const result = await dynamodb.scan({ TableName: process.env.TABLE_NAME! });
      expect(result.Items?.length).toBe(30);
    });

    it('should handle empty array', async () => {
      await expect(table['batchUpdate']([])).resolves.not.toThrow();
    });

    it('should handle single item', async () => {
      const items = [{ pk: 'test-pk', sk: Date.now(), data: 'test-data' }];
      await expect(table['batchUpdate'](items)).resolves.not.toThrow();

      const result = await dynamodb.scan({ TableName: process.env.TABLE_NAME! });
      expect(result.Items?.length).toBe(1);
    });
  });

  describe('sqlRead', () => {
    beforeEach(async () => {
      await table['batchUpdate']([
        { pk: 'test-pk-1', sk: 1000, value: 'value1' },
        { pk: 'test-pk-1', sk: 2000, value: 'value2' },
        { pk: 'test-pk-2', sk: 1000, value: 'value3' },
      ]);
    });

    it('should read items with PartiQL query', async () => {
      const results = await table['sqlRead']({
        query: `SELECT * FROM "${process.env.TABLE_NAME}" WHERE pk = ?`,
        params: [ 'test-pk-1' ],
      });

      expect(results).toHaveLength(2);
      expect(results.every(r => r.pk === 'test-pk-1')).toBe(true);
    });

    it('should return empty array when no results', async () => {
      const results = await table['sqlRead']({
        query: `SELECT * FROM "${process.env.TABLE_NAME}" WHERE pk = ?`,
        params: [ 'non-existent-pk' ],
      });

      expect(results).toEqual([]);
    });

    it('should handle queries with multiple parameters', async () => {
      const results = await table['sqlRead']({
        query: `SELECT * FROM "${process.env.TABLE_NAME}" WHERE pk = ? AND sk = ?`,
        params: [ 'test-pk-1', 1000 ],
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ pk: 'test-pk-1', sk: 1000 });
    });
  });

  describe('sqlWrite', () => {
    it('should insert item with PartiQL', async () => {
      await table['sqlWrite']({
        query: `INSERT INTO "${process.env.TABLE_NAME}" VALUE {'pk': ?, 'sk': ?, 'data': ?}`,
        params: [ 'test-pk', 123, 'test-data' ],
      });

      const results = await table['sqlRead']({
        query: `SELECT * FROM "${process.env.TABLE_NAME}" WHERE pk = ?`,
        params: [ 'test-pk' ],
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ pk: 'test-pk', sk: 123, data: 'test-data' });
    });

    it('should delete item with PartiQL', async () => {
      await table['batchUpdate']([{ pk: 'test-pk', sk: 123 }]);

      await table['sqlWrite']({
        query: `DELETE FROM "${process.env.TABLE_NAME}" WHERE pk = ? AND sk = ?`,
        params: [ 'test-pk', 123 ],
      });

      const results = await table['sqlRead']({
        query: `SELECT * FROM "${process.env.TABLE_NAME}" WHERE pk = ?`,
        params: [ 'test-pk' ],
      });

      expect(results).toEqual([]);
    });

    it('should execute transaction with multiple statements', async () => {
      await table['sqlWrite']([
        {
          query: `INSERT INTO "${process.env.TABLE_NAME}" VALUE {'pk': ?, 'sk': ?, 'data': ?}`,
          params: [ 'test-pk-1', 100, 'data1' ],
        },
        {
          query: `INSERT INTO "${process.env.TABLE_NAME}" VALUE {'pk': ?, 'sk': ?, 'data': ?}`,
          params: [ 'test-pk-2', 200, 'data2' ],
        },
      ]);

      const results1 = await table['sqlRead']({
        query: `SELECT * FROM "${process.env.TABLE_NAME}" WHERE pk = ?`,
        params: [ 'test-pk-1' ],
      });
      const results2 = await table['sqlRead']({
        query: `SELECT * FROM "${process.env.TABLE_NAME}" WHERE pk = ?`,
        params: [ 'test-pk-2' ],
      });

      expect(results1).toHaveLength(1);
      expect(results2).toHaveLength(1);
    });
  });
});



