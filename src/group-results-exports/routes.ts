import { API } from 'lambda-api';
import { EventBusServer } from '../utils/lambda-eventbus-server';
import { requireIdentityToken } from '../auth/identity-token-middleware';
import { requireGroupResultsToken } from './token';
import { requestExport } from './handlers/request-export';
import { getDownloadUrl } from './handlers/download-url';
import { handleExportCompleted } from './handlers/on-export-completed';
import { groupResultsExportCompletedEvent } from '../events/group-results-export-completed';

const restRoutes = (api: API): void => {
  api.post('/', requireGroupResultsToken, requestExport);
  api.get('/:exportId/download-url', requireIdentityToken, getDownloadUrl);
};

const eventHandlers = (eb: EventBusServer): void => {
  eb.on(groupResultsExportCompletedEvent, handleExportCompleted, { supportedMajorVersion: 1 });
};

export {
  restRoutes as groupResultsExportRoutes,
  eventHandlers as groupResultsExportEventHandlers,
};
