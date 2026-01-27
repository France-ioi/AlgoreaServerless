import { handleConnect, handleDisconnect } from './handlers';
import { mockWebSocketConnectEvent, mockWebSocketDisconnectEvent } from '../testutils/event-mocks';

// Mock the identity token module
jest.mock('../auth/identity-token', () => ({
  parseIdentityToken: jest.fn(),
}));

// Mock the UserConnections module
jest.mock('../dbmodels/user-connections', () => ({
  UserConnections: jest.fn().mockImplementation(() => ({
    insert: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue({ userId: 'deleted-user', creationTime: 1234567890 }),
  })),
}));

// Mock the ThreadSubscriptions module
jest.mock('../dbmodels/forum/thread-subscriptions', () => ({
  ThreadSubscriptions: jest.fn().mockImplementation(() => ({
    unsubscribeByKeys: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { parseIdentityToken } from '../auth/identity-token';
import { UserConnections } from '../dbmodels/user-connections';
import { ThreadSubscriptions } from '../dbmodels/forum/thread-subscriptions';
const mockParseIdentityToken = parseIdentityToken as jest.MockedFunction<typeof parseIdentityToken>;
const MockUserConnections = UserConnections as jest.MockedClass<typeof UserConnections>;
const MockThreadSubscriptions = ThreadSubscriptions as jest.MockedClass<typeof ThreadSubscriptions>;

describe('WebSocket Handlers', () => {

  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, BACKEND_PUBLIC_KEY: 'test-public-key' };
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

    it('should call UserConnections.insert with connectionId and userId', async () => {
      const event = mockWebSocketConnectEvent();
      event.requestContext.connectionId = 'conn-insert-test';
      event.queryStringParameters = { token: 'valid-token' };
      mockParseIdentityToken.mockResolvedValue({ userId: 'user-insert-test', exp: 9999999999 });

      await handleConnect(event);

      const mockInstance = MockUserConnections.mock.results[0]?.value;
      expect(mockInstance.insert).toHaveBeenCalledWith('conn-insert-test', 'user-insert-test');
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

    it('should call UserConnections.delete with connectionId', async () => {
      const event = mockWebSocketDisconnectEvent();
      event.requestContext.connectionId = 'test-connection-del';

      await handleDisconnect(event);

      const mockInstance = MockUserConnections.mock.results[0]?.value;
      expect(mockInstance.delete).toHaveBeenCalledWith('test-connection-del');
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
      MockUserConnections.mockImplementationOnce(() => ({
        insert: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(null),
      }) as unknown as UserConnections);

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
      MockUserConnections.mockImplementationOnce(() => ({
        insert: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue({
          userId: 'user-with-sub',
          creationTime: 1234567890,
          subscriptionKeys,
        }),
      }) as unknown as UserConnections);

      const event = mockWebSocketDisconnectEvent();
      event.requestContext.connectionId = 'conn-with-sub';

      await handleDisconnect(event);

      const mockThreadSubsInstance = MockThreadSubscriptions.mock.results[0]?.value;
      expect(mockThreadSubsInstance.unsubscribeByKeys).toHaveBeenCalledWith(subscriptionKeys);
    });

    it('should not call unsubscribe when connection has no subscriptionKeys', async () => {
      // Default mock returns no subscriptionKeys
      const event = mockWebSocketDisconnectEvent();

      await handleDisconnect(event);

      // ThreadSubscriptions.unsubscribeByKeys should not be called when there's no subscription
      const mockThreadSubsInstance = MockThreadSubscriptions.mock.results[0]?.value;
      expect(mockThreadSubsInstance.unsubscribeByKeys).not.toHaveBeenCalled();
    });

  });

});
