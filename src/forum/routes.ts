import { API } from 'lambda-api';
import { createMessage, getAllMessages } from './handlers/messages';
import { WsServer } from '../utils/lambda-ws-server';
import { EventBusServer } from '../utils/lambda-eventbus-server';
import { subscribe, unsubscribe } from './handlers/thread-subscription';
import { handleSubmissionCreated } from './handlers/submission-created';
import { handleThreadStatusChanged } from './handlers/thread-status-changed';
import { handleGradeSaved } from './handlers/grade-saved';
import { requireThreadToken } from './thread-token';
import { requireIdentityToken } from '../auth/identity-token-middleware';
import { followThread, unfollowThread } from './handlers/thread-follow';

const restRoutes = (api: API): void => {
  api.get('/message', requireThreadToken, getAllMessages);
  api.post('/message', requireThreadToken, createMessage);
  api.post('/follow', requireThreadToken, followThread);
  api.delete('/follow', requireIdentityToken, unfollowThread);
};

const wsActions = (ws: WsServer): void => {
  ws.on('subscribe', subscribe);
  ws.on('unsubscribe', unsubscribe);
};

const eventHandlers = (eb: EventBusServer): void => {
  eb.on('submission_created', handleSubmissionCreated, { supportedMajorVersion: 1 });
  eb.on('thread_status_changed', handleThreadStatusChanged, { supportedMajorVersion: 1 });
  eb.on('grade_saved', handleGradeSaved, { supportedMajorVersion: 1 });
};

export { restRoutes as forumRoutes, wsActions as forumWsActions, eventHandlers as forumEventHandlers };
