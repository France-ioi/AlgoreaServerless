import { importSPKI, jwtVerify, JWTPayload } from 'jose';
import { AuthenticationError, ServerError } from '../utils/errors';

/**
 * Verify a JWT token using the provided public key
 * @param token - Raw JWT token string
 * @param publicKeyPem - Public key in PEM format
 * @returns The verified JWT payload
 * @throws ServerError if no public key is provided
 * @throws AuthenticationError if JWT verification fails
 */
export async function verifyJwt(token: string, publicKeyPem?: string): Promise<JWTPayload> {
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
