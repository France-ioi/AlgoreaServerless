import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Table } from './table';
import { safeNumber, docClient } from '../dynamodb';
import { clearTable, getAllForum } from '../testutils/db';

class TestTable extends Table {
  constructor(db: DynamoDBDocumentClient) {
    super(db, 'TABLE_FORUM');
  }
}

describe('Table', () => {
  let table: Table;

  beforeEach(async () => {
    table = new TestTable(docClient);
    await clearTable();
  });

  describe('constructor', () => {
    it('should throw error if env var is not set', () => {
      expect(() => new TestTable(docClient)).not.toThrow();

      class MissingEnvTable extends Table {
        constructor(db: DynamoDBDocumentClient) {
          super(db, 'TABLE_NONEXISTENT');
        }
      }
      expect(() => new MissingEnvTable(docClient)).toThrow('env variable "TABLE_NONEXISTENT" not set!');
    });

    it('should set tableName from environment variable', () => {
      expect(table['tableName']).toBe(process.env.TABLE_FORUM);
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

      const result = await getAllForum();
      expect(result.length).toBe(30);
    });

    it('should handle empty array', async () => {
      await expect(table['batchUpdate']([])).resolves.not.toThrow();
    });

    it('should handle single item', async () => {
      const items = [{ pk: 'test-pk', sk: Date.now(), data: 'test-data' }];
      await expect(table['batchUpdate'](items)).resolves.not.toThrow();

      const result = await getAllForum();
      expect(result.length).toBe(1);
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
        query: `SELECT * FROM "${process.env.TABLE_FORUM}" WHERE pk = ?`,
        params: [ 'test-pk-1' ],
      });

      expect(results).toHaveLength(2);
      expect(results.every(r => r.pk === 'test-pk-1')).toBe(true);
    });

    it('should return empty array when no results', async () => {
      const results = await table['sqlRead']({
        query: `SELECT * FROM "${process.env.TABLE_FORUM}" WHERE pk = ?`,
        params: [ 'non-existent-pk' ],
      });

      expect(results).toEqual([]);
    });

    it('should handle queries with multiple parameters', async () => {
      const results = await table['sqlRead']({
        query: `SELECT * FROM "${process.env.TABLE_FORUM}" WHERE pk = ? AND sk = ?`,
        params: [ 'test-pk-1', 1000 ],
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.pk).toBe('test-pk-1');
      expect(safeNumber.parse(results[0]?.sk)).toBe(1000);
    });
  });

  describe('sqlWrite', () => {
    it('should insert item with PartiQL', async () => {
      await table['sqlWrite']({
        query: `INSERT INTO "${process.env.TABLE_FORUM}" VALUE {'pk': ?, 'sk': ?, 'data': ?}`,
        params: [ 'test-pk', 123, 'test-data' ],
      });

      const results = await table['sqlRead']({
        query: `SELECT * FROM "${process.env.TABLE_FORUM}" WHERE pk = ?`,
        params: [ 'test-pk' ],
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.pk).toBe('test-pk');
      expect(safeNumber.parse(results[0]?.sk)).toBe(123);
      expect(results[0]?.data).toBe('test-data');
    });

    it('should delete item with PartiQL', async () => {
      await table['batchUpdate']([{ pk: 'test-pk', sk: 123 }]);

      await table['sqlWrite']({
        query: `DELETE FROM "${process.env.TABLE_FORUM}" WHERE pk = ? AND sk = ?`,
        params: [ 'test-pk', 123 ],
      });

      const results = await table['sqlRead']({
        query: `SELECT * FROM "${process.env.TABLE_FORUM}" WHERE pk = ?`,
        params: [ 'test-pk' ],
      });

      expect(results).toEqual([]);
    });

    it('should execute transaction with multiple statements', async () => {
      await table['sqlWrite']([
        {
          query: `INSERT INTO "${process.env.TABLE_FORUM}" VALUE {'pk': ?, 'sk': ?, 'data': ?}`,
          params: [ 'test-pk-1', 100, 'data1' ],
        },
        {
          query: `INSERT INTO "${process.env.TABLE_FORUM}" VALUE {'pk': ?, 'sk': ?, 'data': ?}`,
          params: [ 'test-pk-2', 200, 'data2' ],
        },
      ]);

      const results1 = await table['sqlRead']({
        query: `SELECT * FROM "${process.env.TABLE_FORUM}" WHERE pk = ?`,
        params: [ 'test-pk-1' ],
      });
      const results2 = await table['sqlRead']({
        query: `SELECT * FROM "${process.env.TABLE_FORUM}" WHERE pk = ?`,
        params: [ 'test-pk-2' ],
      });

      expect(results1).toHaveLength(1);
      expect(results2).toHaveLength(1);
    });
  });

  describe('insertIfNotExists', () => {
    it('should insert a new item and return true', async () => {
      const inserted = await table['insertIfNotExists']({ pk: 'test-pk', sk: 100, data: 'first' });
      expect(inserted).toBe(true);

      const results = await table['sqlRead']({
        query: `SELECT * FROM "${process.env.TABLE_FORUM}" WHERE pk = ?`,
        params: [ 'test-pk' ],
      });
      expect(results).toHaveLength(1);
      expect(results[0]?.data).toBe('first');
    });

    it('should not overwrite an existing item and return false', async () => {
      await table['insertIfNotExists']({ pk: 'test-pk', sk: 100, data: 'first' });
      const inserted = await table['insertIfNotExists']({ pk: 'test-pk', sk: 100, data: 'second' });
      expect(inserted).toBe(false);

      const results = await table['sqlRead']({
        query: `SELECT * FROM "${process.env.TABLE_FORUM}" WHERE pk = ?`,
        params: [ 'test-pk' ],
      });
      expect(results).toHaveLength(1);
      // The existing row must remain untouched (this is what makes the operation safe under
      // SDK retries: a "duplicate" is recognized rather than overwritten).
      expect(results[0]?.data).toBe('first');
    });

    it('should treat items with the same pk but different sk as distinct', async () => {
      const insertedA = await table['insertIfNotExists']({ pk: 'test-pk', sk: 100, data: 'a' });
      const insertedB = await table['insertIfNotExists']({ pk: 'test-pk', sk: 200, data: 'b' });
      expect(insertedA).toBe(true);
      expect(insertedB).toBe(true);

      const results = await table['sqlRead']({
        query: `SELECT * FROM "${process.env.TABLE_FORUM}" WHERE pk = ?`,
        params: [ 'test-pk' ],
      });
      expect(results).toHaveLength(2);
    });
  });
});
