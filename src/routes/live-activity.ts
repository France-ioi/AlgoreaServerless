import { WsServer } from '../utils/lambda-ws-server';
import { EventBusServer } from '../utils/lambda-eventbus-server';
import { subscribe, unsubscribe } from '../handlers/live-activity-subscription';
import { handleGradeSaved } from '../handlers/live-activity-grade-saved';
import { gradeSavedEvent } from '../events/grade-saved';

const wsActions = (ws: WsServer): void => {
  ws.on('subscribe', subscribe);
  ws.on('unsubscribe', unsubscribe);
};

const eventHandlers = (eb: EventBusServer): void => {
  eb.on(gradeSavedEvent, handleGradeSaved, { supportedMajorVersion: 1 });
};

export { wsActions as liveActivityWsActions, eventHandlers as liveActivityEventHandlers };
