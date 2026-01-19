import { handleConnect, handleDisconnect } from './handlers';
import { mockWebSocketConnectEvent, mockWebSocketDisconnectEvent } from '../testutils/event-mocks';

// Mock the token module
jest.mock('./token', () => ({
  parseWsToken: jest.fn(),
}));

import { parseWsToken } from './token';
const mockParseWsToken = parseWsToken as jest.MockedFunction<typeof parseWsToken>;

describe('WebSocket Handlers', () => {

  // Spy on console.log to verify logging behavior
  let consoleLogSpy: jest.SpyInstance;
  const originalEnv = process.env;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.clearAllMocks();
    process.env = { ...originalEnv, BACKEND_PUBLIC_KEY: 'test-public-key' };
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
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
      expect(mockParseWsToken).not.toHaveBeenCalled();
    });

    it('should return 401 when token validation fails', async () => {
      const event = mockWebSocketConnectEvent();
      event.queryStringParameters = { token: 'invalid-token' };
      mockParseWsToken.mockRejectedValue(new Error('JWT verification failed'));

      const result = await handleConnect(event);

      expect(result.statusCode).toBe(401);
      expect(result.body).toContain('Unauthorized');
      expect(result.body).toContain('JWT verification failed');
    });

    it('should return 200 Connected when token is valid', async () => {
      const event = mockWebSocketConnectEvent();
      event.queryStringParameters = { token: 'valid-token' };
      mockParseWsToken.mockResolvedValue({ userId: 'user-123', exp: 9999999999 });

      const result = await handleConnect(event);

      expect(result).toEqual({
        statusCode: 200,
        body: 'Connected',
      });
    });

    it('should pass token and public key to parseWsToken', async () => {
      const event = mockWebSocketConnectEvent();
      event.queryStringParameters = { token: 'my-token' };
      mockParseWsToken.mockResolvedValue({ userId: 'user-456', exp: 9999999999 });

      await handleConnect(event);

      expect(mockParseWsToken).toHaveBeenCalledWith('my-token', 'test-public-key');
    });

    it('should log connection details with userId', async () => {
      const event = mockWebSocketConnectEvent();
      event.requestContext.connectionId = 'test-connection-123';
      event.requestContext.identity = { ...event.requestContext.identity, sourceIp: '192.168.1.1' };
      event.requestContext.connectedAt = 1234567890;
      event.queryStringParameters = { token: 'valid-token' };
      mockParseWsToken.mockResolvedValue({ userId: 'user-789', exp: 9999999999 });

      await handleConnect(event);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'WebSocket connection established',
        expect.objectContaining({
          connectionId: 'test-connection-123',
          sourceIp: '192.168.1.1',
          connectedAt: 1234567890,
          userId: 'user-789',
        })
      );
    });

    it('should handle missing identity', async () => {
      const event = mockWebSocketConnectEvent();
      event.queryStringParameters = { token: 'valid-token' };
      event.requestContext.identity = undefined as any;
      mockParseWsToken.mockResolvedValue({ userId: 'user-123', exp: 9999999999 });

      const result = await handleConnect(event);

      expect(result.statusCode).toBe(200);
      expect(consoleLogSpy).toHaveBeenCalled();
    });

  });

  describe('handleDisconnect', () => {

    it('should return 200 Disconnected response', () => {
      const event = mockWebSocketDisconnectEvent();

      const result = handleDisconnect(event);

      expect(result).toEqual({
        statusCode: 200,
        body: 'Disconnected',
      });
    });

    it('should log disconnection details', () => {
      const event = mockWebSocketDisconnectEvent();
      event.requestContext.connectionId = 'test-connection-789';

      handleDisconnect(event);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'WebSocket connection closed',
        expect.objectContaining({
          connectionId: 'test-connection-789',
        })
      );
    });

    it('should handle disconnection with various connection IDs', () => {
      const connectionIds = [ 'conn-1', 'conn-2', 'conn-3' ];

      for (const connectionId of connectionIds) {
        consoleLogSpy.mockClear();
        const event = mockWebSocketDisconnectEvent();
        event.requestContext.connectionId = connectionId;

        const result = handleDisconnect(event);

        expect(result.statusCode).toBe(200);
        expect(consoleLogSpy).toHaveBeenCalledWith(
          'WebSocket connection closed',
          expect.objectContaining({
            connectionId,
          })
        );
      }
    });

  });

});
