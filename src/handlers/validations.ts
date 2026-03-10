import { HandlerFunction } from 'lambda-api';
import { RequestWithIdentityToken } from '../auth/identity-token-middleware';
import { validationsTable, Validation } from '../dbmodels/validations';

interface ValidationsResponse {
  validations: Validation[],
}

/**
 * GET /validations
 * Returns the latest 30 validations (newest first).
 */
async function get(_req: RequestWithIdentityToken): Promise<ValidationsResponse> {
  const result = await validationsTable.getLatest(30);
  return { validations: result };
}

export const getLatestValidations = get as unknown as HandlerFunction;
