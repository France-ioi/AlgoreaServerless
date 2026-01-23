import { EventBridgeEvent, Context } from 'aws-lambda';
import { eblog, EbLogContext } from './logger';
import { logError } from '../errors';

type HandlerFunction<T = unknown> = (event: EventBridgeEvent<string, T>) => void | Promise<void>;

/**
 * A minimal EventBridge "server" responding to EventBridge events. Inspired by `lambda-ws-server`.
 * Unlike WebSocket, multiple handlers can be registered for the same event type and will run in parallel.
 */
export class EventBusServer {
  handlers: Map<string, HandlerFunction[]> = new Map();

  /**
   * Register handlers from a sub-module.
   * Unlike WsServer, no prefix is used since event types are global concepts.
   */
  register(subHandlers: (server: EventBusServer) => void): void {
    subHandlers(this);
  }

  /**
   * Register a handler for a specific detail-type.
   * Multiple handlers can be registered for the same event type.
   */
  on<T>(detailType: string, handler: HandlerFunction<T>): void {
    const existing = this.handlers.get(detailType) || [];
    existing.push(handler as HandlerFunction);
    this.handlers.set(detailType, existing);
  }

  /**
   * Main handler for EventBridge events.
   * Runs all registered handlers for the event's detail-type in parallel.
   */
  async handler(event: EventBridgeEvent<string, unknown>, _context: Context): Promise<void> {
    const logCtx: EbLogContext = { event };
    const startTime = Date.now();
    const detailType = event['detail-type'];

    eblog(logCtx, 'event received');

    const handlers = this.handlers.get(detailType);

    if (!handlers || handlers.length === 0) {
      eblog(logCtx, 'no handlers registered for event type', { detail_type: detailType });
      return;
    }

    // Run all handlers in parallel, catching errors individually
    const results = await Promise.allSettled(
      handlers.map(h => h(event))
    );

    // Log any errors from handlers
    let hasErrors = false;
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        hasErrors = true;
        logError(result.reason);
        eblog(logCtx, `handler ${index} failed`, { error: true });
      }
    });

    const elapsedMs = Date.now() - startTime;
    eblog(logCtx, 'event processing complete', {
      elapsed_ms: elapsedMs,
      handlers_count: handlers.length,
      has_errors: hasErrors,
    });
  }
}

function factory(): EventBusServer {
  return new EventBusServer();
}

export default factory;
