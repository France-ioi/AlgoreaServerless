import { API } from 'lambda-api';
import { EventBusServer } from '../utils/lambda-eventbus-server';
import { requireIdentityToken } from '../auth/identity-token-middleware';
import { getLatestValidations } from '../handlers/validations';
import { handleGradeSaved } from '../handlers/task-validation-storage';
import { gradeSavedEvent } from '../events/grade-saved';

const restRoutes = (api: API): void => {
  api.get('/', requireIdentityToken, getLatestValidations);
};

const eventHandlers = (eb: EventBusServer): void => {
  eb.on(gradeSavedEvent, handleGradeSaved, { supportedMajorVersion: 1 });
};

export { restRoutes as validationRoutes, eventHandlers as validationEventHandlers };
