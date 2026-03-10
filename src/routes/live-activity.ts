import { WsServer } from '../utils/lambda-ws-server';
import { subscribe, unsubscribe } from '../handlers/live-activity-subscription';

const wsActions = (ws: WsServer): void => {
  ws.on('subscribe', subscribe);
  ws.on('unsubscribe', unsubscribe);
};

export { wsActions as liveActivityWsActions };
