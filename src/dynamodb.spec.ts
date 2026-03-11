import { NumberValue } from '@aws-sdk/lib-dynamodb';
import { safeNumber, deepConvertNumberValues } from './dynamodb';

describe('safeNumber', () => {

  it('should accept a regular JS number', () => {
    expect(safeNumber.parse(123)).toBe(123);
    expect(safeNumber.parse(0)).toBe(0);
    expect(safeNumber.parse(-42)).toBe(-42);
    expect(safeNumber.parse(3.14)).toBe(3.14);
  });

  it('should convert NumberValue to a JS number', () => {
    expect(safeNumber.parse(NumberValue.from(123))).toBe(123);
    expect(safeNumber.parse(NumberValue.from('456'))).toBe(456);
    expect(safeNumber.parse(NumberValue.from('0'))).toBe(0);
    expect(safeNumber.parse(NumberValue.from('-42'))).toBe(-42);
    expect(safeNumber.parse(NumberValue.from('3.14'))).toBe(3.14);
  });

  it('should reject non-number values', () => {
    expect(() => safeNumber.parse('hello')).toThrow();
    expect(() => safeNumber.parse(null)).toThrow();
    expect(() => safeNumber.parse(undefined)).toThrow();
    expect(() => safeNumber.parse(true)).toThrow();
    expect(() => safeNumber.parse({})).toThrow();
  });

});

describe('deepConvertNumberValues', () => {

  it('should convert a top-level NumberValue', () => {
    expect(deepConvertNumberValues(NumberValue.from('42'))).toBe(42);
  });

  it('should convert NumberValues inside a flat object', () => {
    const input = { time: NumberValue.from('1000'), text: 'hello' };
    expect(deepConvertNumberValues(input)).toEqual({ time: 1000, text: 'hello' });
  });

  it('should convert NumberValues in nested objects', () => {
    const input = { nested: { ts: NumberValue.from('999') } };
    expect(deepConvertNumberValues(input)).toEqual({ nested: { ts: 999 } });
  });

  it('should convert NumberValues inside arrays', () => {
    const input = [ NumberValue.from('1'), 'a', NumberValue.from('2') ];
    expect(deepConvertNumberValues(input)).toEqual([ 1, 'a', 2 ]);
  });

  it('should leave primitives unchanged', () => {
    expect(deepConvertNumberValues('hello')).toBe('hello');
    expect(deepConvertNumberValues(42)).toBe(42);
    expect(deepConvertNumberValues(null)).toBeNull();
    expect(deepConvertNumberValues(undefined)).toBeUndefined();
    expect(deepConvertNumberValues(true)).toBe(true);
  });

});
