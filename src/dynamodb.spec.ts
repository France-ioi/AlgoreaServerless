import { NumberValue } from '@aws-sdk/lib-dynamodb';
import { dbNumber } from './dynamodb';

describe('dbNumber', () => {

  it('should accept a regular JS number', () => {
    expect(dbNumber.parse(123)).toBe(123);
    expect(dbNumber.parse(0)).toBe(0);
    expect(dbNumber.parse(-42)).toBe(-42);
    expect(dbNumber.parse(3.14)).toBe(3.14);
  });

  it('should convert NumberValue to a JS number', () => {
    expect(dbNumber.parse(new NumberValue(123))).toBe(123);
    expect(dbNumber.parse(new NumberValue('456'))).toBe(456);
    expect(dbNumber.parse(new NumberValue('0'))).toBe(0);
    expect(dbNumber.parse(new NumberValue('-42'))).toBe(-42);
    expect(dbNumber.parse(new NumberValue('3.14'))).toBe(3.14);
  });

  it('should reject non-number values', () => {
    expect(() => dbNumber.parse('hello')).toThrow();
    expect(() => dbNumber.parse(null)).toThrow();
    expect(() => dbNumber.parse(undefined)).toThrow();
    expect(() => dbNumber.parse(true)).toThrow();
    expect(() => dbNumber.parse({})).toThrow();
  });

});
