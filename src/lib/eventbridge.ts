/* eslint-disable @typescript-eslint/naming-convention */
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { randomUUID } from 'crypto';
import { ServerError } from '../utils/errors';
import { EventEnvelope } from '../utils/lambda-eventbus-server/event-envelope';

let client: EventBridgeClient | undefined;

function getClient(): EventBridgeClient {
  if (!client) {
    client = new EventBridgeClient({});
  }
  return client;
}

/** Reset cached client (for tests). */
export function resetEventBridgeClient(): void {
  client = undefined;
}

/**
 * Publish an outbound EventBridge event with the standard algorea envelope.
 * Source = `algoreaserverless.<STAGE>`, DetailType = `detailType`.
 */
export async function publishEvent(
  detailType: string,
  payload: unknown,
  requestId?: string,
): Promise<void> {
  const stage = process.env.STAGE;
  const eventBusName = process.env.EVENT_BUS_NAME;
  if (!stage) {
    throw new ServerError('STAGE is not configured');
  }
  if (!eventBusName) {
    throw new ServerError('EVENT_BUS_NAME is not configured');
  }

  const envelope: EventEnvelope = {
    version: '1.0',
    type: detailType,
    source_app: 'algoreaserverless',
    instance: stage,
    time: new Date().toISOString(),
    request_id: requestId ?? randomUUID(),
    payload,
  };

  const result = await getClient().send(new PutEventsCommand({
    Entries: [{
      EventBusName: eventBusName,
      Source: `algoreaserverless.${stage}`,
      DetailType: detailType,
      Detail: JSON.stringify(envelope),
    }],
  }));

  const entry = result.Entries?.[0];
  if (result.FailedEntryCount && result.FailedEntryCount > 0) {
    throw new ServerError(
      `EventBridge PutEvents failed: ${entry?.ErrorCode ?? 'unknown'} ${entry?.ErrorMessage ?? ''}`,
    );
  }
}
