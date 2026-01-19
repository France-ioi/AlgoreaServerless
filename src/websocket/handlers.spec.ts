import { handleConnect, handleDisconnect } from './handlers';
import { mockWebSocketConnectEvent, mockWebSocketDisconnectEvent } from '../testutils/event-mocks';

describe('WebSocket Handlers', () => {

  // Spy on console.log to verify logging behavior
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('handleConnect', () => {

    it('should return 200 Connected response', () => {
      const event = mockWebSocketConnectEvent();

      const result = handleConnect(event);

      expect(result).toEqual({
        statusCode: 200,
        body: 'Connected',
      });
    });

    it('should log connection details', () => {
      const event = mockWebSocketConnectEvent();
      event.requestContext.connectionId = 'test-connection-123';
      event.requestContext.identity = { ...event.requestContext.identity, sourceIp: '192.168.1.1' };
      event.requestContext.connectedAt = 1234567890;
      event.queryStringParameters = { token: 'test-token' };

      handleConnect(event);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'WebSocket connection established',
        expect.objectContaining({
          connectionId: 'test-connection-123',
          sourceIp: '192.168.1.1',
          connectedAt: 1234567890,
          hasToken: true,
        })
      );
    });

    it('should handle missing token', () => {
      const event = mockWebSocketConnectEvent();
      event.requestContext.connectionId = 'test-connection-456';
      event.queryStringParameters = null;

      handleConnect(event);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'WebSocket connection established',
        expect.objectContaining({
          connectionId: 'test-connection-456',
          hasToken: false,
        })
      );
    });

    it('should handle missing identity', () => {
      const event = mockWebSocketConnectEvent();
      event.requestContext.identity = undefined as any;

      const result = handleConnect(event);

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
