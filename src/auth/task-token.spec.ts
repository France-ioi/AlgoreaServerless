import { parseTaskToken } from './task-token';
import { AuthenticationError } from '../utils/errors';

jest.mock('./jwt', () => ({
  verifyJwt: jest.fn(),
  extractBearerToken: jest.fn(),
}));

import { verifyJwt } from './jwt';
const mockVerifyJwt = verifyJwt as jest.MockedFunction<typeof verifyJwt>;

function todayDateStr(): string {
  const now = new Date();
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = now.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function dateStrDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

describe('TaskToken', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseTaskToken', () => {

    it('should parse a valid task token', async () => {
      mockVerifyJwt.mockResolvedValue({
        idUser: '42',
        idItemLocal: '100',
        date: todayDateStr(),
      });

      const result = await parseTaskToken('valid-token', 'public-key');

      expect(mockVerifyJwt).toHaveBeenCalledWith('valid-token', 'public-key');
      expect(result).toEqual({
        participantId: '42',
        itemId: '100',
      });
    });

    it('should accept a token dated yesterday', async () => {
      mockVerifyJwt.mockResolvedValue({
        idUser: '42',
        idItemLocal: '100',
        date: dateStrDaysAgo(1),
      });

      const result = await parseTaskToken('token', 'key');
      expect(result.participantId).toBe('42');
    });

    it('should reject an expired token (2 days ago)', async () => {
      mockVerifyJwt.mockResolvedValue({
        idUser: '42',
        idItemLocal: '100',
        date: dateStrDaysAgo(2),
      });

      await expect(parseTaskToken('token', 'key'))
        .rejects.toThrow(AuthenticationError);
    });

    it('should throw when payload is missing idUser', async () => {
      mockVerifyJwt.mockResolvedValue({
        idItemLocal: '100',
        date: todayDateStr(),
      });

      await expect(parseTaskToken('token', 'key'))
        .rejects.toThrow(AuthenticationError);
    });

    it('should throw when payload is missing idItemLocal', async () => {
      mockVerifyJwt.mockResolvedValue({
        idUser: '42',
        date: todayDateStr(),
      });

      await expect(parseTaskToken('token', 'key'))
        .rejects.toThrow(AuthenticationError);
    });

    it('should throw when JWT verification fails', async () => {
      mockVerifyJwt.mockRejectedValue(new AuthenticationError('JWT verification failed'));

      await expect(parseTaskToken('bad-token', 'key'))
        .rejects.toThrow('JWT verification failed');
    });

  });

});
