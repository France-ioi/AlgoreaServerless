import { ApiGatewayManagementApi } from '@aws-sdk/client-apigatewaymanagementapi';
import { errorToString, ServerError } from './utils/errors';

export interface SendResult {
  success: boolean,
  connectionId: ConnectionId,
  error?: unknown,
}

export enum ForumMessageAction {
  NewMessage = 'forum.message.new',
  NewSubmission = 'forum.submission.new',
}

interface ForumNewMessage {
  action: ForumMessageAction.NewMessage,
  participantId: string,
  itemId: string,
  authorId: string,
  time: number,
  text: string,
  uuid: string,
}

interface ForumNewSubmission {
  action: ForumMessageAction.NewSubmission,
  answerId: string,
  participantId: string,
  itemId: string,
  attemptId: string,
  authorId: string,
  time: number,
}

type Message = ForumNewMessage | ForumNewSubmission;

/**
 * The websocket connection id. It is really a string!
 */
export type ConnectionId = string;

export function isClosedConnection(result: SendResult): boolean {
  return result.error instanceof Error && result.error.name === 'GoneException';
}

export function logSendResults(results: SendResult[]): void {
  if (results.some(r => !r.success)) {
    // eslint-disable-next-line no-console
    console.warn(
      `Message successfully sent to: ${results.filter(r => r.success).map(r => r.connectionId).join(', ')} and got error to: `,
      `${results.filter(r => !r.success).map(r => `${r.connectionId} [${errorToString(r.error)}]`).join(', ')}`
    );
  // eslint-disable-next-line no-console
  } else console.log(`Messages successfully sent to ${results.length} recipients.`);
}

class WSClient {
  api: ApiGatewayManagementApi;

  constructor() {
    if (process.env.STAGE === 'local') {
      this.api = new ApiGatewayManagementApi({ apiVersion: '2018-11-29', endpoint: 'http://localhost:3001' });
    } else {
      const endpoint = process.env.APIGW_ENDPOINT;
      if (!endpoint) throw new ServerError('APIGW_ENDPOINT is not defined');
      this.api = new ApiGatewayManagementApi({ apiVersion: '2018-11-29', endpoint: endpoint });
    }
  }

  private async sendMessages(connectionId: string, message: Message): Promise<SendResult> {
    return await this.api.postToConnection({
      // AWS uses PascalCase for naming convention while we don't. Deactivate the rule for AWS functions and re-enable it right after.
      /* eslint-disable @typescript-eslint/naming-convention */
      ConnectionId: connectionId,
      Data: Buffer.from(JSON.stringify(message)),
      /* eslint-enable @typescript-eslint/naming-convention */
    })
      .then(() => ({ success: true, connectionId }))
      .catch(err => ({ success: false, connectionId, error: err as unknown }));
  }

  /**
   * Sends messages to the given `connectionId`'s. The promise never fails but the returned results may be successes or failures.
   */
  async send(connectionIds: string[], message: Message): Promise<SendResult[]> {
    const uniqueIds = [ ...new Set(connectionIds) ];
    return await Promise.all(uniqueIds.map(connectionId => this.sendMessages(connectionId, message)));
  }

}

export const wsClient = new WSClient();
