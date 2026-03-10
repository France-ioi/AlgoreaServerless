/* eslint-disable @typescript-eslint/naming-convention */
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, NumberValue } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';

const dynamoOptions = (): ConstructorParameters<typeof DynamoDB>[0] | undefined => {
  switch (process.env.STAGE) {
    case 'local':
      return {
        region: 'localhost',
        endpoint: 'http://localhost:7000',
      };
    case 'test':
      return {
        endpoint: 'http://localhost:8000',
        tls: false,
        region: 'local-env',
        credentials: {
          accessKeyId: 'fakeMyKeyId',
          secretAccessKey: 'fakeSecretAccessKey'
        }
      };
    case 'dev':
    case 'production':
    default:
      return undefined;
  }
};

const options = dynamoOptions();
const dynamodbClient = options ? new DynamoDB(options) : new DynamoDB();

/**
 * Raw DynamoDB client - only used for low-level operations in tests.
 */
export const dynamodb = dynamodbClient;

/**
 * DynamoDB Document Client with automatic marshalling/unmarshalling.
 * Numbers are returned as NumberValue (wrapNumbers: true) to preserve precision
 * for large numbers (e.g. int64 IDs, base64-encoded connection IDs used as sort keys).
 * Use `dbNumber` Zod schema to parse NumberValue back to JS number when safe.
 */
export const docClient = DynamoDBDocumentClient.from(dynamodbClient, {
  marshallOptions: {
    convertEmptyValues: true,
    allowImpreciseNumbers: false,
  },
  unmarshallOptions: {
    wrapNumbers: true,
  },
});

/**
 * Zod schema that parses DynamoDB NumberValue (from wrapNumbers: true) into a JS number.
 * Use this in all Zod schemas for number fields returned from DynamoDB.
 */
export const dbNumber = z.union([
  z.number(),
  z.instanceof(NumberValue).transform(n => Number(n.value)),
]);
