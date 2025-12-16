import { spawn, ChildProcess } from 'child_process';
import { DynamoDB } from '@aws-sdk/client-dynamodb';

let dynamoProcess: ChildProcess;

export default async (): Promise<void> => {
  // Set test environment variables
  process.env.TABLE_NAME = 'algorea-forum-test';
  process.env.STAGE = 'test';
  process.env.APIGW_ENDPOINT = 'http://localhost:3001';
  process.env.BACKEND_PUBLIC_KEY = ''; // Will be set by token generator in tests

  // Start DynamoDB Local
  console.log('Starting DynamoDB Local...');

  dynamoProcess = spawn('npx', [
    'sls',
    'dynamodb',
    'start',
    '--port',
    '8000',
    '--inMemory',
    '--migrate'
  ], {
    stdio: 'inherit',
    detached: false,
  });

  // Wait for DynamoDB to be ready
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Create table
  const dynamodb = new DynamoDB({
    endpoint: 'http://localhost:8000',
    region: 'local-env',
    credentials: {
      accessKeyId: 'fakeMyKeyId',
      secretAccessKey: 'fakeSecretAccessKey',
    },
  });

  try {
    await dynamodb.createTable({
      TableName: 'algorea-forum-test',
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'pk', AttributeType: 'S' },
        { AttributeName: 'sk', AttributeType: 'N' },
      ],
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
    });
    console.log('DynamoDB table created successfully');
  } catch (error) {
    console.log('Table may already exist or error creating:', error);
  }

  // Store process reference for teardown
  (global as any).__DYNAMODB_PROCESS__ = dynamoProcess;
};

