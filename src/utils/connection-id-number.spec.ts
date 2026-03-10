import { NumberValue } from '@aws-sdk/lib-dynamodb';
import { connectionIdToNumberValue, dbConnectionId } from './connection-id-number';

describe('connectionIdToNumberValue', () => {
  it('should convert a base64 connectionId to a NumberValue', () => {
    const result = connectionIdToNumberValue('L0SM9cOFIAMCIdw=');
    expect(result).toBeInstanceOf(NumberValue);
    expect(typeof result.value).toBe('string');
  });

  it('should produce different NumberValues for different connectionIds', () => {
    const a = connectionIdToNumberValue('L0SM9cOFIAMCIdw=');
    const b = connectionIdToNumberValue('AQIDBA==');
    expect(a.value).not.toBe(b.value);
  });

  it('should handle short base64 strings', () => {
    const result = connectionIdToNumberValue('AQ==');
    expect(result.value).toBe('1');
  });

  it('should handle a single zero byte', () => {
    const result = connectionIdToNumberValue('AA==');
    expect(result.value).toBe('0');
  });
});

describe('dbConnectionId (Zod schema)', () => {
  it('should round-trip a real AWS-style connectionId', () => {
    const original = 'L0SM9cOFIAMCIdw=';
    const nv = connectionIdToNumberValue(original);
    expect(dbConnectionId.parse(nv)).toBe(original);
  });

  it('should round-trip a short connectionId', () => {
    const original = 'AQIDBA==';
    const nv = connectionIdToNumberValue(original);
    expect(dbConnectionId.parse(nv)).toBe(original);
  });

  it('should round-trip a single-byte connectionId', () => {
    const original = 'AQ==';
    const nv = connectionIdToNumberValue(original);
    expect(dbConnectionId.parse(nv)).toBe(original);
  });

  it('should round-trip a zero-byte connectionId', () => {
    const original = 'AA==';
    const nv = connectionIdToNumberValue(original);
    expect(dbConnectionId.parse(nv)).toBe(original);
  });

  it('should round-trip various realistic connectionIds', () => {
    const ids = [
      'L0SM9cOFIAMCIdw=',
      'dGVzdENvbm4=',
      'YWJjZGVmZw==',
      'AQIDBAUGBwgJCgs=',
    ];
    for (const id of ids) {
      const nv = connectionIdToNumberValue(id);
      expect(dbConnectionId.parse(nv)).toBe(id);
    }
  });

  it('should reject non-NumberValue inputs', () => {
    expect(() => dbConnectionId.parse(12345)).toThrow();
    expect(() => dbConnectionId.parse('hello')).toThrow();
    expect(() => dbConnectionId.parse(null)).toThrow();
  });
});
