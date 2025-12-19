import { generateKeyPair, exportSPKI, SignJWT, KeyLike } from 'jose';
import { verifyJwt, extractBearerToken } from './jwt';
import { AuthenticationError, ServerError } from '../utils/errors';

describe('JWT Module', () => {
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

  describe('verifyJwt', () => {
    it('should verify and return payload for valid JWT', async () => {
      const payload = { user_id: 'user123', item_id: 'item456' };
      const token = await new SignJWT(payload)
        .setProtectedHeader({ alg: 'ES256' })
        .setExpirationTime('1h')
        .sign(privateKey);

      const result = await verifyJwt(token, publicKeyPem);

      expect(result.user_id).toBe('user123');
      expect(result.item_id).toBe('item456');
    });

    it('should throw AuthenticationError for JWT with wrong signature', async () => {
      const payload = { user_id: 'user123' };
      const token = await new SignJWT(payload)
        .setProtectedHeader({ alg: 'ES256' })
        .setExpirationTime('1h')
        .sign(privateKey);

      await expect(verifyJwt(token, otherPublicKeyPem))
        .rejects.toThrow(AuthenticationError);
      await expect(verifyJwt(token, otherPublicKeyPem))
        .rejects.toThrow('signature verification failed');
    });

    it('should throw AuthenticationError for invalid JWT format', async () => {
      await expect(verifyJwt('invalid-token', publicKeyPem))
        .rejects.toThrow(AuthenticationError);
      await expect(verifyJwt('invalid-token', publicKeyPem))
        .rejects.toThrow('JWT verification failed');
    });

    it('should throw AuthenticationError for expired JWT', async () => {
      const payload = { user_id: 'user123' };
      const token = await new SignJWT(payload)
        .setProtectedHeader({ alg: 'ES256' })
        .setExpirationTime('1s')
        .sign(privateKey);

      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      await expect(verifyJwt(token, publicKeyPem))
        .rejects.toThrow(AuthenticationError);
      await expect(verifyJwt(token, publicKeyPem))
        .rejects.toThrow('"exp" claim timestamp check failed');
    });

    it('should throw ServerError when public key is missing', async () => {
      await expect(verifyJwt('any-token', undefined))
        .rejects.toThrow(ServerError);
      await expect(verifyJwt('any-token', undefined))
        .rejects.toThrow('no backend public key found');
    });

    it('should throw ServerError when public key is empty string', async () => {
      await expect(verifyJwt('any-token', ''))
        .rejects.toThrow(ServerError);
    });
  });

  describe('verifyJwt with NO_SIG_CHECK', () => {
    const originalNoSigCheck = process.env.NO_SIG_CHECK;
    const originalStage = process.env.STAGE;

    afterEach(() => {
      process.env.NO_SIG_CHECK = originalNoSigCheck;
      process.env.STAGE = originalStage;
    });

    describe('when NO_SIG_CHECK=1 and STAGE=dev', () => {
      beforeEach(() => {
        process.env.NO_SIG_CHECK = '1';
        process.env.STAGE = 'dev';
      });

      it('should decode valid token without verification', async () => {
        const payload = { user_id: 'user123', item_id: 'item456' };
        const token = await new SignJWT(payload)
          .setProtectedHeader({ alg: 'ES256' })
          .setExpirationTime('1h')
          .sign(privateKey);

        const result = await verifyJwt(token, publicKeyPem);

        expect(result.user_id).toBe('user123');
        expect(result.item_id).toBe('item456');
      });

      it('should decode token with invalid signature', async () => {
        const payload = { user_id: 'user123' };
        const token = await new SignJWT(payload)
          .setProtectedHeader({ alg: 'ES256' })
          .setExpirationTime('1h')
          .sign(privateKey);

        // Should decode even with wrong public key (signature not checked)
        const result = await verifyJwt(token, otherPublicKeyPem);

        expect(result.user_id).toBe('user123');
      });

      it('should decode expired token without checking expiry', async () => {
        const payload = { user_id: 'user123' };
        const token = await new SignJWT(payload)
          .setProtectedHeader({ alg: 'ES256' })
          .setExpirationTime('1s')
          .sign(privateKey);

        // Wait for token to expire
        await new Promise(resolve => setTimeout(resolve, 1100));

        // Should decode even when expired
        const result = await verifyJwt(token, publicKeyPem);

        expect(result.user_id).toBe('user123');
      });

      it('should throw error for malformed JWT', async () => {
        await expect(verifyJwt('invalid-token', publicKeyPem))
          .rejects.toThrow();
      });

      it('should not require public key when skipping verification', async () => {
        const payload = { user_id: 'user123' };
        const token = await new SignJWT(payload)
          .setProtectedHeader({ alg: 'ES256' })
          .setExpirationTime('1h')
          .sign(privateKey);

        // Should work without public key
        const result = await verifyJwt(token, undefined);

        expect(result.user_id).toBe('user123');
      });
    });

    describe('when NO_SIG_CHECK=1 and STAGE=prod', () => {
      beforeEach(() => {
        process.env.NO_SIG_CHECK = '1';
        process.env.STAGE = 'prod';
      });

      it('should throw ServerError about misconfiguration', async () => {
        const payload = { user_id: 'user123' };
        const token = await new SignJWT(payload)
          .setProtectedHeader({ alg: 'ES256' })
          .setExpirationTime('1h')
          .sign(privateKey);

        await expect(verifyJwt(token, publicKeyPem))
          .rejects.toThrow(ServerError);
        await expect(verifyJwt(token, publicKeyPem))
          .rejects.toThrow('NO_SIG_CHECK=1 can only be used in dev environment. Current stage: prod');
      });
    });

    describe('when NO_SIG_CHECK=1 and STAGE=test', () => {
      beforeEach(() => {
        process.env.NO_SIG_CHECK = '1';
        process.env.STAGE = 'test';
      });

      it('should throw ServerError about misconfiguration', async () => {
        const payload = { user_id: 'user123' };
        const token = await new SignJWT(payload)
          .setProtectedHeader({ alg: 'ES256' })
          .setExpirationTime('1h')
          .sign(privateKey);

        await expect(verifyJwt(token, publicKeyPem))
          .rejects.toThrow(ServerError);
        await expect(verifyJwt(token, publicKeyPem))
          .rejects.toThrow('NO_SIG_CHECK=1 can only be used in dev environment. Current stage: test');
      });
    });

    describe('when NO_SIG_CHECK=0', () => {
      beforeEach(() => {
        process.env.NO_SIG_CHECK = '0';
        process.env.STAGE = 'dev';
      });

      it('should perform normal verification', async () => {
        const payload = { user_id: 'user123' };
        const token = await new SignJWT(payload)
          .setProtectedHeader({ alg: 'ES256' })
          .setExpirationTime('1h')
          .sign(privateKey);

        const result = await verifyJwt(token, publicKeyPem);

        expect(result.user_id).toBe('user123');
      });

      it('should reject token with invalid signature', async () => {
        const payload = { user_id: 'user123' };
        const token = await new SignJWT(payload)
          .setProtectedHeader({ alg: 'ES256' })
          .setExpirationTime('1h')
          .sign(privateKey);

        await expect(verifyJwt(token, otherPublicKeyPem))
          .rejects.toThrow(AuthenticationError);
      });
    });

    describe('when NO_SIG_CHECK is not set', () => {
      beforeEach(() => {
        delete process.env.NO_SIG_CHECK;
        process.env.STAGE = 'prod';
      });

      it('should perform normal verification', async () => {
        const payload = { user_id: 'user123' };
        const token = await new SignJWT(payload)
          .setProtectedHeader({ alg: 'ES256' })
          .setExpirationTime('1h')
          .sign(privateKey);

        const result = await verifyJwt(token, publicKeyPem);

        expect(result.user_id).toBe('user123');
      });
    });
  });

  describe('extractBearerToken', () => {
    it('should extract token from valid Bearer header', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.token';
      const result = extractBearerToken(`Bearer ${token}`);
      expect(result).toBe(token);
    });

    it('should throw AuthenticationError for missing header', () => {
      expect(() => extractBearerToken(undefined))
        .toThrow(AuthenticationError);
      expect(() => extractBearerToken(undefined))
        .toThrow('no Authorization header found');
    });

    it('should throw AuthenticationError for header without Bearer prefix', () => {
      expect(() => extractBearerToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.token'))
        .toThrow(AuthenticationError);
      expect(() => extractBearerToken('Basic user:pass'))
        .toThrow(AuthenticationError);
      expect(() => extractBearerToken('Token abc123'))
        .toThrow('not a Bearer token');
    });

    it('should throw AuthenticationError for empty token after Bearer', () => {
      expect(() => extractBearerToken('Bearer '))
        .toThrow(AuthenticationError);
      expect(() => extractBearerToken('Bearer '))
        .toThrow('Bearer token is empty');
    });

    it('should handle Bearer token with extra spaces', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.token';
      const result = extractBearerToken(`Bearer  ${token}`);
      // The extra space becomes part of the token, which is expected behavior
      expect(result).toBe(` ${token}`);
    });
  });
});
