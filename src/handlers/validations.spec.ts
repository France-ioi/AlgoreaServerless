import { clearTable } from '../testutils/db';
import { RequestWithIdentityToken } from '../auth/identity-token-middleware';
import { IdentityToken } from '../auth/identity-token';
import { getLatestValidations } from './validations';
import { Validations } from '../dbmodels/validations';
import { docClient } from '../dynamodb';

function mockRequestWithIdentityToken(token: IdentityToken): RequestWithIdentityToken {
  return {
    identityToken: token,
    headers: {},
    query: {},
    body: {},
    params: {},
  } as RequestWithIdentityToken;
}

describe('getLatestValidations', () => {
  let validations: Validations;
  const identityToken: IdentityToken = { userId: 'user-123', exp: 9999999999 };

  beforeEach(async () => {
    validations = new Validations(docClient);
    await clearTable();
  });

  it('should return empty array when no validations exist', async () => {
    const req = mockRequestWithIdentityToken(identityToken);
    const resp = {} as any;

    const result = await getLatestValidations(req, resp);

    expect(result).toEqual({ validations: [] });
  });

  it('should return validations in descending order', async () => {
    const baseTime = Date.now();
    await validations.insert(baseTime, {
      participantId: 'p1', itemId: 'i1', answerId: 'a1',
    });
    await validations.insert(baseTime + 100, {
      participantId: 'p2', itemId: 'i2', answerId: 'a2',
    });

    const req = mockRequestWithIdentityToken(identityToken);
    const resp = {} as any;

    const result = await getLatestValidations(req, resp);

    expect(result.validations).toHaveLength(2);
    expect(result.validations[0]?.participantId).toBe('p2');
    expect(result.validations[1]?.participantId).toBe('p1');
  });
});
