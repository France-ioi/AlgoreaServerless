import { HandlerFunction } from 'lambda-api';
import { RequestWithIdentityToken } from '../auth/identity-token-middleware';
import { validationsTable } from '../dbmodels/validations';

interface ValidatedTaskEntry {
  time: number,
  participantId: string,
  itemId: string,
  answerId: string,
}

interface ValidationResponse {
  validations: ValidatedTaskEntry[],
}

/**
 * GET /validations
 * Returns the latest 30 validations (newest first).
 */
async function get(_req: RequestWithIdentityToken): Promise<ValidationResponse> {
  const result = await validationsTable.getLatest(30);
  return {
    validations: result.map(v => ({
      time: v.sk,
      participantId: v.participantId,
      itemId: v.itemId,
      answerId: v.answerId,
    })),
  };
}

export const getLatestValidations = get as unknown as HandlerFunction;
