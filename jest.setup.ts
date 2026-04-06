import { spawn, ChildProcess } from 'child_process';
import { DynamoDB } from '@aws-sdk/client-dynamodb';

let dynamoProcess: ChildProcess;

export default async (): Promise<void> => {
  // Set test environment variables
  process.env.TABLE_FORUM = 'alg-sls-test-forum';
  process.env.TABLE_NOTIFICATIONS = 'alg-sls-test-notifications';
  process.env.TABLE_CONNECTIONS = 'alg-sls-test-connections';
  process.env.TABLE_STATS = 'alg-sls-test-stats';
  process.env.TABLE_ACTIVE_USERS = 'alg-sls-test-active-users';
  process.env.TABLE_USER_TASK_ACTIVITIES = 'alg-sls-test-user-task-activities';
  process.env.TABLE_USER_TASK_STATS = 'alg-sls-test-user-task-stats';
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

  // Create tables
  const tables = [
    {
      TableName: 'alg-sls-test-forum',
      AttributeDefinitions: [
        { AttributeName: 'pk', AttributeType: 'S' as const },
        { AttributeName: 'sk', AttributeType: 'N' as const },
      ],
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' as const },
        { AttributeName: 'sk', KeyType: 'RANGE' as const },
      ],
    },
    {
      TableName: 'alg-sls-test-notifications',
      AttributeDefinitions: [
        { AttributeName: 'userId', AttributeType: 'S' as const },
        { AttributeName: 'creationTime', AttributeType: 'N' as const },
      ],
      KeySchema: [
        { AttributeName: 'userId', KeyType: 'HASH' as const },
        { AttributeName: 'creationTime', KeyType: 'RANGE' as const },
      ],
    },
    {
      TableName: 'alg-sls-test-connections',
      AttributeDefinitions: [
        { AttributeName: 'connectionId', AttributeType: 'S' as const },
        { AttributeName: 'userId', AttributeType: 'S' as const },
        { AttributeName: 'liveActivityPk', AttributeType: 'S' as const },
      ],
      KeySchema: [
        { AttributeName: 'connectionId', KeyType: 'HASH' as const },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'user-connections',
          KeySchema: [
            { AttributeName: 'userId', KeyType: 'HASH' as const },
            { AttributeName: 'connectionId', KeyType: 'RANGE' as const },
          ],
          Projection: { ProjectionType: 'ALL' as const },
        },
        {
          IndexName: 'live-activity-subscribers',
          KeySchema: [
            { AttributeName: 'liveActivityPk', KeyType: 'HASH' as const },
            { AttributeName: 'connectionId', KeyType: 'RANGE' as const },
          ],
          Projection: { ProjectionType: 'KEYS_ONLY' as const },
        },
      ],
    },
    {
      TableName: 'alg-sls-test-stats',
      AttributeDefinitions: [
        { AttributeName: 'pk', AttributeType: 'S' as const },
        { AttributeName: 'sk', AttributeType: 'N' as const },
      ],
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' as const },
        { AttributeName: 'sk', KeyType: 'RANGE' as const },
      ],
    },
    {
      TableName: 'alg-sls-test-active-users',
      AttributeDefinitions: [
        { AttributeName: 'userId', AttributeType: 'S' as const },
        { AttributeName: 'gsiPk', AttributeType: 'S' as const },
        { AttributeName: 'lastConnectedTime', AttributeType: 'N' as const },
      ],
      KeySchema: [
        { AttributeName: 'userId', KeyType: 'HASH' as const },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'by-time',
          KeySchema: [
            { AttributeName: 'gsiPk', KeyType: 'HASH' as const },
            { AttributeName: 'lastConnectedTime', KeyType: 'RANGE' as const },
          ],
          Projection: { ProjectionType: 'KEYS_ONLY' as const },
        },
      ],
    },
    {
      TableName: 'alg-sls-test-user-task-activities',
      AttributeDefinitions: [
        { AttributeName: 'pk', AttributeType: 'S' as const },
        { AttributeName: 'time', AttributeType: 'N' as const },
      ],
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' as const },
        { AttributeName: 'time', KeyType: 'RANGE' as const },
      ],
    },
    {
      TableName: 'alg-sls-test-user-task-stats',
      AttributeDefinitions: [
        { AttributeName: 'itemId', AttributeType: 'S' as const },
        { AttributeName: 'groupId', AttributeType: 'S' as const },
      ],
      KeySchema: [
        { AttributeName: 'itemId', KeyType: 'HASH' as const },
        { AttributeName: 'groupId', KeyType: 'RANGE' as const },
      ],
    },
  ];

  for (const table of tables) {
    try {
      await dynamodb.createTable({ BillingMode: 'PAY_PER_REQUEST', ...table });
      console.log(`DynamoDB table ${table.TableName} created successfully`);
    } catch (error: any) {
      if (error.name === 'ResourceInUseException') {
        console.log(`Table ${table.TableName} already exists, continuing...`);
      } else {
        console.error(`Error creating table ${table.TableName}:`, error.message);
        throw error;
      }
    }
  }

  // Store process reference for teardown
  (global as any).__DYNAMODB_PROCESS__ = dynamoProcess;
};

