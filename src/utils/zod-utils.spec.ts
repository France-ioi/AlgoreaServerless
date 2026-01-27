import { z } from 'zod';
import { safeParseArray } from './zod-utils';

describe('safeParseArray', () => {
  const schema = z.object({
    id: z.number(),
    name: z.string(),
  });

  it('should return all items when all are valid', () => {
    const items = [
      { id: 1, name: 'first' },
      { id: 2, name: 'second' },
    ];

    const result = safeParseArray(items, schema, 'test item');

    expect(result).toEqual(items);
  });

  it('should filter out invalid items', () => {
    const items = [
      { id: 1, name: 'valid' },
      { id: 'invalid', name: 'bad id' }, // invalid: id should be number
      { id: 3, name: 'also valid' },
    ];

    const result = safeParseArray(items, schema, 'test item');

    expect(result).toEqual([
      { id: 1, name: 'valid' },
      { id: 3, name: 'also valid' },
    ]);
  });

  it('should log warnings for invalid items', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const items = [
      { id: 1, name: 'valid' },
      { id: 'invalid', name: 'bad' },
    ];

    safeParseArray(items, schema, 'test context');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to parse test context:',
      expect.any(String),
      'Item:',
      expect.stringContaining('"id":"invalid"')
    );

    warnSpy.mockRestore();
  });

  it('should return empty array when all items are invalid', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const items = [
      { id: 'bad', name: 123 },
      { wrong: 'shape' },
    ];

    const result = safeParseArray(items, schema, 'test item');

    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });

  it('should return empty array for empty input', () => {
    const result = safeParseArray([], schema, 'test item');

    expect(result).toEqual([]);
  });

  it('should handle items with extra properties (stripped by default)', () => {
    const items = [
      { id: 1, name: 'test', extra: 'ignored' },
    ];

    const result = safeParseArray(items, schema, 'test item');

    // Zod strips extra properties by default
    expect(result).toEqual([{ id: 1, name: 'test' }]);
  });
});
