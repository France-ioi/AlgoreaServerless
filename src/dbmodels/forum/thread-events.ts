import { ForumTable } from '../table';
import { ThreadId } from './thread';
import { literal, z } from 'zod';

/**
 * DB labels of the thread events
 */
export enum ThreadEventLabel {
  Message = 'forum.message',
}

const threadEventBaseSchema = z.object({
  sk: z.number(),
  label: z.string(),
  data: z.record(z.string(), z.unknown()),
});

const threadMessageSchema = threadEventBaseSchema.safeExtend({
  label: literal(ThreadEventLabel.Message),
  data: z.object({
    authorId: z.string(),
    text: z.string(),
    uuid: z.string(),
  }),
});
const threadEventSchema = z.discriminatedUnion('label', [ threadMessageSchema ]);

type ThreadEvent = z.infer<typeof threadEventSchema>;
type ThreadMessage = z.infer<typeof threadMessageSchema>;

function pk(threadId: ThreadId): string {
  const stage = process.env.STAGE || 'dev';
  return `${stage}#THREAD#${threadId.participantId}#${threadId.itemId}#EVENTS`;
}

/**
 * Thread events are stored in the database with the following schema:
 * - pk: see above
 * - sk: event time
 * - label: the type of event
 * - createdBy: the user id of the creator
 * - data: the event data
 */
export class ThreadEvents extends ForumTable {

  /**
   * Insert multiple thread events
   * ! They must have different timestamp values !
   */
  async insert(events: (ThreadEvent & { threadId: ThreadId })[]): Promise<void> {
    await this.batchUpdate(events.map(({ sk, label, data, threadId }) => ({ sk, label, data, pk: pk(threadId) })));
  }

  async getAllMessages(threadId: ThreadId, options: { limit: number }): Promise<ThreadMessage[]> {
    // Known limitation: DynamoDB applies limit BEFORE FilterExpression.
    // If there are many non-message events, this may return fewer results than expected
    // (or even zero results if the first 'limit' items are all non-messages).
    // Workaround: Use a dedicated GSI with label as sort key, or accept this limitation.
    const results = await this.query({
      pk: pk(threadId),
      filter: { attribute: 'label', value: ThreadEventLabel.Message },
      projectionAttributes: [ 'sk', 'label', 'data' ],
      limit: options.limit,
      scanIndexForward: false, // false = DESC order
    });
    return results
      .map(r => threadEventSchema.safeParse(r))
      .filter(r => r.success)
      .map(r => r.data);
  }
}
