import { Request } from './request';
import { DecodingError } from '../errors';
import { mockWebSocketMessageEvent } from '../../testutils/event-mocks';

describe('WebSocket Request Parser', () => {

  describe('Body Parsing', () => {

    it('should parse valid JSON body with action field', () => {
      const body = { action: 'test.action', data: 'test-data' };
      const event = mockWebSocketMessageEvent(body);
      const request = new Request(event);

      expect(request.body).toEqual(body);
      expect(request.action()).toBe('test.action');
    });

    it('should throw DecodingError for undefined body', () => {
      const event = mockWebSocketMessageEvent({});
      event.body = undefined as any;

      expect(() => new Request(event)).toThrow(DecodingError);
      expect(() => new Request(event)).toThrow('undefined and empty body in the event');
    });

    it('should throw DecodingError for null body', () => {
      const event = mockWebSocketMessageEvent({});
      event.body = null as any;

      expect(() => new Request(event)).toThrow(DecodingError);
      expect(() => new Request(event)).toThrow('undefined and empty body in the event');
    });

    it('should throw DecodingError for invalid JSON', () => {
      const event = mockWebSocketMessageEvent({});
      event.body = 'invalid json {';

      expect(() => new Request(event)).toThrow(DecodingError);
      expect(() => new Request(event)).toThrow('the body is not valid JSON');
    });

    it('should throw DecodingError for objects without action field', () => {
      const event = mockWebSocketMessageEvent({});
      event.body = JSON.stringify({ data: 'test' });

      expect(() => new Request(event)).toThrow(DecodingError);
      expect(() => new Request(event)).toThrow('the body is not an object with an action');
    });

    it('should throw DecodingError for non-object JSON', () => {
      const event = mockWebSocketMessageEvent({});
      event.body = JSON.stringify('just a string');

      expect(() => new Request(event)).toThrow(DecodingError);
      expect(() => new Request(event)).toThrow('the body is not an object with an action');
    });

    it('should throw DecodingError for array JSON', () => {
      const event = mockWebSocketMessageEvent({});
      event.body = JSON.stringify([ 'array', 'values' ]);

      expect(() => new Request(event)).toThrow(DecodingError);
      expect(() => new Request(event)).toThrow('the body is not an object with an action');
    });

  });

  describe('Methods', () => {

    it('should return correct action string', () => {
      const body = { action: 'forum.subscribe', token: 'test-token' };
      const event = mockWebSocketMessageEvent(body);
      const request = new Request(event);

      expect(request.action()).toBe('forum.subscribe');
    });

    it('should extract connectionId from requestContext', () => {
      const body = { action: 'test.action' };
      const event = mockWebSocketMessageEvent(body);
      event.requestContext.connectionId = 'my-connection-id';

      const request = new Request(event);

      expect(request.connectionId()).toBe('my-connection-id');
    });

    it('should throw DecodingError if connectionId is missing', () => {
      const body = { action: 'test.action' };
      const event = mockWebSocketMessageEvent(body);
      delete event.requestContext.connectionId;

      const request = new Request(event);

      expect(() => request.connectionId()).toThrow(DecodingError);
      expect(() => request.connectionId()).toThrow('A WS message is expected to always have a connection id!');
    });

    it('should return correct requestId', () => {
      const body = { action: 'test.action' };
      const event = mockWebSocketMessageEvent(body);
      event.requestContext.requestId = 'test-request-id-123';

      const request = new Request(event);

      expect(request.requestId()).toBe('test-request-id-123');
    });

    it('should return correct requestTimeEpoch', () => {
      const body = { action: 'test.action' };
      const event = mockWebSocketMessageEvent(body);
      const timestamp = 1234567890123;
      event.requestContext.requestTimeEpoch = timestamp;

      const request = new Request(event);

      expect(request.requestTimeEpoch()).toBe(timestamp);
    });

    it('should handle additional properties in body', () => {
      const body = {
        action: 'test.action',
        param1: 'value1',
        param2: 123,
        param3: true,
        nested: { key: 'value' },
      };
      const event = mockWebSocketMessageEvent(body);
      const request = new Request(event);

      expect(request.body).toEqual(body);
      expect(request.body.param1).toBe('value1');
      expect(request.body.param2).toBe(123);
      expect(request.body.param3).toBe(true);
      expect(request.body.nested).toEqual({ key: 'value' });
    });

  });

});

