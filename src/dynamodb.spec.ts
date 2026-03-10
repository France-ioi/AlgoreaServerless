import { NumberValue } from '@aws-sdk/lib-dynamodb';
import { safeNumber } from './dynamodb';

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
