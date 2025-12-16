import { APIGatewayProxyEvent, Context, APIGatewayProxyResult } from 'aws-lambda';
import { Request } from './request';
import { RouteNotFound } from '../errors';

interface RegisterOptions { prefix?: string }
type HandlerFunction = (req: Request) => void | Promise<void>;

/**
 * A minimal websocket "server" responding to the API GW websocket requests. Inspired by `lambda-api`.
 */
export class WsServer {
  actions: Record<string, HandlerFunction> = {};

  register(subActions: (api: WsServer) => void, options?: RegisterOptions): void {
    const subServer = new WsServer();
    subActions(subServer);
    const prefix = options?.prefix ? options.prefix + '.' : '';

    Object.entries(subServer.actions).forEach(([ actionName, handler ]) => {
      this.actions[prefix + actionName] = handler;
    });
  }

  on(action: string, handler: HandlerFunction): void {
    this.actions[action] = handler;
  }

  private async handleMessage(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
      const request = new Request(event);
      const handler = this.actions[request.action()];
      if (!handler) throw new RouteNotFound(`action not found: ${request.action()}`);
      await handler(request);
    } catch (e) {
      // WebSocket MESSAGE responses don't support meaningful status codes like REST endpoints do.
      // The connection is already established, so we return 500 with the error message in the body.
      // To be improved for a better error handling on the client side.
      return { statusCode: 500, body: 'error: '+String(e) };
    }
    return { statusCode: 200, body: 'ok' };
  }

  async handler(event: APIGatewayProxyEvent, _context: Context): Promise<APIGatewayProxyResult> {
    const okResult = { statusCode: 200, body: 'ok' };

    switch (event.requestContext.eventType) {
      case 'CONNECT': return okResult;
      case 'DISCONNECT': return okResult;
      case 'MESSAGE': return this.handleMessage(event);
      default: return { statusCode: 500, body: `event type non supported: ${event.requestContext.eventType}` };
    }
  }
}

function factory(...opts: ConstructorParameters<typeof WsServer>): WsServer {
  return new WsServer(...opts);
}
export default factory;
export { Request as WsRequest };
