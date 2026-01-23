import { EventBridgeEvent, Context } from 'aws-lambda';
import { eblog, EbLogContext } from './logger';
import { logError } from '../errors';
import {
  eventEnvelopeSchema,
  EventEnvelope,
  parseMajorVersion,
} from './event-envelope';

export { EventEnvelope } from './event-envelope';

/**
 * Handler function that receives the full parsed envelope.
 */
export type HandlerFunction = (envelope: EventEnvelope) => void | Promise<void>;

/**
 * Options for registering an event handler.
 */
export interface HandlerOptions {
  /** The major version this handler supports. Events with higher major versions will be rejected. */
  supportedMajorVersion: number,
}

interface RegisteredHandler {
  handler: HandlerFunction,
  options: HandlerOptions,
}

/**
 * A minimal EventBridge "server" responding to EventBridge events. Inspired by `lambda-ws-server`.
 * Unlike WebSocket, multiple handlers can be registered for the same event type and will run in parallel.
 *
 * The server parses the common event envelope (version, type, source_app, etc.) and passes
 * only the payload to handlers, along with metadata.
 */
export class EventBusServer {
  handlers: Map<string, RegisteredHandler[]> = new Map();

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
   *
   * @param detailType The EventBridge detail-type to handle
   * @param handler Function that receives the full parsed envelope
   * @param options Handler options including supported version
   */
  on(detailType: string, handler: HandlerFunction, options: HandlerOptions): void {
    const existing = this.handlers.get(detailType) || [];
    existing.push({ handler, options });
    this.handlers.set(detailType, existing);
  }

  /**
   * Main handler for EventBridge events.
   * Parses the common envelope, validates versions, and runs matching handlers in parallel.
   */
  async handler(event: EventBridgeEvent<string, unknown>, _context: Context): Promise<void> {
    const logCtx: EbLogContext = { event };
    const startTime = Date.now();
    const detailType = event['detail-type'];

    eblog(logCtx, 'event received');

    // Parse the common envelope
    const envelopeResult = eventEnvelopeSchema.safeParse(event.detail);
    if (!envelopeResult.success) {
      eblog(logCtx, 'failed to parse event envelope', { error: true });
      // eslint-disable-next-line no-console
      console.error('Event envelope parse error:', envelopeResult.error.message);
      return;
    }

    const envelope = envelopeResult.data;
    const eventMajorVersion = parseMajorVersion(envelope.version);

    const registeredHandlers = this.handlers.get(detailType);

    if (!registeredHandlers || registeredHandlers.length === 0) {
      eblog(logCtx, 'no handlers registered for event type', { detail_type: detailType });
      return;
    }

    // Filter handlers that support this version and run them
    const results = await Promise.allSettled(
      registeredHandlers.map(async ({ handler, options }) => {
        if (eventMajorVersion > options.supportedMajorVersion) {
          eblog(logCtx, 'handler skipped due to unsupported version', {
            event_version: envelope.version,
            supported_major: options.supportedMajorVersion,
          });
          return;
        }
        await handler(envelope);
      })
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
      handlers_count: registeredHandlers.length,
      has_errors: hasErrors,
    });
  }
}

function factory(): EventBusServer {
  return new EventBusServer();
}

export default factory;
