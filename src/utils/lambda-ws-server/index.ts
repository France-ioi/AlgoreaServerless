import { APIGatewayProxyEvent, Context, APIGatewayProxyResult } from 'aws-lambda';
import { Request } from './request';
import { RouteNotFound } from '../errors';
import { wslog, WsLogContext } from './logger';

interface RegisterOptions { prefix?: string }
type HandlerFunction = (req: Request) => void | Promise<void>;

/** Extended result type that allows handlers to return userId for logging */
export interface WsHandlerResult extends APIGatewayProxyResult {
  userId?: string,
}

type ConnectHandler = (event: APIGatewayProxyEvent) => WsHandlerResult | Promise<WsHandlerResult>;
type DisconnectHandler = (event: APIGatewayProxyEvent) => WsHandlerResult | Promise<WsHandlerResult>;

/**
 * A minimal websocket "server" responding to the API GW websocket requests. Inspired by `lambda-api`.
 */
export class WsServer {
  actions: Record<string, HandlerFunction> = {};
  private connectHandler?: ConnectHandler;
  private disconnectHandler?: DisconnectHandler;

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

  onConnect(handler: ConnectHandler): void {
    this.connectHandler = handler;
  }

  onDisconnect(handler: DisconnectHandler): void {
    this.disconnectHandler = handler;
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
    const logCtx: WsLogContext = { event };
    const startTime = Date.now();

    wslog(logCtx, 'request started');

    let result: WsHandlerResult;

    switch (event.requestContext.eventType) {
      case 'CONNECT':
        result = this.connectHandler
          ? await this.connectHandler(event)
          : { statusCode: 200, body: 'Connected' };
        break;
      case 'DISCONNECT':
        result = this.disconnectHandler
          ? await this.disconnectHandler(event)
          : { statusCode: 200, body: 'Disconnected' };
        break;
      case 'MESSAGE':
        result = await this.handleMessage(event);
        break;
      default:
        result = { statusCode: 500, body: `event type non supported: ${event.requestContext.eventType}` };
    }

    const elapsedMs = Date.now() - startTime;
    const isError = result.statusCode >= 400;

    wslog(logCtx, 'request complete', {
      resp_status: result.statusCode,
      resp_elapsed_ms: elapsedMs,
      resp_bytes_length: result.body?.length ?? 0,
      user_id: result.userId,
      resp_error_msg: isError ? result.body : undefined,
    });

    // Return standard APIGatewayProxyResult (without userId)
    return {
      statusCode: result.statusCode,
      body: result.body,
    };
  }
}

function factory(...opts: ConstructorParameters<typeof WsServer>): WsServer {
  return new WsServer(...opts);
}
export default factory;
export { Request as WsRequest };
