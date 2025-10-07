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
    const results = await this.sqlRead({
      query: `SELECT sk, label, data FROM "${this.tableName}" WHERE pk = ? AND label = ? ORDER BY sk DESC`,
      params: [ pk(threadId), ThreadEventLabel.Message ],
      limit: options.limit,
    });
    return results
      .map(r => threadEventSchema.safeParse(r))
      .filter(r => r.success)
      .map(r => r.data);
  }
}
