import { ALBEvent, APIGatewayProxyEvent, Context } from 'aws-lambda';
import createAPI from 'lambda-api';
import createWsServer from './utils/lambda-ws-server';
import { forumRoutes, forumWsActions } from './forum/routes';
import { portalRoutes } from './portal/routes';
import errorHandlingMiddleware from './middlewares/error-handling';
import corsMiddleware from './middlewares/cors';

/////////////////////////////////////////////////////////////////////////////////////////////
// HTTP REST handlers
/////////////////////////////////////////////////////////////////////////////////////////////

const api = createAPI({
  base: 'sls',
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


/////////////////////////////////////////////////////////////////////////////////////////////
// WEBSOCKET handlers
/////////////////////////////////////////////////////////////////////////////////////////////

const wsServer = createWsServer();

wsServer.register(forumWsActions, { prefix: 'forum' });
wsServer.on('heartbeat', () => {});


/////////////////////////////////////////////////////////////////////////////////////////////
// GLOBAL handler
/////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Global handler for HTTP REST and WEBSOCKET requests.
 * `event` is of type `APIGatewayProxyHandler` while it may be an "ALBEvent" in practice... but the lamda-API
 * lib expects a `APIGatewayProxyHandler` even in this case.
 */
export async function globalHandler(event: APIGatewayProxyEvent|ALBEvent, context: Context): Promise<unknown> {
  if (event.httpMethod) {
    // event is a ALBEvent. But the lambda-API lib expects a `APIGatewayProxyHandler`
    return api.run(event as APIGatewayProxyEvent, context);

  } else if ('eventType' in event.requestContext) {
    return wsServer.handler(event as APIGatewayProxyEvent, context);

  } else {
    throw new Error('event not supported');
  }
}
