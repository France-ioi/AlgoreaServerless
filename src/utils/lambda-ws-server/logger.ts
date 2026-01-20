import { APIGatewayProxyEvent } from 'aws-lambda';

export interface WsLogContext {
  event: APIGatewayProxyEvent,
}

export interface WsLogExtra {
  [key: string]: string | number | undefined,
}

/**
 * Parses the requestTime string from API Gateway format to ISO format.
 * Input format: "19/Jan/2026:15:58:25 +0000"
 * Output format: "2026-01-19T15:58:25.000Z"
 */
function parseRequestTime(requestTime: string | undefined): string {
  if (!requestTime) {
    return new Date().toISOString();
  }

  /* eslint-disable @typescript-eslint/naming-convention */
  const months: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  };
  /* eslint-enable @typescript-eslint/naming-convention */

  // Parse "19/Jan/2026:15:58:25 +0000"
  const match = requestTime.match(/^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})/);
  if (!match) {
    return new Date().toISOString();
  }

  const day = match[1];
  const monthStr = match[2];
  const year = match[3];
  const hour = match[4];
  const minute = match[5];
  const second = match[6];
  const month = (monthStr && months[monthStr]) || '01';

  return `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
}

/**
 * Logs a structured WebSocket event message.
 */
export function wslog(ctx: WsLogContext, msg: string, extra?: WsLogExtra): void {
  const { event } = ctx;
  const requestContext = event.requestContext;

  const logEntry = {
    level: 'info',
    msg,
    remote_addr: requestContext.identity?.sourceIp ?? '',
    connection_id: requestContext.connectionId ?? '',
    time: parseRequestTime(requestContext.requestTime),
    type: 'ws',
    event_type: requestContext.eventType ?? '',
    route_key: requestContext.routeKey ?? '',
    user_agent: requestContext.identity?.userAgent ?? '',
    request_id: requestContext.requestId ?? '',
    ...extra,
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(logEntry));
}
