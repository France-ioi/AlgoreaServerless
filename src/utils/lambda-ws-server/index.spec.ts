import { WsServer } from './index';
import { RouteNotFound } from '../errors';
import {
  mockWebSocketConnectEvent,
  mockWebSocketDisconnectEvent,
  mockWebSocketMessageEvent,
  mockContext,
} from '../../testutils/event-mocks';

describe('WebSocket Server', () => {

  describe('Action Registration', () => {

    it('should register actions with on()', () => {
      const wsServer = new WsServer();
      const handler = jest.fn();

      wsServer.on('test.action', handler);

      expect(wsServer.actions['test.action']).toBe(handler);
    });

    it('should register multiple actions', () => {
      const wsServer = new WsServer();
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      wsServer.on('action1', handler1);
      wsServer.on('action2', handler2);

      expect(wsServer.actions['action1']).toBe(handler1);
      expect(wsServer.actions['action2']).toBe(handler2);
    });

    it('should apply prefix with register()', () => {
      const wsServer = new WsServer();
      const handler = jest.fn();

      wsServer.register((ws) => {
        ws.on('subscribe', handler);
      }, { prefix: 'forum' });

      expect(wsServer.actions['forum.subscribe']).toBe(handler);
    });

    it('should handle nested registrations with prefix', () => {
      const wsServer = new WsServer();
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      wsServer.register((ws) => {
        ws.on('subscribe', handler1);
        ws.on('unsubscribe', handler2);
      }, { prefix: 'forum' });

      expect(wsServer.actions['forum.subscribe']).toBe(handler1);
      expect(wsServer.actions['forum.unsubscribe']).toBe(handler2);
    });

    it('should work without prefix option', () => {
      const wsServer = new WsServer();
      const handler = jest.fn();

      wsServer.register((ws) => {
        ws.on('heartbeat', handler);
      });

      expect(wsServer.actions['heartbeat']).toBe(handler);
    });

  });

  describe('Event Handling', () => {

    it('should return 200 OK for CONNECT events', async () => {
      const wsServer = new WsServer();
      const event = mockWebSocketConnectEvent();
      const context = mockContext();

      const result = await wsServer.handler(event, context);

      expect(result).toEqual({
        statusCode: 200,
        body: 'ok',
      });
    });

    it('should return 200 OK for DISCONNECT events', async () => {
      const wsServer = new WsServer();
      const event = mockWebSocketDisconnectEvent();
      const context = mockContext();

      const result = await wsServer.handler(event, context);

      expect(result).toEqual({
        statusCode: 200,
        body: 'ok',
      });
    });

    it('should route MESSAGE events to correct action handler', async () => {
      const wsServer = new WsServer();
      const handler = jest.fn();
      wsServer.on('test.action', handler);

      const event = mockWebSocketMessageEvent({ action: 'test.action' });
      const context = mockContext();

      const result = await wsServer.handler(event, context);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        body: expect.objectContaining({ action: 'test.action' }),
      }));
      expect(result).toEqual({
        statusCode: 200,
        body: 'ok',
      });
    });

    it('should handle async action handlers', async () => {
      const wsServer = new WsServer();
      const handler = jest.fn().mockResolvedValue(undefined);
      wsServer.on('async.action', handler);

      const event = mockWebSocketMessageEvent({ action: 'async.action', data: 'test' });
      const context = mockContext();

      const result = await wsServer.handler(event, context);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        statusCode: 200,
        body: 'ok',
      });
    });

    it('should return 500 for unknown event types', async () => {
      const wsServer = new WsServer();
      const event = mockWebSocketConnectEvent();
      event.requestContext.eventType = 'UNKNOWN' as any;
      const context = mockContext();

      const result = await wsServer.handler(event, context);

      expect(result).toEqual({
        statusCode: 500,
        body: 'event type non supported: UNKNOWN',
      });
    });

  });

  describe('Error Handling', () => {

    it('should return 500 when action not found', async () => {
      const wsServer = new WsServer();
      const event = mockWebSocketMessageEvent({ action: 'nonexistent.action' });
      const context = mockContext();

      const result = await wsServer.handler(event, context);

      expect(result.statusCode).toBe(500);
      expect(result.body).toContain('error:');
      expect(result.body).toContain('action not found');
      expect(result.body).toContain('nonexistent.action');
    });

    it('should catch handler errors and return 500', async () => {
      const wsServer = new WsServer();
      const handler = jest.fn().mockRejectedValue(new Error('Handler failed'));
      wsServer.on('failing.action', handler);

      const event = mockWebSocketMessageEvent({ action: 'failing.action' });
      const context = mockContext();

      const result = await wsServer.handler(event, context);

      expect(result.statusCode).toBe(500);
      expect(result.body).toContain('error:');
      expect(result.body).toContain('Handler failed');
    });

    it('should catch synchronous handler errors', async () => {
      const wsServer = new WsServer();
      const handler = jest.fn().mockImplementation(() => {
        throw new Error('Sync error');
      });
      wsServer.on('sync.error', handler);

      const event = mockWebSocketMessageEvent({ action: 'sync.error' });
      const context = mockContext();

      const result = await wsServer.handler(event, context);

      expect(result.statusCode).toBe(500);
      expect(result.body).toContain('error:');
      expect(result.body).toContain('Sync error');
    });

    it('should include RouteNotFound error in response body', async () => {
      const wsServer = new WsServer();
      const event = mockWebSocketMessageEvent({ action: 'missing.action' });
      const context = mockContext();

      const result = await wsServer.handler(event, context);

      expect(result.statusCode).toBe(500);
      expect(result.body).toContain('error:');
      expect(result.body).toContain('action not found');
    });

  });

  describe('Integration', () => {

    it('should handle complete workflow with prefixed actions', async () => {
      const wsServer = new WsServer();
      const subscribeHandler = jest.fn();
      const unsubscribeHandler = jest.fn();
      const heartbeatHandler = jest.fn();

      wsServer.register((ws) => {
        ws.on('subscribe', subscribeHandler);
        ws.on('unsubscribe', unsubscribeHandler);
      }, { prefix: 'forum' });

      wsServer.on('heartbeat', heartbeatHandler);

      // Test forum.subscribe
      let event = mockWebSocketMessageEvent({ action: 'forum.subscribe' });
      let result = await wsServer.handler(event, mockContext());
      expect(result.statusCode).toBe(200);
      expect(subscribeHandler).toHaveBeenCalledTimes(1);

      // Test forum.unsubscribe
      event = mockWebSocketMessageEvent({ action: 'forum.unsubscribe' });
      result = await wsServer.handler(event, mockContext());
      expect(result.statusCode).toBe(200);
      expect(unsubscribeHandler).toHaveBeenCalledTimes(1);

      // Test heartbeat
      event = mockWebSocketMessageEvent({ action: 'heartbeat' });
      result = await wsServer.handler(event, mockContext());
      expect(result.statusCode).toBe(200);
      expect(heartbeatHandler).toHaveBeenCalledTimes(1);
    });

  });

});

