import { importSPKI, jwtVerify, decodeJwt, JWTPayload } from 'jose';
import { AuthenticationError, ServerError } from '../utils/errors';

/**
 * Normalize a PEM-formatted key to ensure proper line breaks.
 * Some environments strip newlines from PEM keys, which breaks parsing.
 */
function normalizePem(pem: string): string {
  // If it already has proper newlines, return as-is
  if (pem.includes('\n')) {
    return pem;
  }

  // Extract the type (e.g., "PUBLIC KEY", "RSA PUBLIC KEY")
  const headerMatch = pem.match(/-----BEGIN ([^-]+)-----/);
  const footerMatch = pem.match(/-----END ([^-]+)-----/);

  if (!headerMatch || !footerMatch) {
    return pem; // Not a valid PEM format, return as-is
  }

  const type = headerMatch[1];
  const header = `-----BEGIN ${type}-----`;
  const footer = `-----END ${type}-----`;

  // Extract the base64 content between header and footer
  const base64Content = pem
    .replace(header, '')
    .replace(footer, '')
    .trim();

  // Reconstruct with proper newlines
  return `${header}\n${base64Content}\n${footer}`;
}

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

  const normalizedPem = normalizePem(publicKeyPem);
  const publicKey = await importSPKI(normalizedPem, 'RS512');
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
