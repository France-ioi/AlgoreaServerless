import { API } from 'lambda-api';
import { createMessage, getAllMessages } from './handlers/messages';
import { WsServer } from '../utils/lambda-ws-server';
import { EventBusServer } from '../utils/lambda-eventbus-server';
import { subscribe, unsubscribe } from './handlers/thread-subscription';
import { handleSubmissionCreated } from './handlers/submission-created';

const restRoutes = (api: API): void => {
  api.get('/message', getAllMessages);
  api.post('/message', createMessage);
};

const wsActions = (ws: WsServer): void => {
  ws.on('subscribe', subscribe);
  ws.on('unsubscribe', unsubscribe);
};

const eventHandlers = (eb: EventBusServer): void => {
  eb.on('submission_created', handleSubmissionCreated, { supportedMajorVersion: 1 });
};

export { restRoutes as forumRoutes, wsActions as forumWsActions, eventHandlers as forumEventHandlers };
