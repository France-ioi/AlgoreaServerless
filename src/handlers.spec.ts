// Set up environment variables before any imports
process.env.APIGW_ENDPOINT = 'http://localhost:3001';
process.env.TABLE_NAME = 'test-table';
process.env.STAGE = 'test';

import { globalHandler } from './handlers';
import {
  mockALBEvent,
  mockAPIGatewayProxyEvent,
  mockWebSocketConnectEvent,
  mockWebSocketDisconnectEvent,
  mockWebSocketMessageEvent,
  mockContext,
} from './testutils/event-mocks';

// Mock the lambda-api module
jest.mock('lambda-api', () => {
  const mockAPI = {
    use: jest.fn(),
    options: jest.fn(),
    register: jest.fn(),
    run: jest.fn().mockResolvedValue({ statusCode: 200, body: 'REST API response' }),
  };
  return jest.fn(() => mockAPI);
});

// Mock the WebSocket server module
jest.mock('./utils/lambda-ws-server', () => {
  const mockWsServer = {
    register: jest.fn(),
    on: jest.fn(),
    onConnect: jest.fn(),
    onDisconnect: jest.fn(),
    handler: jest.fn().mockResolvedValue({ statusCode: 200, body: 'WS response' }),
  };
  return jest.fn(() => mockWsServer);
});

// Mock the websocket handlers
jest.mock('./websocket/handlers', () => ({
  handleConnect: jest.fn(),
  handleDisconnect: jest.fn(),
}));

// Import mocked modules
import createAPI from 'lambda-api';
import createWsServer from './utils/lambda-ws-server';
import { handleConnect, handleDisconnect } from './websocket/handlers';

describe('Global Handler', () => {

  let mockApi: any;
  let mockWsServer: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApi = (createAPI as jest.Mock)();
    mockWsServer = (createWsServer as jest.Mock)();
  });

  describe('HTTP Request Routing', () => {

    it('should route ALB events with httpMethod to REST API', async () => {
      const event = mockALBEvent({ httpMethod: 'GET', path: '/test' });
      const context = mockContext();

      const result = await globalHandler(event, context);

      expect(mockApi.run).toHaveBeenCalledWith(event, context);
      expect(mockWsServer.handler).not.toHaveBeenCalled();
      expect(result).toEqual({ statusCode: 200, body: 'REST API response' });
    });

    it('should route POST requests to REST API', async () => {
      const event = mockALBEvent({ httpMethod: 'POST', path: '/forum/message' });
      const context = mockContext();

      const result = await globalHandler(event, context);

      expect(mockApi.run).toHaveBeenCalledWith(event, context);
      expect(result).toEqual({ statusCode: 200, body: 'REST API response' });
    });

    it('should route API Gateway Proxy events with httpMethod to REST API', async () => {
      const event = mockAPIGatewayProxyEvent({ httpMethod: 'GET', path: '/test' });
      const context = mockContext();

      const result = await globalHandler(event, context);

      expect(mockApi.run).toHaveBeenCalledWith(event, context);
      expect(mockWsServer.handler).not.toHaveBeenCalled();
    });

  });

  describe('WebSocket Request Routing', () => {

    it('should route WebSocket CONNECT events to WS server', async () => {
      const event = mockWebSocketConnectEvent();
      const context = mockContext();

      const result = await globalHandler(event, context);

      expect(mockWsServer.handler).toHaveBeenCalledWith(event, context);
      expect(mockApi.run).not.toHaveBeenCalled();
      expect(result).toEqual({ statusCode: 200, body: 'WS response' });
    });

    it('should route WebSocket DISCONNECT events to WS server', async () => {
      const event = mockWebSocketDisconnectEvent();
      const context = mockContext();

      const result = await globalHandler(event, context);

      expect(mockWsServer.handler).toHaveBeenCalledWith(event, context);
      expect(mockApi.run).not.toHaveBeenCalled();
    });

    it('should route WebSocket MESSAGE events to WS server', async () => {
      const event = mockWebSocketMessageEvent({ action: 'test.action' });
      const context = mockContext();

      const result = await globalHandler(event, context);

      expect(mockWsServer.handler).toHaveBeenCalledWith(event, context);
      expect(mockApi.run).not.toHaveBeenCalled();
    });

  });

  describe('Error Handling', () => {

    it('should throw error for unsupported event types', async () => {
      const event = {
        requestContext: {},
      } as any;
      const context = mockContext();

      await expect(globalHandler(event, context)).rejects.toThrow('event not supported');
    });

    it('should throw error when neither httpMethod nor eventType present', async () => {
      const event = {
        requestContext: {
          accountId: '123',
        },
      } as any;
      const context = mockContext();

      await expect(globalHandler(event, context)).rejects.toThrow('event not supported');
    });

  });

  describe('Event Type Detection', () => {

    it('should detect HTTP event by httpMethod property', async () => {
      const event = {
        httpMethod: 'PUT',
        requestContext: { elb: {} },
      } as any;
      const context = mockContext();

      await globalHandler(event, context);

      expect(mockApi.run).toHaveBeenCalled();
      expect(mockWsServer.handler).not.toHaveBeenCalled();
    });

    it('should detect WebSocket event by eventType in requestContext', async () => {
      const event = {
        requestContext: {
          eventType: 'MESSAGE',
          connectionId: 'test-id',
        },
        body: JSON.stringify({ action: 'test' }),
      } as any;
      const context = mockContext();

      await globalHandler(event, context);

      expect(mockWsServer.handler).toHaveBeenCalled();
      expect(mockApi.run).not.toHaveBeenCalled();
    });

  });

  describe('Context Propagation', () => {

    it('should pass context to REST API handler', async () => {
      const event = mockALBEvent();
      const context = mockContext({
        functionName: 'test-function',
        awsRequestId: 'test-request-123',
      });

      await globalHandler(event, context);

      expect(mockApi.run).toHaveBeenCalledWith(event, context);
    });

    it('should pass context to WebSocket handler', async () => {
      const event = mockWebSocketMessageEvent({ action: 'test' });
      const context = mockContext({
        functionName: 'test-ws-function',
        awsRequestId: 'ws-request-456',
      });

      await globalHandler(event, context);

      expect(mockWsServer.handler).toHaveBeenCalledWith(event, context);
    });

  });

});


