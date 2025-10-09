import { API } from 'lambda-api';
import { createMessage, getAllMessages } from './services/messages';

const routes = (api: API): void => {
  api.get('/message', getAllMessages);
  api.post('/message', createMessage);
};

export default routes;
