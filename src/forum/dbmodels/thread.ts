import { z } from 'zod';

export const threadIdSchema = z.object({ participantId: z.string(), itemId: z.string() });

export type ThreadId = z.infer<typeof threadIdSchema>;
