import { API } from 'lambda-api';
import { getEntryState } from './handlers/entry-state';
import { createCheckoutSession } from './handlers/checkout-session';
import { requirePortalToken } from './token';

const restRoutes = (api: API): void => {
  api.get('/entry-state', requirePortalToken, getEntryState);
  api.post('/checkout-session', requirePortalToken, createCheckoutSession);
};

export { restRoutes as portalRoutes };
