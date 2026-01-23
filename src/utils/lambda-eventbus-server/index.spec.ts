import { EventBridgeEvent, Context } from 'aws-lambda';
import { EventBusServer, EventEnvelope } from './index';

function createMockEnvelope(payload: unknown = { foo: 'bar' }, version = '1.0'): EventEnvelope {
  return {
    version,
    type: 'test_event',
    source_app: 'test_app',
    instance: 'test',
    time: '2026-01-23T10:00:00Z',
    request_id: 'test-request-123',
    payload,
  };
}

function createMockEvent(detailType: string, detail: unknown = createMockEnvelope()): EventBridgeEvent<string, unknown> {
  return {
    'version': '0',
    'id': 'test-event-id',
    'detail-type': detailType,
    'source': 'test.source',
    'account': '123456789',
    'time': '2026-01-23T10:00:00Z',
    'region': 'eu-west-3',
    'resources': [],
    'detail': detail,
  };
}

const mockContext: Context = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'test',
  functionVersion: '1',
  invokedFunctionArn: 'arn:aws:lambda:eu-west-3:123456789:function:test',
  memoryLimitInMB: '128',
  awsRequestId: 'test-request-id',
  logGroupName: '/aws/lambda/test',
  logStreamName: 'test-stream',
  getRemainingTimeInMillis: () => 30000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
};

describe('EventBusServer', () => {
  let server: EventBusServer;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    server = new EventBusServer();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('on()', () => {
    it('should register a handler for a detail-type', () => {
      const handler = jest.fn();
      server.on('test_event', handler, { supportedMajorVersion: 1 });

      const registered = server.handlers.get('test_event') ?? [];
      expect(registered).toHaveLength(1);
      expect(registered[0]?.handler).toBe(handler);
      expect(registered[0]?.options.supportedMajorVersion).toBe(1);
    });

    it('should allow multiple handlers for the same detail-type', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      server.on('test_event', handler1, { supportedMajorVersion: 1 });
      server.on('test_event', handler2, { supportedMajorVersion: 2 });

      const registered = server.handlers.get('test_event') ?? [];
      expect(registered).toHaveLength(2);
    });
  });

  describe('register()', () => {
    it('should register handlers from a sub-module', () => {
      const handler = jest.fn();
      const subHandlers = (eb: EventBusServer): void => {
        eb.on('sub_event', handler, { supportedMajorVersion: 1 });
      };

      server.register(subHandlers);

      const registered = server.handlers.get('sub_event') ?? [];
      expect(registered).toHaveLength(1);
      expect(registered[0]?.handler).toBe(handler);
    });
  });

  describe('handler()', () => {
    it('should call the registered handler with the full envelope', async () => {
      const handler = jest.fn();
      server.on('test_event', handler, { supportedMajorVersion: 1 });

      const payload = { foo: 'bar' };
      const envelope = createMockEnvelope(payload);
      const event = createMockEvent('test_event', envelope);
      await server.handler(event, mockContext);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          version: '1.0',
          type: 'test_event',
          source_app: 'test_app',
          instance: 'test',
          request_id: 'test-request-123',
          payload,
        })
      );
    });

    it('should call all registered handlers for the same detail-type in parallel', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      server.on('test_event', handler1, { supportedMajorVersion: 1 });
      server.on('test_event', handler2, { supportedMajorVersion: 1 });

      const event = createMockEvent('test_event');
      await server.handler(event, mockContext);

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should not throw if no handlers are registered for the detail-type', async () => {
      const event = createMockEvent('unknown_event');

      await expect(server.handler(event, mockContext)).resolves.toBeUndefined();
    });

    it('should continue executing other handlers if one throws', async () => {
      const handler1 = jest.fn().mockRejectedValue(new Error('Handler 1 failed'));
      const handler2 = jest.fn().mockResolvedValue(undefined);

      server.on('test_event', handler1, { supportedMajorVersion: 1 });
      server.on('test_event', handler2, { supportedMajorVersion: 1 });

      const event = createMockEvent('test_event');
      await server.handler(event, mockContext);

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should log event received and processing complete', async () => {
      server.on('test_event', jest.fn(), { supportedMajorVersion: 1 });

      const event = createMockEvent('test_event');
      await server.handler(event, mockContext);

      const calls = consoleLogSpy.mock.calls.map(call => JSON.parse(call[0]));

      const receivedLog = calls.find(log => log.msg === 'event received');
      expect(receivedLog).toBeDefined();
      expect(receivedLog.detail_type).toBe('test_event');

      const completeLog = calls.find(log => log.msg === 'event processing complete');
      expect(completeLog).toBeDefined();
      expect(completeLog.handlers_count).toBe(1);
    });

    it('should log error if envelope parsing fails', async () => {
      server.on('test_event', jest.fn(), { supportedMajorVersion: 1 });

      const event = createMockEvent('test_event', { invalid: 'envelope' });
      await server.handler(event, mockContext);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Event envelope parse error:',
        expect.any(String)
      );
    });
  });

  describe('version validation', () => {
    it('should call handler when event version equals supported version', async () => {
      const handler = jest.fn();
      server.on('test_event', handler, { supportedMajorVersion: 1 });

      const event = createMockEvent('test_event', createMockEnvelope({ foo: 'bar' }, '1.0'));
      await server.handler(event, mockContext);

      expect(handler).toHaveBeenCalled();
    });

    it('should call handler when event version is lower than supported', async () => {
      const handler = jest.fn();
      server.on('test_event', handler, { supportedMajorVersion: 2 });

      const event = createMockEvent('test_event', createMockEnvelope({ foo: 'bar' }, '1.5'));
      await server.handler(event, mockContext);

      expect(handler).toHaveBeenCalled();
    });

    it('should skip handler when event major version is higher than supported', async () => {
      const handler = jest.fn();
      server.on('test_event', handler, { supportedMajorVersion: 1 });

      const event = createMockEvent('test_event', createMockEnvelope({ foo: 'bar' }, '2.0'));
      await server.handler(event, mockContext);

      expect(handler).not.toHaveBeenCalled();

      const calls = consoleLogSpy.mock.calls.map(call => JSON.parse(call[0]));
      const skipLog = calls.find(log => log.msg === 'handler skipped due to unsupported version');
      expect(skipLog).toBeDefined();
      expect(skipLog.event_version).toBe('2.0');
      expect(skipLog.supported_major).toBe(1);
    });

    it('should call some handlers and skip others based on their version requirements', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      server.on('test_event', handler1, { supportedMajorVersion: 1 });
      server.on('test_event', handler2, { supportedMajorVersion: 2 });

      const event = createMockEvent('test_event', createMockEnvelope({ foo: 'bar' }, '2.0'));
      await server.handler(event, mockContext);

      expect(handler1).not.toHaveBeenCalled(); // supports only v1
      expect(handler2).toHaveBeenCalled(); // supports up to v2
    });
  });
});
