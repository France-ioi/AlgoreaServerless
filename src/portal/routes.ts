import { API } from 'lambda-api';
import { getEntryState } from './handlers/entry-state';
import { createCheckoutSession } from './handlers/checkout-session';

const restRoutes = (api: API): void => {
  api.get('/entry-state', getEntryState);
  api.post('/checkout-session', createCheckoutSession);
};

export { restRoutes as portalRoutes };
