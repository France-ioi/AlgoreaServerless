import { APIGatewayProxyEvent } from 'aws-lambda';
import { DecodingError } from '../errors';
import * as z from 'zod';

export class Request {
  public body: { [x: string]: unknown, action: string };
  private event: APIGatewayProxyEvent;

  constructor(event: APIGatewayProxyEvent) {
    this.event = event;
    this.body = this.parseBody();
  }

  private parseBody(): typeof this.body {
    const body = this.event.body;
    if (!body) throw new DecodingError('undefined and empty body in the event');
    let jsonBody: unknown;
    try {
      jsonBody = JSON.parse(body);
    } catch {
      throw new DecodingError('the body is not valid JSON');
    }
    const result = z.looseObject({ action: z.string() }).safeParse(jsonBody);
    if (!result.success) throw new DecodingError(`the body is not an object with an action: ${body}`);
    return result.data;
  }

  public action(): string {
    return this.body.action;
  }

  public requestId(): APIGatewayProxyEvent['requestContext']['requestId'] {
    return this.event.requestContext.requestId;
  }

  public requestTimeEpoch(): APIGatewayProxyEvent['requestContext']['requestTimeEpoch'] {
    return this.event.requestContext.requestTimeEpoch;
  }

  public connectionId(): string {
    const connectionId = this.event.requestContext.connectionId;
    if (!connectionId) throw new DecodingError('A WS message is expected to always have a connection id!');
    return connectionId;
  }

}
