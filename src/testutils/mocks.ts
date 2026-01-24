import { ThreadToken } from '../forum/thread-token';

export const mockTokenData = (suffix: number | string, rest?: Partial<ThreadToken>): ThreadToken => ({
  participantId: `openThreadParticipantId-${suffix}`,
  itemId: `openThreadItemId-${suffix}`,
  userId: `openThreadUserId-${suffix}`,
  isMine: true,
  canWatch: true,
  canWrite: true,
  ...rest,
});
