import { NumberValue } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';

const BIGINT_0 = BigInt(0);
const BIGINT_8 = BigInt(8);
const BIGINT_FF = BigInt(0xff);

/**
 * Convert a connectionId (base64 string) to a DynamoDB NumberValue.
 * Base64 bytes are interpreted as a big-endian unsigned integer.
 * Uses NumberValue to avoid JS number precision loss for values > 2^53.
 */
export function connectionIdToNumberValue(connectionId: string): NumberValue {
  const bytes = Buffer.from(connectionId, 'base64');
  let n = BIGINT_0;
  for (const byte of bytes) {
    n = (n << BIGINT_8) | BigInt(byte);
  }
  return NumberValue.from(n.toString());
}

function numberValueToConnectionId(nv: NumberValue): string {
  let n = BigInt(nv.value);
  if (n === BIGINT_0) return Buffer.from([ 0 ]).toString('base64');
  const bytes: number[] = [];
  while (n > BIGINT_0) {
    bytes.unshift(Number(n & BIGINT_FF));
    n >>= BIGINT_8;
  }
  return Buffer.from(bytes).toString('base64');
}

/**
 * Zod schema that parses a DynamoDB NumberValue (from wrapNumbers: true) into a
 * connectionId string (base64). The stored number is interpreted as big-endian
 * unsigned integer bytes, then base64-encoded.
 */
export const dbConnectionId = z.instanceof(NumberValue)
  .transform(numberValueToConnectionId);
