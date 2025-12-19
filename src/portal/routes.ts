import { API } from 'lambda-api';
import { getEntryState } from './services/entry-state';

const restRoutes = (api: API): void => {
  api.get('/entry-state', getEntryState);
};

export { restRoutes as portalRoutes };
