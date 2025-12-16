import { toAttributeValue, fromAttributeValue, toDBItem, fromDBItem, toDBParameters } from './dynamodb';

describe('toAttributeValue', () => {

  it('should convert strings to { S: value }', () => {
    expect(toAttributeValue('hello')).toEqual({ S: 'hello' });
    expect(toAttributeValue('')).toEqual({ S: '' });
  });

  it('should convert numbers to { N: string }', () => {
    expect(toAttributeValue(123)).toEqual({ N: '123' });
    expect(toAttributeValue(0)).toEqual({ N: '0' });
    expect(toAttributeValue(-42)).toEqual({ N: '-42' });
    expect(toAttributeValue(3.14)).toEqual({ N: '3.14' });
  });

  it('should convert booleans to { BOOL: value }', () => {
    expect(toAttributeValue(true)).toEqual({ BOOL: true });
    expect(toAttributeValue(false)).toEqual({ BOOL: false });
  });

  it('should convert null to { NULL: true }', () => {
    expect(toAttributeValue(null)).toEqual({ NULL: true });
  });

  it('should convert objects recursively to { M: {...} }', () => {
    const obj = {
      name: 'Alice',
      age: 30,
      active: true,
    };
    expect(toAttributeValue(obj)).toEqual({
      M: {
        name: { S: 'Alice' },
        age: { N: '30' },
        active: { BOOL: true },
      },
    });
  });

  it('should handle nested objects', () => {
    const obj = {
      user: {
        name: 'Bob',
        metadata: {
          count: 5,
        },
      },
    };
    expect(toAttributeValue(obj)).toEqual({
      M: {
        user: {
          M: {
            name: { S: 'Bob' },
            metadata: {
              M: {
                count: { N: '5' },
              },
            },
          },
        },
      },
    });
  });

  it('should throw error for unsupported types', () => {
    expect(() => toAttributeValue(undefined)).toThrow('unhandled value');
    expect(() => toAttributeValue(Symbol('test'))).toThrow('unhandled value');
  });

});

describe('fromAttributeValue', () => {

  it('should convert { S: value } to strings', () => {
    expect(fromAttributeValue({ S: 'hello' })).toBe('hello');
    expect(fromAttributeValue({ S: '' })).toBe('');
  });

  it('should convert { N: string } to numbers', () => {
    expect(fromAttributeValue({ N: '123' })).toBe(123);
    expect(fromAttributeValue({ N: '0' })).toBe(0);
    expect(fromAttributeValue({ N: '-42' })).toBe(-42);
    expect(fromAttributeValue({ N: '3.14' })).toBe(3.14);
  });

  it('should convert { BOOL: value } to booleans', () => {
    expect(fromAttributeValue({ BOOL: true })).toBe(true);
    expect(fromAttributeValue({ BOOL: false })).toBe(false);
  });

  it('should convert { NULL: true } to null', () => {
    expect(fromAttributeValue({ NULL: true })).toBe(null);
  });

  it('should convert { M: {...} } to objects', () => {
    const attr = {
      M: {
        name: { S: 'Alice' },
        age: { N: '30' },
        active: { BOOL: true },
      },
    };
    expect(fromAttributeValue(attr)).toEqual({
      name: 'Alice',
      age: 30,
      active: true,
    });
  });

  it('should handle nested objects', () => {
    const attr = {
      M: {
        user: {
          M: {
            name: { S: 'Bob' },
            metadata: {
              M: {
                count: { N: '5' },
              },
            },
          },
        },
      },
    };
    expect(fromAttributeValue(attr)).toEqual({
      user: {
        name: 'Bob',
        metadata: {
          count: 5,
        },
      },
    });
  });

  it('should throw error for unhandled attribute types', () => {
    expect(() => fromAttributeValue({} as any)).toThrow('unhandled value');
    expect(() => fromAttributeValue({ L: [] } as any)).toThrow('unhandled value');
  });

});

describe('toDBItem and fromDBItem', () => {

  it('should round-trip conversion preserves data', () => {
    const item = {
      pk: 'test-pk',
      sk: 123,
      name: 'Alice',
      active: true,
      metadata: {
        count: 5,
        flag: false,
      },
    };
    const dbItem = toDBItem(item);
    const result = fromDBItem(dbItem);
    expect(result).toEqual(item);
  });

  it('should filter undefined values', () => {
    const item = {
      pk: 'test-pk',
      sk: 123,
      optional: undefined,
      name: 'Bob',
    };
    const dbItem = toDBItem(item);
    expect(dbItem).toEqual({
      pk: { S: 'test-pk' },
      sk: { N: '123' },
      name: { S: 'Bob' },
    });
    expect(dbItem.optional).toBeUndefined();
  });

  it('should handle empty objects', () => {
    const item = {};
    const dbItem = toDBItem(item);
    expect(dbItem).toEqual({});
  });

  it('should preserve null values', () => {
    const item = {
      pk: 'test-pk',
      value: null,
    };
    const dbItem = toDBItem(item);
    expect(dbItem).toEqual({
      pk: { S: 'test-pk' },
      value: { NULL: true },
    });
  });

});

describe('toDBParameters', () => {

  it('should convert array of values correctly', () => {
    const params = [ 'hello', 123, true, null ];
    const result = toDBParameters(params);
    expect(result).toEqual([
      { S: 'hello' },
      { N: '123' },
      { BOOL: true },
      { NULL: true },
    ]);
  });

  it('should handle empty array', () => {
    expect(toDBParameters([])).toEqual([]);
  });

  it('should handle complex objects in array', () => {
    const params = [
      'test',
      { name: 'Alice', age: 30 },
    ];
    const result = toDBParameters(params);
    expect(result).toEqual([
      { S: 'test' },
      {
        M: {
          name: { S: 'Alice' },
          age: { N: '30' },
        },
      },
    ]);
  });

});

