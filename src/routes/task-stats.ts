import { API } from 'lambda-api';
import { requirePermissionsToken } from '../auth/permissions-token';
import { getItemStats } from '../handlers/item-stats';

export const taskStatsRoutes = (api: API): void => {
  api.get('/', requirePermissionsToken({ requireEditAll: true }), getItemStats);
};
