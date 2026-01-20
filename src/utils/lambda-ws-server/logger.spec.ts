import { wslog, WsLogContext } from './logger';
import { mockWebSocketConnectEvent } from '../../testutils/event-mocks';

describe('wslog', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should log structured JSON with all required fields', () => {
    const event = mockWebSocketConnectEvent();
    event.requestContext.connectionId = 'test-conn-id';
    event.requestContext.eventType = 'CONNECT';
    event.requestContext.routeKey = '$connect';
    event.requestContext.requestId = 'req-123';
    event.requestContext.requestTime = '19/Jan/2026:15:58:25 +0000';
    event.requestContext.identity = {
      ...event.requestContext.identity,
      sourceIp: '192.168.1.1',
      userAgent: 'Mozilla/5.0 Test',
    };

    const ctx: WsLogContext = { event };
    wslog(ctx, 'test message');

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const loggedJson = JSON.parse(consoleLogSpy.mock.calls[0][0]);

    expect(loggedJson).toMatchObject({
      level: 'info',
      msg: 'test message',
      remote_addr: '192.168.1.1',
      connection_id: 'test-conn-id',
      time: '2026-01-19T15:58:25.000Z',
      type: 'ws',
      event_type: 'CONNECT',
      route_key: '$connect',
      user_agent: 'Mozilla/5.0 Test',
      request_id: 'req-123',
    });
  });

  it('should include extra parameters in the log', () => {
    const event = mockWebSocketConnectEvent();
    const ctx: WsLogContext = { event };

    wslog(ctx, 'request complete', {
      resp_status: 200,
      resp_elapsed_ms: 42,
      resp_bytes_length: 100,
      user_id: 'user-123',
    });

    const loggedJson = JSON.parse(consoleLogSpy.mock.calls[0][0]);

    expect(loggedJson.resp_status).toBe(200);
    expect(loggedJson.resp_elapsed_ms).toBe(42);
    expect(loggedJson.resp_bytes_length).toBe(100);
    expect(loggedJson.user_id).toBe('user-123');
  });

  it('should handle undefined extra parameters', () => {
    const event = mockWebSocketConnectEvent();
    const ctx: WsLogContext = { event };

    wslog(ctx, 'test', {
      user_id: undefined,
      resp_error_msg: undefined,
    });

    const loggedJson = JSON.parse(consoleLogSpy.mock.calls[0][0]);

    // undefined values are omitted by JSON.stringify, which is expected behavior
    expect('user_id' in loggedJson).toBe(false);
    expect('resp_error_msg' in loggedJson).toBe(false);
    // But regular fields should still be present
    expect(loggedJson.msg).toBe('test');
    expect(loggedJson.level).toBe('info');
  });

  it('should parse various requestTime formats', () => {
    const event = mockWebSocketConnectEvent();
    const ctx: WsLogContext = { event };

    // Test Dec month
    event.requestContext.requestTime = '25/Dec/2025:10:30:45 +0000';
    wslog(ctx, 'test');

    let loggedJson = JSON.parse(consoleLogSpy.mock.calls[0][0]);
    expect(loggedJson.time).toBe('2025-12-25T10:30:45.000Z');

    // Test undefined requestTime
    consoleLogSpy.mockClear();
    event.requestContext.requestTime = undefined;
    wslog(ctx, 'test');

    loggedJson = JSON.parse(consoleLogSpy.mock.calls[0][0]);
    // Should return current time in ISO format
    expect(loggedJson.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('should handle missing identity fields gracefully', () => {
    const event = mockWebSocketConnectEvent();
    event.requestContext.identity = undefined as any;
    const ctx: WsLogContext = { event };

    wslog(ctx, 'test');

    const loggedJson = JSON.parse(consoleLogSpy.mock.calls[0][0]);
    expect(loggedJson.remote_addr).toBe('');
    expect(loggedJson.user_agent).toBe('');
  });

  it('should handle missing connectionId gracefully', () => {
    const event = mockWebSocketConnectEvent();
    event.requestContext.connectionId = undefined;
    const ctx: WsLogContext = { event };

    wslog(ctx, 'test');

    const loggedJson = JSON.parse(consoleLogSpy.mock.calls[0][0]);
    expect(loggedJson.connection_id).toBe('');
  });

});
