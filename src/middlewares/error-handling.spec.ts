import errorHandler from './error-handling';
import { AuthenticationError, DecodingError, Forbidden, DBError } from '../utils/errors';

describe('Error Handling Middleware', () => {

  describe('Error Mapping', () => {

    it('should map DecodingError to 400 with proper message', () => {
      const error = new DecodingError('Invalid JSON format');
      const mockRequest = {} as any;
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as any;
      const mockNext = jest.fn();

      errorHandler(error, mockRequest, mockResponse, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'decoding error',
        details: error.message,
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should map AuthenticationError to 401 with proper message', () => {
      const error = new AuthenticationError('Invalid token');
      const mockRequest = {} as any;
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as any;
      const mockNext = jest.fn();

      errorHandler(error, mockRequest, mockResponse, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'authentication error',
        details: error.message,
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should map Forbidden to 403 with proper message', () => {
      const error = new Forbidden('Access denied');
      const mockRequest = {} as any;
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as any;
      const mockNext = jest.fn();

      errorHandler(error, mockRequest, mockResponse, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'forbidden',
        details: error.message,
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should map RouteError to 404 with method and path details', () => {
      const error = new Error('Route not found');
      error.name = 'RouteError';
      const mockRequest = {
        method: 'GET',
        path: '/test/path',
      } as any;
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as any;
      const mockNext = jest.fn();

      errorHandler(error, mockRequest, mockResponse, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'route error',
        details: { method: 'GET', path: '/test/path' },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should map DBError to 500 with error details', () => {
      const error = new DBError('Query failed', 'SELECT * FROM table');
      const mockRequest = {} as any;
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as any;
      const mockNext = jest.fn();

      errorHandler(error, mockRequest, mockResponse, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'db error',
        details: error,
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should map generic Error to 500 with message', () => {
      const error = new Error('Something went wrong');
      const mockRequest = {} as any;
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as any;
      const mockNext = jest.fn();

      errorHandler(error, mockRequest, mockResponse, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'internal server error',
        details: 'Error: Something went wrong',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

  });

  describe('Middleware Chain', () => {

    it('should call next() for non-error cases', () => {
      const error = { custom: 'non-standard error object' } as any;
      const mockRequest = {} as any;
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as any;
      const mockNext = jest.fn();

      errorHandler(error, mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockResponse.json).not.toHaveBeenCalled();
    });

  });

  describe('Error Types', () => {

    it('should handle DecodingError with different messages', () => {
      const errors = [
        new DecodingError('Missing token'),
        new DecodingError('Invalid JSON'),
        new DecodingError('Malformed header'),
      ];

      errors.forEach(error => {
        const mockResponse = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn().mockReturnThis(),
        } as any;

        errorHandler(error, {} as any, mockResponse, jest.fn());

        expect(mockResponse.status).toHaveBeenCalledWith(400);
      });
    });

    it('should handle multiple error types correctly', () => {
      const testCases = [
        { error: new DecodingError('test'), expectedStatus: 400 },
        { error: new AuthenticationError('test'), expectedStatus: 401 },
        { error: new Forbidden('test'), expectedStatus: 403 },
        { error: new DBError('test', 'details'), expectedStatus: 500 },
        { error: new Error('test'), expectedStatus: 500 },
      ];

      testCases.forEach(({ error, expectedStatus }) => {
        const mockResponse = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn().mockReturnThis(),
        } as any;

        errorHandler(error, {} as any, mockResponse, jest.fn());

        expect(mockResponse.status).toHaveBeenCalledWith(expectedStatus);
      });
    });

  });

});

