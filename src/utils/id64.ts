import { NumberValue } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';

/**
 * Zod schema that parses a DynamoDB NumberValue (from wrapNumbers: true) into
 * an Id64 string. Id64 values are 64-bit integers stored as DynamoDB numbers
 * and represented as strings in TypeScript to avoid JS number precision loss.
 */
export const id64 = z.instanceof(NumberValue)
  .transform(nv => nv.value);
