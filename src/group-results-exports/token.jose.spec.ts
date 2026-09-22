/**
 * Unmocked jose integration: skipExpCheck must not fail on JWT exp via jwtVerify.
 */
import { generateKeyPair, exportSPKI, SignJWT, KeyLike } from 'jose';
import {
  parseGroupResultsToken,
  parseGroupResultsTokenSignatureOnly,
} from './token';
import { AuthenticationError } from '../utils/errors';

function todayDateStr(): string {
  const now = new Date();
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = now.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

describe('GroupResultsToken jose (unmocked)', () => {
  let privateKey: KeyLike;
  let publicKeyPem: string;
  const originalNoSigCheck = process.env.NO_SIG_CHECK;
  const originalStage = process.env.STAGE;

  beforeAll(async () => {
    process.env.NO_SIG_CHECK = '0';
    process.env.STAGE = 'test';
    const { privateKey: generatedPrivateKey, publicKey } = await generateKeyPair('RS512');
    privateKey = generatedPrivateKey;
    publicKeyPem = await exportSPKI(publicKey);
  });

  afterAll(() => {
    process.env.NO_SIG_CHECK = originalNoSigCheck;
    process.env.STAGE = originalStage;
  });

  it('signatureOnly accepts an expired JWT that parseGroupResultsToken rejects', async () => {
    const expiredExp = Math.floor(Date.now() / 1000) - 60;
    const token = await new SignJWT({
      user_id: '123',
      group_id: '456',
      item_ids: [ '210', '220' ],
      date: todayDateStr(),
      exp: expiredExp,
    })
      .setProtectedHeader({ alg: 'RS512' })
      .setExpirationTime(expiredExp)
      .sign(privateKey);

    await expect(parseGroupResultsToken(token, publicKeyPem))
      .rejects.toThrow(AuthenticationError);

    const result = await parseGroupResultsTokenSignatureOnly(token, publicKeyPem);
    expect(result).toEqual({
      userId: '123',
      groupId: '456',
      itemIds: [ '210', '220' ],
      raw: token,
    });
  });
});
