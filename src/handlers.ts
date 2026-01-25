import { ALBEvent, APIGatewayProxyEvent, Context, EventBridgeEvent } from 'aws-lambda';
import createAPI from 'lambda-api';
import createWsServer from './utils/lambda-ws-server';
import createEventBusServer from './utils/lambda-eventbus-server';
import { forumRoutes, forumWsActions, forumEventHandlers } from './forum/routes';
import { portalRoutes } from './portal/routes';
import { notificationRoutes } from './routes/notifications';
import errorHandlingMiddleware from './middlewares/error-handling';
import corsMiddleware from './middlewares/cors';
import { handleConnect, handleDisconnect } from './websocket/handlers';

/////////////////////////////////////////////////////////////////////////////////////////////
// HTTP REST handlers
/////////////////////////////////////////////////////////////////////////////////////////////

const api = createAPI({
  base: process.env.API_BASE,
  logger: true,
});

// middlewares
api.use(errorHandlingMiddleware);
api.use(corsMiddleware);

// OPTION handling (cors headers are injected by the middleware)
api.options('/*', () => ({}));

// routes registration
api.register(forumRoutes, { prefix: '/forum' });
api.register(portalRoutes, { prefix: '/portal' });
api.register(notificationRoutes, { prefix: '/notifications' });


/////////////////////////////////////////////////////////////////////////////////////////////
// WEBSOCKET handlers
/////////////////////////////////////////////////////////////////////////////////////////////

const wsServer = createWsServer();

// Common websocket lifecycle handlers
wsServer.onConnect(handleConnect);
wsServer.onDisconnect(handleDisconnect);

// Action handlers
wsServer.register(forumWsActions, { prefix: 'forum' });
wsServer.on('heartbeat', () => {});


/////////////////////////////////////////////////////////////////////////////////////////////
// EVENTBUS handlers
/////////////////////////////////////////////////////////////////////////////////////////////

const ebServer = createEventBusServer();

// Event handlers registration
ebServer.register(forumEventHandlers);


/////////////////////////////////////////////////////////////////////////////////////////////
// GLOBAL handler
/////////////////////////////////////////////////////////////////////////////////////////////

type GlobalEvent = APIGatewayProxyEvent | ALBEvent | EventBridgeEvent<string, unknown>;

function isHttpEvent(event: GlobalEvent): event is APIGatewayProxyEvent | ALBEvent {
  return 'httpMethod' in event;
}

function isWebSocketEvent(event: GlobalEvent): event is APIGatewayProxyEvent {
  return 'requestContext' in event &&
    typeof event.requestContext === 'object' &&
    event.requestContext !== null &&
    'eventType' in event.requestContext;
}

function isEventBridgeEvent(event: GlobalEvent): event is EventBridgeEvent<string, unknown> {
  return 'detail-type' in event;
}

/**
 * Global handler for HTTP REST, WEBSOCKET, and EVENTBUS requests.
 * `event` is of type `APIGatewayProxyHandler` while it may be an "ALBEvent" in practice... but the lamda-API
 * lib expects a `APIGatewayProxyHandler` even in this case.
 */
export async function globalHandler(event: GlobalEvent, context: Context): Promise<unknown> {
  if (isHttpEvent(event)) {
    // event is a ALBEvent. But the lambda-API lib expects a `APIGatewayProxyHandler`
    return api.run(event as APIGatewayProxyEvent, context);

  } else if (isWebSocketEvent(event)) {
    return wsServer.handler(event, context);

  } else if (isEventBridgeEvent(event)) {
    return ebServer.handler(event, context);

  } else {
    // eslint-disable-next-line no-console
    console.error('Unsupported event type received:', JSON.stringify(event, null, 2));
    throw new Error('event not supported');
  }
}
