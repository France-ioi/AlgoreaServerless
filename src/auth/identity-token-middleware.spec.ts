import { Request } from 'lambda-api';
import { requireIdentityToken, RequestWithIdentityToken } from './identity-token-middleware';

// Mock the identity token module
jest.mock('./identity-token', () => ({
  parseIdentityToken: jest.fn(),
}));

// Mock the jwt module
jest.mock('./jwt', () => ({
  extractBearerToken: jest.fn(),
}));

import { parseIdentityToken } from './identity-token';
import { extractBearerToken } from './jwt';

const mockParseIdentityToken = parseIdentityToken as jest.MockedFunction<typeof parseIdentityToken>;
const mockExtractBearerToken = extractBearerToken as jest.MockedFunction<typeof extractBearerToken>;

describe('requireIdentityToken middleware', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, BACKEND_PUBLIC_KEY: 'test-public-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should extract and parse identity token from Authorization header', async () => {
    const mockToken = { userId: 'user-123', exp: 9999999999 };
    mockExtractBearerToken.mockReturnValue('test-jwt-token');
    mockParseIdentityToken.mockResolvedValue(mockToken);

    const req = {
      headers: { authorization: 'Bearer test-jwt-token' },
    } as unknown as Request;
    const res = {} as any;
    const next = jest.fn();

    await (requireIdentityToken as any)(req, res, next);

    expect(mockExtractBearerToken).toHaveBeenCalledWith('Bearer test-jwt-token');
    expect(mockParseIdentityToken).toHaveBeenCalledWith('test-jwt-token', 'test-public-key');
    expect((req as RequestWithIdentityToken).identityToken).toEqual(mockToken);
    expect(next).toHaveBeenCalled();
  });

  it('should throw when Authorization header is missing', async () => {
    mockExtractBearerToken.mockImplementation(() => {
      throw new Error('no Authorization header found');
    });

    const req = {
      headers: {},
    } as unknown as Request;
    const res = {} as any;
    const next = jest.fn();

    await expect((requireIdentityToken as any)(req, res, next)).rejects.toThrow('no Authorization header found');
    expect(next).not.toHaveBeenCalled();
  });

  it('should throw when token verification fails', async () => {
    mockExtractBearerToken.mockReturnValue('invalid-token');
    mockParseIdentityToken.mockRejectedValue(new Error('JWT verification failed'));

    const req = {
      headers: { authorization: 'Bearer invalid-token' },
    } as unknown as Request;
    const res = {} as any;
    const next = jest.fn();

    await expect((requireIdentityToken as any)(req, res, next)).rejects.toThrow('JWT verification failed');
    expect(next).not.toHaveBeenCalled();
  });
});
