import { SignJWT, KeyLike } from 'jose';
import { PortalToken } from '../portal/token';

// Import the private key from the main token generator
// This ensures we use the same key pair for both forum and portal tokens
let privateKey: KeyLike | undefined;

/**
 * Set the private key for portal token generation
 * This is called internally by initializeKeys from token-generator
 */
export const setPrivateKey = (key: KeyLike): void => {
  privateKey = key;
};

/**
 * Get the private key (for internal use by token-generator)
 */
export const getPrivateKey = (): KeyLike | undefined => privateKey;

/**
 * Generate a signed portal JWT token
 */
export const generatePortalToken = async (
  payload: Partial<PortalToken> & { itemId: string, userId: string }
): Promise<string> => {
  if (privateKey === undefined) {
    throw new Error('Keys not initialized. Call initializeKeys() first.');
  }

  const fullPayload = {
    item_id: payload.itemId,
    user_id: payload.userId,
    firstname: payload.firstname || 'John',
    lastname: payload.lastname || 'Doe',
    email: payload.email || 'john.doe@example.com',
  };

  return await new SignJWT(fullPayload)
    .setProtectedHeader({ alg: 'ES256' })
    .setExpirationTime('1h')
    .sign(privateKey);
};
