import { API } from 'lambda-api';
import { EventBusServer } from '../utils/lambda-eventbus-server';
import { requireNonReadonlyTaskToken } from '../auth/task-token';
import { startSession, continueSession, stopSession } from '../handlers/task-sessions';
import { handleGradeSavedActivity } from '../handlers/task-activity-score';
import { gradeSavedEvent } from '../events/grade-saved';

const restRoutes = (api: API): void => {
  api.post('/start', requireNonReadonlyTaskToken, startSession);
  api.post('/continue', requireNonReadonlyTaskToken, continueSession);
  api.post('/stop', requireNonReadonlyTaskToken, stopSession);
};

const eventHandlers = (eb: EventBusServer): void => {
  eb.on(gradeSavedEvent, handleGradeSavedActivity, { supportedMajorVersion: 1 });
};

export { restRoutes as taskActivityRoutes, eventHandlers as taskActivityEventHandlers };
