import { generateKeyPair, exportSPKI, SignJWT, KeyLike } from 'jose';
import { parsePortalToken, requirePortalToken, RequestWithPortalToken } from './token';
import { AuthenticationError, ServerError } from '../utils/errors';

describe('Portal Token Module', () => {
  let privateKey: KeyLike;
  let publicKeyPem: string;
  let otherPublicKeyPem: string;

  beforeAll(async () => {
    // Generate a key pair for testing
    const { privateKey: generatedPrivateKey, publicKey } = await generateKeyPair('ES256');
    privateKey = generatedPrivateKey;
    publicKeyPem = await exportSPKI(publicKey);

    // Generate another key pair for testing wrong signature
    const { publicKey: otherPublicKey } = await generateKeyPair('ES256');
    otherPublicKeyPem = await exportSPKI(otherPublicKey);
  });

  describe('parsePortalToken', () => {
    it('should parse a valid portal token correctly', async () => {
      const payload = {
        item_id: 'item123',
        user_id: 'user456',
        firstname: 'John',
        lastname: 'Doe',
        email: 'john.doe@example.com',
      };

      const token = await new SignJWT(payload)
        .setProtectedHeader({ alg: 'ES256' })
        .setExpirationTime('1h')
        .sign(privateKey);

      const result = await parsePortalToken(token, publicKeyPem);

      expect(result).toEqual({
        itemId: 'item123',
        userId: 'user456',
        firstname: 'John',
        lastname: 'Doe',
        email: 'john.doe@example.com',
      });
    });

    it('should throw error for token with wrong signature', async () => {
      const payload = {
        item_id: 'item123',
        user_id: 'user456',
        firstname: 'John',
        lastname: 'Doe',
        email: 'john.doe@example.com',
      };

      const token = await new SignJWT(payload)
        .setProtectedHeader({ alg: 'ES256' })
        .setExpirationTime('1h')
        .sign(privateKey);

      await expect(parsePortalToken(token, otherPublicKeyPem))
        .rejects.toThrow(AuthenticationError);
      await expect(parsePortalToken(token, otherPublicKeyPem))
        .rejects.toThrow('signature verification failed');
    });

    it('should throw error for invalid token format', async () => {
      await expect(parsePortalToken('invalid-token', publicKeyPem))
        .rejects.toThrow(AuthenticationError);
    });

    it('should throw error for expired token', async () => {
      const payload = {
        item_id: 'item123',
        user_id: 'user456',
        firstname: 'John',
        lastname: 'Doe',
        email: 'john.doe@example.com',
      };

      const token = await new SignJWT(payload)
        .setProtectedHeader({ alg: 'ES256' })
        .setExpirationTime('1s')
        .sign(privateKey);

      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      await expect(parsePortalToken(token, publicKeyPem))
        .rejects.toThrow(AuthenticationError);
      await expect(parsePortalToken(token, publicKeyPem))
        .rejects.toThrow('"exp" claim timestamp check failed');
    });

    it('should throw error when token is missing item_id', async () => {
      const payload = {
        user_id: 'user456',
        firstname: 'John',
        lastname: 'Doe',
        email: 'john.doe@example.com',
      };

      const token = await new SignJWT(payload)
        .setProtectedHeader({ alg: 'ES256' })
        .setExpirationTime('1h')
        .sign(privateKey);

      await expect(parsePortalToken(token, publicKeyPem))
        .rejects.toThrow();
    });

    it('should throw error when token is missing user_id', async () => {
      const payload = {
        item_id: 'item123',
        firstname: 'John',
        lastname: 'Doe',
        email: 'john.doe@example.com',
      };

      const token = await new SignJWT(payload)
        .setProtectedHeader({ alg: 'ES256' })
        .setExpirationTime('1h')
        .sign(privateKey);

      await expect(parsePortalToken(token, publicKeyPem))
        .rejects.toThrow();
    });

    it('should throw error when token is missing firstname', async () => {
      const payload = {
        item_id: 'item123',
        user_id: 'user456',
        lastname: 'Doe',
        email: 'john.doe@example.com',
      };

      const token = await new SignJWT(payload)
        .setProtectedHeader({ alg: 'ES256' })
        .setExpirationTime('1h')
        .sign(privateKey);

      await expect(parsePortalToken(token, publicKeyPem))
        .rejects.toThrow();
    });

    it('should throw error when token is missing lastname', async () => {
      const payload = {
        item_id: 'item123',
        user_id: 'user456',
        firstname: 'John',
        email: 'john.doe@example.com',
      };

      const token = await new SignJWT(payload)
        .setProtectedHeader({ alg: 'ES256' })
        .setExpirationTime('1h')
        .sign(privateKey);

      await expect(parsePortalToken(token, publicKeyPem))
        .rejects.toThrow();
    });

    it('should throw error when token is missing email', async () => {
      const payload = {
        item_id: 'item123',
        user_id: 'user456',
        firstname: 'John',
        lastname: 'Doe',
      };

      const token = await new SignJWT(payload)
        .setProtectedHeader({ alg: 'ES256' })
        .setExpirationTime('1h')
        .sign(privateKey);

      await expect(parsePortalToken(token, publicKeyPem))
        .rejects.toThrow();
    });

    it('should throw ServerError when public key is not provided', async () => {
      await expect(parsePortalToken('any-token', undefined))
        .rejects.toThrow(ServerError);
      await expect(parsePortalToken('any-token', undefined))
        .rejects.toThrow('no backend public key found');
    });
  });

  describe('requirePortalToken middleware', () => {
    const originalEnv = process.env.BACKEND_PUBLIC_KEY;

    beforeEach(() => {
      process.env.BACKEND_PUBLIC_KEY = publicKeyPem;
    });

    afterEach(() => {
      process.env.BACKEND_PUBLIC_KEY = originalEnv;
    });

    it('should extract and attach valid token to request', async () => {
      const payload = {
        item_id: 'item123',
        user_id: 'user456',
        firstname: 'John',
        lastname: 'Doe',
        email: 'john.doe@example.com',
      };

      const token = await new SignJWT(payload)
        .setProtectedHeader({ alg: 'ES256' })
        .setExpirationTime('1h')
        .sign(privateKey);

      const req = { headers: { authorization: `Bearer ${token}` } } as any;
      const res = {} as any;
      const next = jest.fn();

      await (requirePortalToken(req, res, next) as unknown as Promise<void>);

      expect(next).toHaveBeenCalled();
      expect((req as RequestWithPortalToken).portalToken).toEqual({
        itemId: 'item123',
        userId: 'user456',
        firstname: 'John',
        lastname: 'Doe',
        email: 'john.doe@example.com',
      });
    });

    it('should throw error for missing authorization header', async () => {
      const req = { headers: {} } as any;
      const res = {} as any;
      const next = jest.fn();

      await expect(requirePortalToken(req, res, next) as unknown as Promise<void>)
        .rejects.toThrow(AuthenticationError);
      await expect(requirePortalToken(req, res, next) as unknown as Promise<void>)
        .rejects.toThrow('no Authorization header found');
    });

    it('should throw error for invalid token in header', async () => {
      const req = { headers: { authorization: 'Bearer invalid-token' } } as any;
      const res = {} as any;
      const next = jest.fn();

      await expect(requirePortalToken(req, res, next) as unknown as Promise<void>)
        .rejects.toThrow(AuthenticationError);
    });

    it('should throw error for malformed authorization header', async () => {
      const req = { headers: { authorization: 'NotBearer token123' } } as any;
      const res = {} as any;
      const next = jest.fn();

      await expect(requirePortalToken(req, res, next) as unknown as Promise<void>)
        .rejects.toThrow(AuthenticationError);
      await expect(requirePortalToken(req, res, next) as unknown as Promise<void>)
        .rejects.toThrow('not a Bearer token');
    });
  });
});
