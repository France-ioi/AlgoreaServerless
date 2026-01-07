import { API } from 'lambda-api';
import { createMessage, getAllMessages } from './handlers/messages';
import { WsServer } from '../utils/lambda-ws-server';
import { subscribe, unsubscribe } from './handlers/thread-subscription';

const restRoutes = (api: API): void => {
  api.get('/message', getAllMessages);
  api.post('/message', createMessage);
};

const wsActions = (ws: WsServer): void => {
  ws.on('subscribe', subscribe);
  ws.on('unsubscribe', unsubscribe);
};

export { restRoutes as forumRoutes, wsActions as forumWsActions };
