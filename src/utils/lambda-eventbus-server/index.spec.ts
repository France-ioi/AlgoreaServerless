import { EventBridgeEvent, Context } from 'aws-lambda';
import { EventBusServer } from './index';

function createMockEvent(detailType: string, detail: unknown = {}): EventBridgeEvent<string, unknown> {
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

  beforeEach(() => {
    server = new EventBusServer();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('on()', () => {
    it('should register a handler for a detail-type', () => {
      const handler = jest.fn();
      server.on('test_event', handler);

      expect(server.handlers.get('test_event')).toContain(handler);
    });

    it('should allow multiple handlers for the same detail-type', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      server.on('test_event', handler1);
      server.on('test_event', handler2);

      const handlers = server.handlers.get('test_event');
      expect(handlers).toHaveLength(2);
      expect(handlers).toContain(handler1);
      expect(handlers).toContain(handler2);
    });
  });

  describe('register()', () => {
    it('should register handlers from a sub-module', () => {
      const handler = jest.fn();
      const subHandlers = (eb: EventBusServer): void => {
        eb.on('sub_event', handler);
      };

      server.register(subHandlers);

      expect(server.handlers.get('sub_event')).toContain(handler);
    });
  });

  describe('handler()', () => {
    it('should call the registered handler for matching detail-type', async () => {
      const handler = jest.fn();
      server.on('test_event', handler);

      const event = createMockEvent('test_event', { foo: 'bar' });
      await server.handler(event, mockContext);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should call all registered handlers for the same detail-type in parallel', async () => {
      const callOrder: number[] = [];
      const handler1 = jest.fn().mockImplementation(() => {
        callOrder.push(1);
      });
      const handler2 = jest.fn().mockImplementation(() => {
        callOrder.push(2);
      });

      server.on('test_event', handler1);
      server.on('test_event', handler2);

      const event = createMockEvent('test_event');
      await server.handler(event, mockContext);

      expect(handler1).toHaveBeenCalledWith(event);
      expect(handler2).toHaveBeenCalledWith(event);
    });

    it('should not throw if no handlers are registered for the detail-type', async () => {
      const event = createMockEvent('unknown_event');

      await expect(server.handler(event, mockContext)).resolves.toBeUndefined();
    });

    it('should continue executing other handlers if one throws', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const handler1 = jest.fn().mockRejectedValue(new Error('Handler 1 failed'));
      const handler2 = jest.fn().mockResolvedValue(undefined);

      server.on('test_event', handler1);
      server.on('test_event', handler2);

      const event = createMockEvent('test_event');
      await server.handler(event, mockContext);

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should log event received and processing complete', async () => {
      const event = createMockEvent('test_event');
      server.on('test_event', jest.fn());

      await server.handler(event, mockContext);

      // Check that structured logs were output
      expect(consoleLogSpy).toHaveBeenCalled();
      const calls = consoleLogSpy.mock.calls.map(call => JSON.parse(call[0]));

      const receivedLog = calls.find(log => log.msg === 'event received');
      expect(receivedLog).toBeDefined();
      expect(receivedLog.detail_type).toBe('test_event');

      const completeLog = calls.find(log => log.msg === 'event processing complete');
      expect(completeLog).toBeDefined();
      expect(completeLog.handlers_count).toBe(1);
    });
  });
});
