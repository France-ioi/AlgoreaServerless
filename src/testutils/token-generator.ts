import { generateKeyPair, exportSPKI, SignJWT, KeyLike } from 'jose';
import { ForumToken } from '../forum/token';
import { setPrivateKey } from './portal-token-generator';

let privateKey: KeyLike;
let publicKeyPem: string;

/**
 * Initialize the key pair for token generation
 * Call this once before generating tokens
 */
export const initializeKeys = async (): Promise<void> => {
  const { privateKey: generatedPrivateKey, publicKey } = await generateKeyPair('ES256');
  privateKey = generatedPrivateKey;
  publicKeyPem = await exportSPKI(publicKey);

  // Set the public key in environment for token verification
  process.env.BACKEND_PUBLIC_KEY = publicKeyPem;

  // Share the private key with portal token generator
  setPrivateKey(privateKey);
};

/**
 * Get the public key PEM (for manual verification if needed)
 */
export const getPublicKeyPem = (): string => {
  if (!publicKeyPem) {
    throw new Error('Keys not initialized. Call initializeKeys() first.');
  }
  return publicKeyPem;
};

/**
 * Generate a signed JWT token with custom payload
 */
export const generateToken = async (
  payload: Partial<ForumToken> & { participantId: string, itemId: string, userId: string }
): Promise<string> => {
  if (privateKey === undefined) {
    throw new Error('Keys not initialized. Call initializeKeys() first.');
  }

  const fullPayload = {
    participant_id: payload.participantId,
    item_id: payload.itemId,
    user_id: payload.userId,
    is_mine: payload.isMine ?? false,
    can_watch: payload.canWatch ?? true,
    can_write: payload.canWrite ?? true,
  };

  return await new SignJWT(fullPayload)
    .setProtectedHeader({ alg: 'ES256' })
    .setExpirationTime('1h')
    .sign(privateKey);
};

/**
 * Generate a token for a user with read-only permissions
 */
export const generateReadOnlyToken = async (
  participantId: string,
  itemId: string,
  userId: string
): Promise<string> => generateToken({
  participantId,
  itemId,
  userId,
  canWatch: true,
  canWrite: false,
  isMine: false,
});

/**
 * Generate a token for a user with write permissions
 */
export const generateWriteToken = async (
  participantId: string,
  itemId: string,
  userId: string
): Promise<string> => generateToken({
  participantId,
  itemId,
  userId,
  canWatch: true,
  canWrite: true,
  isMine: false,
});

/**
 * Generate a token for the thread owner
 */
export const generateOwnerToken = async (
  participantId: string,
  itemId: string,
  userId: string
): Promise<string> => generateToken({
  participantId,
  itemId,
  userId,
  canWatch: true,
  canWrite: true,
  isMine: true,
});

