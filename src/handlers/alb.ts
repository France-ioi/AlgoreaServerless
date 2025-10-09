import { ALBEvent, APIGatewayProxyEvent, Context } from 'aws-lambda';
import createAPI, { Request, Response } from 'lambda-api';
import forumRoutes from '../forum/routes';
import errorHandlingMiddleware from '../middlewares/error-handling';
import corsMiddleware from '../middlewares/cors';

const api = createAPI({
  base: 'sls',
  logger: true,
});

// middlewares
api.use(errorHandlingMiddleware);
api.use(corsMiddleware);

// OPTION handling (cors headers are injected by the middleware)
api.options('/*', (_req: Request, res: Response) => {
  res.status(200).send({});
});

// routes registration
api.register(forumRoutes, { prefix: '/forum' });

export async function handler(event: ALBEvent, context: Context): Promise<unknown> {
  return api.run(event as unknown as APIGatewayProxyEvent, context);
}
