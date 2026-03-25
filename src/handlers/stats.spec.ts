import { clearTable } from '../testutils/db';
import { RequestWithIdentityToken } from '../auth/identity-token-middleware';
import { IdentityToken } from '../auth/identity-token';
import { getStats } from './stats';
import { Validations } from '../dbmodels/validations';
import { ValidationCounts } from '../dbmodels/validation-counts';
import { userConnectionsTable } from '../dbmodels/user-connections';
import { docClient } from '../dynamodb';

/** Valid base64 connectionIds (see user-connections.spec). */
const connA = 'L0SM9cOFIAMCIdw=';
const connB = 'dGVzdENvbm4=';

function mockRequestWithIdentityToken(token: IdentityToken): RequestWithIdentityToken {
  return {
    identityToken: token,
    headers: {},
    query: {},
    body: {},
    params: {},
  } as RequestWithIdentityToken;
}

describe('getStats', () => {
  let validations: Validations;
  let validationCounts: ValidationCounts;
  const identityToken: IdentityToken = { userId: 'user-123', exp: 9999999999 };

  beforeEach(async () => {
    validations = new Validations(docClient);
    validationCounts = new ValidationCounts(docClient);
    await clearTable();
  });

  it('should return windowed stats for validations and active users', async () => {
    const now = new Date('2026-03-10T12:00:00Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    try {
      await validations.insert(now - 23 * 60 * 60 * 1000, {
        participantId: 'p-recent-1', itemId: 'i-recent-1', answerId: 'a-recent-1',
      });
      await validations.insert(now - 2 * 60 * 60 * 1000, {
        participantId: 'p-recent-2', itemId: 'i-recent-2', answerId: 'a-recent-2',
      });
      await validations.insert(now - 25 * 60 * 60 * 1000, {
        participantId: 'p-old', itemId: 'i-old', answerId: 'a-old',
      });

      await validationCounts.incrementDay(new Date('2026-03-08T10:00:00Z').getTime());
      await validationCounts.incrementDay(new Date('2026-03-09T10:00:00Z').getTime());
      await validationCounts.incrementDay(new Date('2026-03-10T10:00:00Z').getTime());
      await validationCounts.incrementDay(new Date('2026-03-10T11:00:00Z').getTime());

      await validationCounts.incrementDay(new Date('2025-12-01T10:00:00Z').getTime());

      const req = mockRequestWithIdentityToken(identityToken);
      const resp = {} as any;

      const result = await getStats(req, resp);
      expect(result).toEqual({
        validations: { last24h: 2, last30d: 4, last1y: 5 },
        activeUsers: { last24h: 0, last30d: 0, last1y: 0 },
        connectedUsers: 0,
      });
    } finally {
      jest.restoreAllMocks();
    }
  });

  it('should return connectedUsers as distinct users with a live WebSocket', async () => {
    await userConnectionsTable.insert(connA, '8001');
    await userConnectionsTable.insert(connB, '8002');

    const req = mockRequestWithIdentityToken(identityToken);
    const result = await getStats(req, {} as any);

    expect(result.connectedUsers).toBe(2);
  });
});
