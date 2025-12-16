import {
  DBError,
  DecodingError,
  RouteNotFound,
  Forbidden,
  OperationSkipped,
  ServerError,
  errorToString,
} from './errors';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { GoneException } from '@aws-sdk/client-apigatewaymanagementapi';

describe('Error Classes', () => {

  describe('DBError', () => {
    it('should set correct name property', () => {
      const error = new DBError('test message', 'test details');
      expect(error.name).toBe('DBError');
    });

    it('should store details field correctly', () => {
      const error = new DBError('test message', 'SELECT * FROM table');
      expect(error.message).toBe('test message');
      expect(error.details).toBe('SELECT * FROM table');
    });
  });

  describe('DecodingError', () => {
    it('should set correct name property', () => {
      const error = new DecodingError('test message');
      expect(error.name).toBe('DecodingError');
      expect(error.message).toBe('test message');
    });
  });

  describe('RouteNotFound', () => {
    it('should set correct name property', () => {
      const error = new RouteNotFound('test message');
      expect(error.name).toBe('RouteNotFound');
      expect(error.message).toBe('test message');
    });
  });

  describe('Forbidden', () => {
    it('should set correct name property', () => {
      const error = new Forbidden('test message');
      expect(error.name).toBe('Forbidden');
      expect(error.message).toBe('test message');
    });
  });

  describe('OperationSkipped', () => {
    it('should set correct name property', () => {
      const error = new OperationSkipped('test message');
      expect(error.name).toBe('OperationSkipped');
      expect(error.message).toBe('test message');
    });
  });

  describe('ServerError', () => {
    it('should set correct name property', () => {
      const error = new ServerError('test message');
      expect(error.name).toBe('ServerError');
      expect(error.message).toBe('test message');
    });
  });

});

describe('errorToString', () => {

  it('should format TransactionCanceledException with cancellation reasons', () => {
    const error = new TransactionCanceledException({
      $metadata: {},
    });
    error.message = 'Transaction cancelled';
    error.CancellationReasons = [
      { Code: 'ConditionalCheckFailed' },
      { Code: 'ItemCollectionSizeLimitExceeded' },
    ];
    const result = errorToString(error);
    expect(result).toContain('TransactionCanceledException');
    expect(result).toContain('Transaction cancelled');
    expect(result).toContain('CancellationReasons');
    expect(result).toContain('ConditionalCheckFailed');
  });

  it('should format DBError with statement details', () => {
    const error = new DBError('Query failed', 'SELECT * FROM table');
    const result = errorToString(error);
    expect(result).toBe('DBError: Query failed - Statement(s): SELECT * FROM table');
  });

  it('should format GoneException as "Connection closed"', () => {
    const error = new GoneException({
      message: 'Connection gone',
      $metadata: {},
    });
    const result = errorToString(error);
    expect(result).toBe('Connection closed');
  });

  it('should format standard Error with name and message', () => {
    const error = new Error('Something went wrong');
    const result = errorToString(error);
    expect(result).toBe('Error: Something went wrong');
  });

  it('should format Forbidden with name and message', () => {
    const error = new Forbidden('Access denied');
    const result = errorToString(error);
    expect(result).toBe('Forbidden: Access denied');
  });

  it('should format ServerError with name and message', () => {
    const error = new ServerError('Internal error');
    const result = errorToString(error);
    expect(result).toBe('ServerError: Internal error');
  });

  it('should format DecodingError with name and message', () => {
    const error = new DecodingError('Invalid token');
    const result = errorToString(error);
    expect(result).toBe('DecodingError: Invalid token');
  });

  it('should format OperationSkipped with name and message', () => {
    const error = new OperationSkipped('Skipped operation');
    const result = errorToString(error);
    expect(result).toBe('OperationSkipped: Skipped operation');
  });

  it('should format unknown errors with JSON stringify', () => {
    const error = { custom: 'error', code: 123 };
    const result = errorToString(error);
    expect(result).toBe('An unexpected error occured ({"custom":"error","code":123})');
  });

  it('should handle string errors', () => {
    const error = 'string error';
    const result = errorToString(error);
    expect(result).toBe('An unexpected error occured ("string error")');
  });

  it('should handle number errors', () => {
    const error = 404;
    const result = errorToString(error);
    expect(result).toBe('An unexpected error occured (404)');
  });

});

