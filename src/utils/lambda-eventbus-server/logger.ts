import { EventBridgeEvent } from 'aws-lambda';

export interface EbLogContext {
  event: EventBridgeEvent<string, unknown>,
}

export interface EbLogExtra {
  [key: string]: string | number | boolean | undefined,
}

/**
 * Logs a structured EventBridge event message.
 */
export function eblog(ctx: EbLogContext, msg: string, extra?: EbLogExtra): void {
  const { event } = ctx;

  const logEntry = {
    level: extra?.error === true ? 'error' : 'info',
    msg,
    type: 'eventbus',
    event_id: event.id,
    detail_type: event['detail-type'],
    source: event.source,
    time: event.time,
    account: event.account,
    region: event.region,
    ...extra,
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(logEntry));
}
