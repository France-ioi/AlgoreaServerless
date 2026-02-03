import { clearTable } from '../../testutils/db';
import { ThreadToken, RequestWithThreadToken } from '../thread-token';
import { IdentityToken } from '../../auth/identity-token';
import { RequestWithIdentityToken } from '../../auth/identity-token-middleware';
import { followThread, unfollowThread, getFollowStatus } from './thread-follow';
import { ThreadFollows } from '../dbmodels/thread-follows';
import { dynamodb } from '../../dynamodb';

/** Helper to create a mock request with threadToken already set (as middleware would do) */
function mockRequestWithThreadToken(token: ThreadToken, extras: Partial<RequestWithThreadToken> = {}): RequestWithThreadToken {
  return {
    threadToken: token,
    headers: {},
    query: {},
    body: {},
    params: {},
    ...extras,
  } as RequestWithThreadToken;
}

/** Helper to create a mock request with identityToken already set (as middleware would do) */
function mockRequestWithIdentityToken(
  token: IdentityToken,
  extras: Partial<RequestWithIdentityToken> = {}
): RequestWithIdentityToken {
  return {
    identityToken: token,
    headers: {},
    query: {},
    body: {},
    params: {},
    ...extras,
  } as RequestWithIdentityToken;
}

/** Helper to create a mock response object */
function mockResponse(): { status: jest.Mock } {
  return { status: jest.fn() };
}

describe('Thread Follow Handlers', () => {
  let threadFollows: ThreadFollows;
  const threadId = { participantId: 'user123', itemId: 'item456' };

  beforeEach(async () => {
    threadFollows = new ThreadFollows(dynamodb);
    await clearTable();
  });

  describe('followThread', () => {
    const baseToken: ThreadToken = {
      ...threadId,
      userId: 'user-123',
      canWrite: false,
      canWatch: true,
      isMine: false,
    };

    it('should add user as follower and return 201', async () => {
      const req = mockRequestWithThreadToken(baseToken);
      const resp = mockResponse();

      const result = await followThread(req, resp as any);

      expect(resp.status).toHaveBeenCalledWith(201);
      expect(result).toEqual({ message: 'created', success: true });

      const followers = await threadFollows.getFollowers(threadId);
      expect(followers).toHaveLength(1);
      expect(followers[0]?.userId).toBe('user-123');
    });

    it('should ignore if user is already following', async () => {
      await threadFollows.insert(threadId, 'user-123');

      const req = mockRequestWithThreadToken(baseToken);
      const resp = mockResponse();

      const result = await followThread(req, resp as any);

      expect(resp.status).toHaveBeenCalledWith(201);
      expect(result).toEqual({ message: 'created', success: true });

      const followers = await threadFollows.getFollowers(threadId);
      expect(followers).toHaveLength(1);
    });
  });

  describe('unfollowThread', () => {
    const identityToken: IdentityToken = { userId: 'user-123', exp: 9999999999 };

    it('should remove user from followers and return 200', async () => {
      await threadFollows.insert(threadId, 'user-123');

      const req = mockRequestWithIdentityToken(identityToken, {
        params: { participantId: 'user123', itemId: 'item456' },
      });
      const resp = mockResponse();

      const result = await unfollowThread(req, resp as any);

      expect(resp.status).toHaveBeenCalledWith(200);
      expect(result).toEqual({ message: 'deleted', success: true });

      const followers = await threadFollows.getFollowers(threadId);
      expect(followers).toHaveLength(0);
    });

    it('should ignore if user is not following', async () => {
      const req = mockRequestWithIdentityToken(identityToken, {
        params: { participantId: 'user123', itemId: 'item456' },
      });
      const resp = mockResponse();

      const result = await unfollowThread(req, resp as any);

      expect(resp.status).toHaveBeenCalledWith(200);
      expect(result).toEqual({ message: 'deleted', success: true });
    });

    it('should throw DecodingError when participantId is missing', async () => {
      const req = mockRequestWithIdentityToken(identityToken, {
        params: { itemId: 'item456' },
      });
      const resp = mockResponse();

      await expect(unfollowThread(req, resp as any)).rejects.toThrow('Missing path parameters');
    });

    it('should throw DecodingError when itemId is missing', async () => {
      const req = mockRequestWithIdentityToken(identityToken, {
        params: { participantId: 'user123' },
      });
      const resp = mockResponse();

      await expect(unfollowThread(req, resp as any)).rejects.toThrow('Missing path parameters');
    });

    it('should not affect other followers when unfollowing', async () => {
      await threadFollows.insert(threadId, 'user-123');
      await threadFollows.insert(threadId, 'user-456');

      const req = mockRequestWithIdentityToken(identityToken, {
        params: { participantId: 'user123', itemId: 'item456' },
      });
      const resp = mockResponse();

      await unfollowThread(req, resp as any);

      const followers = await threadFollows.getFollowers(threadId);
      expect(followers).toHaveLength(1);
      expect(followers[0]?.userId).toBe('user-456');
    });
  });

  describe('getFollowStatus', () => {
    const identityToken: IdentityToken = { userId: 'user-123', exp: 9999999999 };

    it('should return isFollowing: true when user is following', async () => {
      await threadFollows.insert(threadId, 'user-123');

      const req = mockRequestWithIdentityToken(identityToken, {
        params: { participantId: 'user123', itemId: 'item456' },
      });
      const resp = {} as any;

      const result = await getFollowStatus(req, resp);

      expect(result).toEqual({ isFollowing: true });
    });

    it('should return isFollowing: false when user is not following', async () => {
      const req = mockRequestWithIdentityToken(identityToken, {
        params: { participantId: 'user123', itemId: 'item456' },
      });
      const resp = {} as any;

      const result = await getFollowStatus(req, resp);

      expect(result).toEqual({ isFollowing: false });
    });

    it('should throw DecodingError when participantId is missing', async () => {
      const req = mockRequestWithIdentityToken(identityToken, {
        params: { itemId: 'item456' },
      });
      const resp = {} as any;

      await expect(getFollowStatus(req, resp)).rejects.toThrow('Missing path parameters');
    });

    it('should throw DecodingError when itemId is missing', async () => {
      const req = mockRequestWithIdentityToken(identityToken, {
        params: { participantId: 'user123' },
      });
      const resp = {} as any;

      await expect(getFollowStatus(req, resp)).rejects.toThrow('Missing path parameters');
    });
  });
});
