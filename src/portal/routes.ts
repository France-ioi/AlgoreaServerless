import { API } from 'lambda-api';
import { getEntryState } from './services/entry-state';
import { createCheckoutSession } from './services/checkout-session-handler';

const restRoutes = (api: API): void => {
  api.get('/entry-state', getEntryState);
  api.post('/checkout-session', createCheckoutSession);
};

export { restRoutes as portalRoutes };
