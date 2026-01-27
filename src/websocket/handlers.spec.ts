import { mockWebSocketConnectEvent, mockWebSocketDisconnectEvent } from '../testutils/event-mocks';

// Mock the identity token module
jest.mock('../auth/identity-token', () => ({
  parseIdentityToken: jest.fn(),
}));

// Mock the UserConnections module with singleton
const mockUserConnectionsTable = {
  insert: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue({ userId: 'deleted-user', creationTime: 1234567890 }),
};
jest.mock('../dbmodels/user-connections', () => ({
  UserConnections: jest.fn(),
  userConnectionsTable: mockUserConnectionsTable,
}));

// Mock the ThreadSubscriptions module with singleton
const mockThreadSubscriptionsTable = {
  unsubscribeByKeys: jest.fn().mockResolvedValue(undefined),
};
jest.mock('../dbmodels/forum/thread-subscriptions', () => ({
  ThreadSubscriptions: jest.fn(),
  threadSubscriptionsTable: mockThreadSubscriptionsTable,
}));

import { handleConnect, handleDisconnect } from './handlers';
import { parseIdentityToken } from '../auth/identity-token';
const mockParseIdentityToken = parseIdentityToken as jest.MockedFunction<typeof parseIdentityToken>;

describe('WebSocket Handlers', () => {

  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, BACKEND_PUBLIC_KEY: 'test-public-key' };
    // Reset mock implementations
    mockUserConnectionsTable.delete.mockResolvedValue({ userId: 'deleted-user', creationTime: 1234567890 });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('handleConnect', () => {

    it('should return 401 when token is missing', async () => {
      const event = mockWebSocketConnectEvent();
      event.queryStringParameters = null;

      const result = await handleConnect(event);

      expect(result).toEqual({
        statusCode: 401,
        body: 'Unauthorized: missing token',
      });
      expect(mockParseIdentityToken).not.toHaveBeenCalled();
    });

    it('should return 401 when token validation fails', async () => {
      const event = mockWebSocketConnectEvent();
      event.queryStringParameters = { token: 'invalid-token' };
      mockParseIdentityToken.mockRejectedValue(new Error('JWT verification failed'));

      const result = await handleConnect(event);

      expect(result.statusCode).toBe(401);
      expect(result.body).toContain('Unauthorized');
      expect(result.body).toContain('JWT verification failed');
    });

    it('should return 200 Connected with userId when token is valid', async () => {
      const event = mockWebSocketConnectEvent();
      event.queryStringParameters = { token: 'valid-token' };
      mockParseIdentityToken.mockResolvedValue({ userId: 'user-123', exp: 9999999999 });

      const result = await handleConnect(event);

      expect(result).toEqual({
        statusCode: 200,
        body: 'Connected',
        userId: 'user-123',
      });
    });

    it('should call userConnectionsTable.insert with connectionId and userId', async () => {
      const event = mockWebSocketConnectEvent();
      event.requestContext.connectionId = 'conn-insert-test';
      event.queryStringParameters = { token: 'valid-token' };
      mockParseIdentityToken.mockResolvedValue({ userId: 'user-insert-test', exp: 9999999999 });

      await handleConnect(event);

      expect(mockUserConnectionsTable.insert).toHaveBeenCalledWith('conn-insert-test', 'user-insert-test');
    });

    it('should return 500 when connectionId is missing', async () => {
      const event = mockWebSocketConnectEvent();
      event.requestContext.connectionId = undefined;
      event.queryStringParameters = { token: 'valid-token' };
      mockParseIdentityToken.mockResolvedValue({ userId: 'user-123', exp: 9999999999 });

      const result = await handleConnect(event);

      expect(result.statusCode).toBe(500);
      expect(result.body).toContain('missing connectionId');
    });

    it('should pass token and public key to parseWsToken', async () => {
      const event = mockWebSocketConnectEvent();
      event.queryStringParameters = { token: 'my-token' };
      mockParseIdentityToken.mockResolvedValue({ userId: 'user-456', exp: 9999999999 });

      await handleConnect(event);

      expect(mockParseIdentityToken).toHaveBeenCalledWith('my-token', 'test-public-key');
    });

  });

  describe('handleDisconnect', () => {

    it('should return 200 Disconnected response with userId', async () => {
      const event = mockWebSocketDisconnectEvent();

      const result = await handleDisconnect(event);

      expect(result).toEqual({
        statusCode: 200,
        body: 'Disconnected',
        userId: 'deleted-user',
      });
    });

    it('should call userConnectionsTable.delete with connectionId', async () => {
      const event = mockWebSocketDisconnectEvent();
      event.requestContext.connectionId = 'test-connection-del';

      await handleDisconnect(event);

      expect(mockUserConnectionsTable.delete).toHaveBeenCalledWith('test-connection-del');
    });

    it('should return 500 when connectionId is missing', async () => {
      const event = mockWebSocketDisconnectEvent();
      event.requestContext.connectionId = undefined;

      const result = await handleDisconnect(event);

      expect(result.statusCode).toBe(500);
      expect(result.body).toContain('missing connectionId');
    });

    it('should return undefined userId when connection was not found', async () => {
      // Override the mock to return null for this test
      mockUserConnectionsTable.delete.mockResolvedValueOnce(null);

      const event = mockWebSocketDisconnectEvent();
      const result = await handleDisconnect(event);

      expect(result).toEqual({
        statusCode: 200,
        body: 'Disconnected',
        userId: undefined,
      });
    });

    it('should unsubscribe from thread when connection has subscriptionKeys', async () => {
      // Override the mock to return a connection with subscriptionKeys
      const subscriptionKeys = { pk: 'dev#THREAD#participant123#item456#SUB', sk: 1234567890 };
      mockUserConnectionsTable.delete.mockResolvedValueOnce({
        userId: 'user-with-sub',
        creationTime: 1234567890,
        subscriptionKeys,
      });

      const event = mockWebSocketDisconnectEvent();
      event.requestContext.connectionId = 'conn-with-sub';

      await handleDisconnect(event);

      expect(mockThreadSubscriptionsTable.unsubscribeByKeys).toHaveBeenCalledWith(subscriptionKeys);
    });

    it('should not call unsubscribe when connection has no subscriptionKeys', async () => {
      // Default mock returns no subscriptionKeys
      const event = mockWebSocketDisconnectEvent();

      await handleDisconnect(event);

      // threadSubscriptionsTable.unsubscribeByKeys should not be called when there's no subscription
      expect(mockThreadSubscriptionsTable.unsubscribeByKeys).not.toHaveBeenCalled();
    });

  });

});
