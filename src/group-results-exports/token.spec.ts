import {
  parseGroupResultsToken,
  parseGroupResultsTokenSignatureOnly,
} from './token';
import { AuthenticationError } from '../utils/errors';

jest.mock('../auth/jwt', () => ({
  verifyJwt: jest.fn(),
  verifyJwtSignatureOnly: jest.fn(),
  extractBearerToken: jest.fn(),
}));

import { verifyJwt, verifyJwtSignatureOnly } from '../auth/jwt';
const mockVerifyJwt = verifyJwt as jest.MockedFunction<typeof verifyJwt>;
const mockVerifyJwtSignatureOnly = verifyJwtSignatureOnly as jest.MockedFunction<
  typeof verifyJwtSignatureOnly
>;

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

function validPayload(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    user_id: '123',
    group_id: '456',
    item_ids: [ '210', '220' ],
    date: todayDateStr(),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

describe('GroupResultsToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseGroupResultsToken', () => {
    it('should parse a valid group results token', async () => {
      mockVerifyJwt.mockResolvedValue(validPayload());

      const result = await parseGroupResultsToken('raw-jwt', 'public-key');

      expect(mockVerifyJwt).toHaveBeenCalledWith('raw-jwt', 'public-key');
      expect(mockVerifyJwtSignatureOnly).not.toHaveBeenCalled();
      expect(result).toEqual({
        userId: '123',
        groupId: '456',
        itemIds: [ '210', '220' ],
        raw: 'raw-jwt',
      });
    });

    it('should accept empty item_ids', async () => {
      mockVerifyJwt.mockResolvedValue(validPayload({ item_ids: [] }));
      const result = await parseGroupResultsToken('tok', 'key');
      expect(result.itemIds).toEqual([]);
    });

    it('should reject an expired date', async () => {
      mockVerifyJwt.mockResolvedValue(validPayload({ date: dateStrDaysAgo(2) }));
      await expect(parseGroupResultsToken('tok', 'key')).rejects.toThrow(AuthenticationError);
    });

    it('should reject an expired exp timestamp', async () => {
      mockVerifyJwt.mockResolvedValue(validPayload({ exp: Math.floor(Date.now() / 1000) - 10 }));
      await expect(parseGroupResultsToken('tok', 'key')).rejects.toThrow(AuthenticationError);
    });

    it('should throw on missing group_id', async () => {
      const payload = validPayload();
      delete payload.group_id;
      mockVerifyJwt.mockResolvedValue(payload);
      await expect(parseGroupResultsToken('tok', 'key')).rejects.toThrow(AuthenticationError);
    });
  });

  describe('parseGroupResultsTokenSignatureOnly', () => {
    it('should use verifyJwtSignatureOnly and accept expired exp in payload', async () => {
      mockVerifyJwtSignatureOnly.mockResolvedValue(
        validPayload({ exp: Math.floor(Date.now() / 1000) - 10 }),
      );
      const result = await parseGroupResultsTokenSignatureOnly('raw-jwt', 'key');
      expect(mockVerifyJwtSignatureOnly).toHaveBeenCalledWith('raw-jwt', 'key');
      expect(mockVerifyJwt).not.toHaveBeenCalled();
      expect(result.userId).toBe('123');
      expect(result.raw).toBe('raw-jwt');
    });

    it('should still reject an invalid date', async () => {
      mockVerifyJwtSignatureOnly.mockResolvedValue(validPayload({
        exp: Math.floor(Date.now() / 1000) - 10,
        date: dateStrDaysAgo(2),
      }));
      await expect(parseGroupResultsTokenSignatureOnly('tok', 'key'))
        .rejects.toThrow(AuthenticationError);
    });
  });
});
