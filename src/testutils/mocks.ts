import { ForumToken } from '../handlers/forum-parse';

export const mockTokenData = (suffix: number | string, rest?: Partial<ForumToken>): ForumToken => ({
  participantId: `openThreadParticipantId-${suffix}`,
  itemId: `openThreadItemId-${suffix}`,
  userId: `openThreadUserId-${suffix}`,
  isMine: true,
  canWatch: true,
  canWrite: true,
  ...rest,
});
