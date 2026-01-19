import { parseWsToken } from './token';
import { AuthenticationError } from '../utils/errors';

// Mock the jwt module
jest.mock('../auth/jwt', () => ({
  verifyJwt: jest.fn(),
}));

import { verifyJwt } from '../auth/jwt';
const mockVerifyJwt = verifyJwt as jest.MockedFunction<typeof verifyJwt>;

describe('WebSocket Token', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseWsToken', () => {

    it('should parse a valid token with user_id and exp', async () => {
      mockVerifyJwt.mockResolvedValue({
        user_id: 'user-123',
        exp: 1234567890,
      });

      const result = await parseWsToken('valid-token', 'public-key');

      expect(mockVerifyJwt).toHaveBeenCalledWith('valid-token', 'public-key');
      expect(result).toEqual({
        userId: 'user-123',
        exp: 1234567890,
      });
    });

    it('should throw when token verification fails', async () => {
      mockVerifyJwt.mockRejectedValue(new AuthenticationError('JWT verification failed'));

      await expect(parseWsToken('invalid-token', 'public-key'))
        .rejects.toThrow('JWT verification failed');
    });

    it('should throw when payload is missing user_id', async () => {
      mockVerifyJwt.mockResolvedValue({
        exp: 1234567890,
      });

      await expect(parseWsToken('token-without-user', 'public-key'))
        .rejects.toThrow();
    });

    it('should throw when payload is missing exp', async () => {
      mockVerifyJwt.mockResolvedValue({
        user_id: 'user-123',
      });

      await expect(parseWsToken('token-without-exp', 'public-key'))
        .rejects.toThrow();
    });

    it('should pass public key to verifyJwt', async () => {
      mockVerifyJwt.mockResolvedValue({
        user_id: 'user-456',
        exp: 9999999999,
      });

      await parseWsToken('some-token', 'my-public-key-pem');

      expect(mockVerifyJwt).toHaveBeenCalledWith('some-token', 'my-public-key-pem');
    });

  });

});
