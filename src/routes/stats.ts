import { API } from 'lambda-api';
import { requireIdentityToken } from '../auth/identity-token-middleware';
import { getStats } from '../handlers/stats';

export const statsRoutes = (api: API): void => {
  api.get('/', requireIdentityToken, getStats);
};
