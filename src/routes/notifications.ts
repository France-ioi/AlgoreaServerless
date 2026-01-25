import { API } from 'lambda-api';
import { requireIdentityToken } from '../auth/identity-token-middleware';
import { getNotifications, deleteNotification, markAsRead } from '../handlers/notifications';

const restRoutes = (api: API): void => {
  api.get('/', requireIdentityToken, getNotifications);
  api.delete('/:sk', requireIdentityToken, deleteNotification);
  api.put('/:sk/mark-as-read', requireIdentityToken, markAsRead);
};

export { restRoutes as notificationRoutes };
