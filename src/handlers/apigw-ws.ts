import { APIGatewayProxyHandler } from 'aws-lambda';
import createWsServer from '../utils/lambda-ws-server';
import { forumWsActions } from '../forum/routes';

const wsServer = createWsServer();

wsServer.register(forumWsActions, { prefix: 'forum' });
wsServer.on('heartbeat', () => {});

export const handler: APIGatewayProxyHandler = (event, context) => wsServer.handler(event, context);
