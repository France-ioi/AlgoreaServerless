import { generateKeyPair, exportSPKI, SignJWT, KeyLike } from 'jose';
import { parseToken, extractTokenFromHttp } from './token';
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

  describe('parseToken', () => {
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

      const result = await parseToken(token, publicKeyPem);

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

      await expect(parseToken(token, otherPublicKeyPem))
        .rejects.toThrow(AuthenticationError);
      await expect(parseToken(token, otherPublicKeyPem))
        .rejects.toThrow('signature verification failed');
    });

    it('should throw error for invalid token format', async () => {
      await expect(parseToken('invalid-token', publicKeyPem))
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

      await expect(parseToken(token, publicKeyPem))
        .rejects.toThrow(AuthenticationError);
      await expect(parseToken(token, publicKeyPem))
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

      await expect(parseToken(token, publicKeyPem))
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

      await expect(parseToken(token, publicKeyPem))
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

      await expect(parseToken(token, publicKeyPem))
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

      await expect(parseToken(token, publicKeyPem))
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

      await expect(parseToken(token, publicKeyPem))
        .rejects.toThrow();
    });

    it('should throw ServerError when public key is not provided', async () => {
      await expect(parseToken('any-token', undefined))
        .rejects.toThrow(ServerError);
      await expect(parseToken('any-token', undefined))
        .rejects.toThrow('no backend public key found');
    });
  });

  describe('extractTokenFromHttp', () => {
    const originalEnv = process.env.BACKEND_PUBLIC_KEY;

    beforeEach(() => {
      process.env.BACKEND_PUBLIC_KEY = publicKeyPem;
    });

    afterEach(() => {
      process.env.BACKEND_PUBLIC_KEY = originalEnv;
    });

    it('should extract and parse valid token from headers', async () => {
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

      const headers = { authorization: `Bearer ${token}` };
      const result = await extractTokenFromHttp(headers);

      expect(result).toEqual({
        itemId: 'item123',
        userId: 'user456',
        firstname: 'John',
        lastname: 'Doe',
        email: 'john.doe@example.com',
      });
    });

    it('should throw error for missing authorization header', async () => {
      const headers = {};
      await expect(extractTokenFromHttp(headers))
        .rejects.toThrow(AuthenticationError);
      await expect(extractTokenFromHttp(headers))
        .rejects.toThrow('no Authorization header found');
    });

    it('should throw error for invalid token in header', async () => {
      const headers = { authorization: 'Bearer invalid-token' };
      await expect(extractTokenFromHttp(headers))
        .rejects.toThrow(AuthenticationError);
    });

    it('should throw error for malformed authorization header', async () => {
      const headers = { authorization: 'NotBearer token123' };
      await expect(extractTokenFromHttp(headers))
        .rejects.toThrow(AuthenticationError);
      await expect(extractTokenFromHttp(headers))
        .rejects.toThrow('not a Bearer token');
    });
  });
});
