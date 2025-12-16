import { ALBEvent, APIGatewayProxyEvent, Context } from 'aws-lambda';

/**
 * Create a mock ALB event for REST API testing
 * Based on actual AWS ALB event structure
 */
export const mockALBEvent = (overrides?: Partial<ALBEvent>): ALBEvent => ({
  requestContext: {
    elb: {
      targetGroupArn: 'arn:aws:elasticloadbalancing:eu-west-3:123456789012:targetgroup/test/12345',
    },
  },
  httpMethod: 'GET',
  path: '/test',
  queryStringParameters: undefined,
  headers: {
    accept: 'application/json, text/plain, */*',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'content-type': 'application/json',
    host: 'test.example.com',
    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) Firefox/146.0',
  },
  body: '',
  isBase64Encoded: false,
  ...overrides,
});

/**
 * Create a mock API Gateway Proxy event for REST API testing
 */
export const mockAPIGatewayProxyEvent = (overrides?: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent => ({
  body: null,
  headers: {},
  multiValueHeaders: {},
  httpMethod: 'GET',
  isBase64Encoded: false,
  path: '/test',
  pathParameters: null,
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  stageVariables: null,
  requestContext: {
    accountId: '123456789012',
    apiId: 'test-api-id',
    authorizer: null,
    protocol: 'HTTP/1.1',
    httpMethod: 'GET',
    identity: {
      accessKey: null,
      accountId: null,
      apiKey: null,
      apiKeyId: null,
      caller: null,
      clientCert: null,
      cognitoAuthenticationProvider: null,
      cognitoAuthenticationType: null,
      cognitoIdentityId: null,
      cognitoIdentityPoolId: null,
      principalOrgId: null,
      sourceIp: '127.0.0.1',
      user: null,
      userAgent: 'test-agent',
      userArn: null,
    },
    path: '/test',
    stage: 'test',
    requestId: 'test-request-id',
    requestTimeEpoch: Date.now(),
    resourceId: 'test-resource-id',
    resourcePath: '/test',
  },
  resource: '/test',
  ...overrides,
});

/**
 * Create a mock WebSocket CONNECT event
 * Based on actual AWS API Gateway WebSocket CONNECT event structure
 */
export const mockWebSocketConnectEvent = (overrides?: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent => ({
  headers: {
    Host: 'test-api-id.execute-api.eu-west-3.amazonaws.com',
    'Sec-WebSocket-Version': '13',
    'X-Forwarded-For': '127.0.0.1',
  },
  multiValueHeaders: {
    Host: [ 'test-api-id.execute-api.eu-west-3.amazonaws.com' ],
    'Sec-WebSocket-Version': [ '13' ],
    'X-Forwarded-For': [ '127.0.0.1' ],
  },
  requestContext: {
    routeKey: '$connect',
    eventType: 'CONNECT',
    extendedRequestId: 'test-extended-id',
    requestTime: '16/Dec/2025:09:50:50 +0000',
    messageDirection: 'IN',
    stage: 'test',
    connectedAt: Date.now(),
    requestTimeEpoch: Date.now(),
    identity: {
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/146.0',
      sourceIp: '127.0.0.1',
    },
    requestId: 'test-request-id',
    domainName: 'test-api-id.execute-api.eu-west-3.amazonaws.com',
    connectionId: 'test-connection-id',
    apiId: 'test-api-id',
  } as APIGatewayProxyEvent['requestContext'],
  isBase64Encoded: false,
  ...overrides,
} as APIGatewayProxyEvent);

/**
 * Create a mock WebSocket DISCONNECT event
 * Based on actual AWS API Gateway WebSocket DISCONNECT event structure
 */
export const mockWebSocketDisconnectEvent = (overrides?: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent => ({
  headers: {
    Host: 'test-api-id.execute-api.eu-west-3.amazonaws.com',
    'x-api-key': '',
    'X-Forwarded-For': '',
    'x-restapi': '',
  },
  multiValueHeaders: {
    Host: [ 'test-api-id.execute-api.eu-west-3.amazonaws.com' ],
    'x-api-key': [ '' ],
    'X-Forwarded-For': [ '' ],
    'x-restapi': [ '' ],
  },
  requestContext: {
    routeKey: '$disconnect',
    disconnectStatusCode: 1001,
    eventType: 'DISCONNECT',
    extendedRequestId: 'test-extended-id',
    requestTime: '16/Dec/2025:09:51:24 +0000',
    messageDirection: 'IN',
    disconnectReason: '',
    stage: 'test',
    connectedAt: Date.now() - 30000,
    requestTimeEpoch: Date.now(),
    identity: {
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/146.0',
      sourceIp: '127.0.0.1',
    },
    requestId: 'test-request-id',
    domainName: 'test-api-id.execute-api.eu-west-3.amazonaws.com',
    connectionId: 'test-connection-id',
    apiId: 'test-api-id',
  } as unknown as APIGatewayProxyEvent['requestContext'],
  isBase64Encoded: false,
  ...overrides,
} as APIGatewayProxyEvent);

/**
 * Create a mock WebSocket MESSAGE event with custom body
 * Based on actual AWS API Gateway WebSocket MESSAGE event structure
 */
export const mockWebSocketMessageEvent = (
  bodyOrOptions: Record<string, unknown> | {
    connectionId?: string,
    body?: string,
  }
): APIGatewayProxyEvent => {
  const isOptions = 'connectionId' in bodyOrOptions || 'body' in bodyOrOptions;
  const connectionId = isOptions && 'connectionId' in bodyOrOptions ? bodyOrOptions.connectionId : 'test-connection-id';
  const body = isOptions && 'body' in bodyOrOptions ? bodyOrOptions.body : JSON.stringify(bodyOrOptions);

  return {
    requestContext: {
      routeKey: '$default',
      messageId: 'test-message-id',
      eventType: 'MESSAGE',
      extendedRequestId: 'test-extended-id',
      requestTime: '16/Dec/2025:09:51:47 +0000',
      messageDirection: 'IN',
      stage: 'test',
      connectedAt: Date.now() - 60000,
      requestTimeEpoch: Date.now(),
      identity: {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/146.0',
        sourceIp: '127.0.0.1',
      },
      requestId: 'test-request-id',
      domainName: 'test-api-id.execute-api.eu-west-3.amazonaws.com',
      connectionId,
      apiId: 'test-api-id',
    } as APIGatewayProxyEvent['requestContext'],
    body: body || '{}',
    isBase64Encoded: false,
  } as APIGatewayProxyEvent;
};

/**
 * Create a mock Lambda context object
 */
export const mockContext = (overrides?: Partial<Context>): Context => ({
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'test-function',
  functionVersion: '1',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
  memoryLimitInMB: '128',
  awsRequestId: 'test-request-id',
  logGroupName: '/aws/lambda/test-function',
  logStreamName: '2021/01/01/[$LATEST]test',
  getRemainingTimeInMillis: () => 30000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
  ...overrides,
});

