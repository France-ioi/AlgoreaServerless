import { parsePermissionsToken } from './permissions-token';
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

function validPayload(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    date: todayDateStr(),
    user_id: '101',
    item_id: '50',
    can_view: 'content',
    can_grant_view: 'content',
    can_watch: 'result',
    can_edit: 'all',
    is_owner: false,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

describe('PermissionsToken', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parsePermissionsToken', () => {

    it('should parse a valid permissions token', async () => {
      mockVerifyJwt.mockResolvedValue(validPayload());

      const result = await parsePermissionsToken('valid-token', 'public-key');

      expect(mockVerifyJwt).toHaveBeenCalledWith('valid-token', 'public-key');
      expect(result).toEqual({
        userId: '101',
        itemId: '50',
        canView: 'content',
        canGrantView: 'content',
        canWatch: 'result',
        canEdit: 'all',
        isOwner: false,
      });
    });

    it('should accept a token dated yesterday', async () => {
      mockVerifyJwt.mockResolvedValue(validPayload({ date: dateStrDaysAgo(1) }));
      const result = await parsePermissionsToken('token', 'key');
      expect(result.userId).toBe('101');
    });

    it('should reject an expired date (2 days ago)', async () => {
      mockVerifyJwt.mockResolvedValue(validPayload({ date: dateStrDaysAgo(2) }));
      await expect(parsePermissionsToken('token', 'key'))
        .rejects.toThrow(AuthenticationError);
    });

    it('should reject an expired exp timestamp', async () => {
      mockVerifyJwt.mockResolvedValue(validPayload({ exp: Math.floor(Date.now() / 1000) - 10 }));
      await expect(parsePermissionsToken('token', 'key'))
        .rejects.toThrow(AuthenticationError);
    });

    it('should throw on missing user_id', async () => {
      const payload = validPayload();
      delete payload.user_id;
      mockVerifyJwt.mockResolvedValue(payload);
      await expect(parsePermissionsToken('token', 'key'))
        .rejects.toThrow(AuthenticationError);
    });

    it('should throw on missing item_id', async () => {
      const payload = validPayload();
      delete payload.item_id;
      mockVerifyJwt.mockResolvedValue(payload);
      await expect(parsePermissionsToken('token', 'key'))
        .rejects.toThrow(AuthenticationError);
    });

    it('should throw on invalid can_edit value', async () => {
      mockVerifyJwt.mockResolvedValue(validPayload({ can_edit: 'invalid' }));
      await expect(parsePermissionsToken('token', 'key'))
        .rejects.toThrow(AuthenticationError);
    });

    it('should parse is_owner as true', async () => {
      mockVerifyJwt.mockResolvedValue(validPayload({ is_owner: true }));
      const result = await parsePermissionsToken('token', 'key');
      expect(result.isOwner).toBe(true);
    });

  });

});
