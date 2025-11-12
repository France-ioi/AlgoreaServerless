import { parseToken } from '../token';
import { generateKeyPair, SignJWT, exportSPKI, KeyLike } from 'jose';
import { ServerError } from '../../utils/errors';

describe('parseToken', () => {
  let privateKey: KeyLike;
  let publicKeyPem: string;

  beforeAll(async () => {
    const { privateKey: generatedPrivateKey, publicKey } = await generateKeyPair('ES256');
    privateKey = generatedPrivateKey;
    publicKeyPem = await exportSPKI(publicKey);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should parse a valid token correctly', async () => {
    const payload = {
      item_id: '1',
      participant_id: '2',
      user_id: '3',
      is_mine: true,
      can_watch: true,
      can_write: true,
    };
    const token = await new SignJWT(payload).setProtectedHeader({ alg: 'ES256' }).setExpirationTime('1h').sign(privateKey);
    const parsedToken = await parseToken(token, publicKeyPem);
    expect(parsedToken).toEqual({
      itemId: '1',
      participantId: '2',
      userId: '3',
      isMine: true,
      canWatch: true,
      canWrite: true,
    });
  });

  it('should throw an error for an invalid signature', async () => {
    const { publicKey: otherPublicKey } = await generateKeyPair('ES256');
    const otherPublicKeyPem = await exportSPKI(otherPublicKey);
    const token = await new SignJWT({}).setProtectedHeader({ alg: 'ES256' }).sign(privateKey);
    await expect(parseToken(token, otherPublicKeyPem)).rejects.toThrow('signature verification failed');
  });

  it('should throw an error for an invalid token format', async () => {
    await expect(parseToken('invalid-token', publicKeyPem)).rejects.toThrow('Invalid Compact JWS');
  });

  it('should throw an error if the payload is missing fields', async () => {
    const token = await new SignJWT({}).setProtectedHeader({ alg: 'ES256' }).setExpirationTime('1h').sign(privateKey);
    await expect(parseToken(token, publicKeyPem)).rejects.toThrow(); // Zod will throw
  });

  it('should throw an error for an expired token', async () => {
    jest.useFakeTimers();
    const payload = {
      item_id: '1',
      participant_id: '2',
      user_id: '3',
      is_mine: true,
      can_watch: true,
      can_write: true,
    };
    // Create a token that expires in 1 second
    const token = await new SignJWT(payload).setProtectedHeader({ alg: 'ES256' }).setExpirationTime('1s').sign(privateKey);

    // Advance time by 2 seconds
    jest.advanceTimersByTime(2000);
    await expect(parseToken(token, publicKeyPem)).rejects.toThrow('"exp" claim timestamp check failed');
  });

  it('should throw an error if the public key is not provided', async () => {
    await expect(parseToken('any-token', undefined)).rejects.toThrow(ServerError);
  });
});
