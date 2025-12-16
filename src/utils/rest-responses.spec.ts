import { created } from './rest-responses';

describe('REST Response Utilities', () => {

  describe('created', () => {
    it('should set status to 201', () => {
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
      };

      created(mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(201);
    });

    it('should return correct response object', () => {
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
      };

      const result = created(mockResponse as any);

      expect(result).toEqual({
        message: 'created',
        success: true,
      });
    });

    it('should work with chained calls', () => {
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };

      const result = created(mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(result.message).toBe('created');
      expect(result.success).toBe(true);
    });
  });

});

