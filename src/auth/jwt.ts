import { importSPKI, jwtVerify, decodeJwt, JWTPayload } from 'jose';
import { AuthenticationError, ServerError } from '../utils/errors';

/**
 * Determine if JWT signature verification should be performed
 * @returns true if signature should be verified, false to skip verification
 * @throws ServerError if NO_SIG_CHECK=1 in non-dev environment
 */
function shouldVerifySignature(): boolean {
  const noSigCheck = process.env.NO_SIG_CHECK === '1';

  if (!noSigCheck) {
    return true; // Normal verification
  }

  // NO_SIG_CHECK=1 is set, validate it's only in dev
  const stage = process.env.STAGE || 'dev';
  if (stage !== 'dev') {
    throw new ServerError(
      `NO_SIG_CHECK=1 can only be used in dev environment. Current stage: ${stage}`
    );
  }

  return false; // Skip verification in dev
}

/**
 * Verify a JWT token using the provided public key
 * @param token - Raw JWT token string
 * @param publicKeyPem - Public key in PEM format
 * @returns The verified JWT payload
 * @throws ServerError if no public key is provided or if NO_SIG_CHECK misconfigured
 * @throws AuthenticationError if JWT verification fails
 */
export async function verifyJwt(token: string, publicKeyPem?: string): Promise<JWTPayload> {
  // Check if we should skip signature verification
  if (!shouldVerifySignature()) {
    // Decode without verification (dev mode only)
    return decodeJwt(token);
  }

  // Normal verification flow
  if (!publicKeyPem) {
    throw new ServerError('no backend public key found to verify the token');
  }

  const publicKey = await importSPKI(publicKeyPem, 'ES256');
  const { payload } = await jwtVerify(token, publicKey).catch(
    err => {
      throw new AuthenticationError(`JWT verification failed: ${(err as Error).message}`);
    }
  );

  return payload;
}

/**
 * Extract JWT token from Bearer authorization header
 * @param authHeader - Authorization header value
 * @returns The extracted JWT token
 * @throws AuthenticationError if header is missing or malformed
 */
export function extractBearerToken(authHeader?: string): string {
  if (!authHeader) {
    throw new AuthenticationError('no Authorization header found in the headers.');
  }

  if (!authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError('the Authorization header is not a Bearer token');
  }

  const token = authHeader.slice(7);

  if (!token) {
    throw new AuthenticationError('the Authorization header Bearer token is empty');
  }

  return token;
}
