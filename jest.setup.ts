import { spawn, ChildProcess } from 'child_process';
import { DynamoDB } from '@aws-sdk/client-dynamodb';

let dynamoProcess: ChildProcess;

export default async (): Promise<void> => {
  // Set test environment variables
  process.env.TABLE_NAME = 'algorea-forum-test';
  process.env.STAGE = 'test';
  process.env.APIGW_ENDPOINT = 'http://localhost:3001';
  process.env.BACKEND_PUBLIC_KEY = ''; // Will be set by token generator in tests
  process.env.API_BASE = 'sls';

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

  // Wait for DynamoDB to be ready with retries
  const dynamodb = new DynamoDB({
    endpoint: 'http://localhost:8000',
    region: 'local-env',
    credentials: {
      accessKeyId: 'fakeMyKeyId',
      secretAccessKey: 'fakeSecretAccessKey',
    },
  });

  console.log('Waiting for DynamoDB Local to be ready...');
  let retries = 30;
  while (retries > 0) {
    try {
      await dynamodb.listTables({});
      console.log('DynamoDB Local is ready!');
      break;
    } catch (error) {
      retries--;
      if (retries === 0) {
        console.error('DynamoDB Local failed to start');
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Create table
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
  } catch (error: any) {
    if (error.name === 'ResourceInUseException') {
      console.log('Table already exists, continuing...');
    } else {
      console.error('Error creating table:', error.message);
      throw error;
    }
  }

  // Store process reference for teardown
  (global as any).__DYNAMODB_PROCESS__ = dynamoProcess;
};

