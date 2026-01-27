import { ThreadFollows } from './thread-follows';
import { dynamodb } from '../../dynamodb';
import { clearTable } from '../../testutils/db';
import { ThreadId } from './thread';

describe('ThreadFollows', () => {
  let threadFollows: ThreadFollows;
  const threadId: ThreadId = { participantId: 'user123', itemId: 'item456' };

  beforeEach(async () => {
    threadFollows = new ThreadFollows(dynamodb);
    await clearTable();
  });

  describe('follow', () => {
    it('should add a user to thread followers', async () => {
      const userId = 'user-123';

      await threadFollows.follow(threadId, userId);

      const followers = await threadFollows.getFollowers(threadId);
      expect(followers).toHaveLength(1);
      expect(followers[0]?.userId).toBe(userId);
      expect(followers[0]?.sk).toBeGreaterThan(0);
    });

    it('should allow multiple users to follow the same thread', async () => {
      await threadFollows.follow(threadId, 'user-1');
      await threadFollows.follow(threadId, 'user-2');
      await threadFollows.follow(threadId, 'user-3');

      const followers = await threadFollows.getFollowers(threadId);
      expect(followers).toHaveLength(3);
      expect(followers.map(f => f.userId).sort()).toEqual([ 'user-1', 'user-2', 'user-3' ]);
    });

    it('should ignore if user is already following', async () => {
      const userId = 'user-123';

      await threadFollows.follow(threadId, userId);
      await threadFollows.follow(threadId, userId);

      const followers = await threadFollows.getFollowers(threadId);
      expect(followers).toHaveLength(1);
      expect(followers[0]?.userId).toBe(userId);
    });
  });

  describe('isFollowing', () => {
    it('should return true if user is following', async () => {
      const userId = 'user-123';
      await threadFollows.follow(threadId, userId);

      const result = await threadFollows.isFollowing(threadId, userId);
      expect(result).toBe(true);
    });

    it('should return false if user is not following', async () => {
      const result = await threadFollows.isFollowing(threadId, 'user-not-following');
      expect(result).toBe(false);
    });
  });

  describe('getFollowers', () => {
    it('should return empty array for thread with no followers', async () => {
      const followers = await threadFollows.getFollowers(threadId);
      expect(followers).toEqual([]);
    });

    it('should return all followers for a thread', async () => {
      await threadFollows.follow(threadId, 'user-1');
      await threadFollows.follow(threadId, 'user-2');

      const followers = await threadFollows.getFollowers(threadId);
      expect(followers).toHaveLength(2);
    });
  });

  describe('unfollow', () => {
    it('should remove a user from thread followers', async () => {
      const userId = 'user-123';
      await threadFollows.follow(threadId, userId);

      let followers = await threadFollows.getFollowers(threadId);
      expect(followers).toHaveLength(1);

      await threadFollows.unfollow(threadId, userId);

      followers = await threadFollows.getFollowers(threadId);
      expect(followers).toHaveLength(0);
    });

    it('should not affect other followers when unfollowing one', async () => {
      await threadFollows.follow(threadId, 'user-1');
      await threadFollows.follow(threadId, 'user-2');
      await threadFollows.follow(threadId, 'user-3');

      await threadFollows.unfollow(threadId, 'user-2');

      const followers = await threadFollows.getFollowers(threadId);
      expect(followers).toHaveLength(2);
      expect(followers.map(f => f.userId).sort()).toEqual([ 'user-1', 'user-3' ]);
    });

    it('should handle unfollowing when not following gracefully', async () => {
      await expect(
        threadFollows.unfollow(threadId, 'non-existent-user')
      ).resolves.not.toThrow();
    });
  });

  describe('thread isolation', () => {
    it('should isolate followers between different threads', async () => {
      const thread1: ThreadId = { participantId: 'user1', itemId: 'item1' };
      const thread2: ThreadId = { participantId: 'user2', itemId: 'item2' };

      await threadFollows.follow(thread1, 'user-1');
      await threadFollows.follow(thread2, 'user-2');

      const thread1Followers = await threadFollows.getFollowers(thread1);
      const thread2Followers = await threadFollows.getFollowers(thread2);

      expect(thread1Followers).toHaveLength(1);
      expect(thread2Followers).toHaveLength(1);
      expect(thread1Followers[0]?.userId).toBe('user-1');
      expect(thread2Followers[0]?.userId).toBe('user-2');
    });
  });

  describe('setTtlForAllFollowers', () => {
    const pk = `${process.env.STAGE}#THREAD#${threadId.participantId}#${threadId.itemId}#FOLLOW`;

    it('should set TTL on all existing followers', async () => {
      await threadFollows.follow(threadId, 'user-1');
      await threadFollows.follow(threadId, 'user-2');

      const ttl = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      await threadFollows.setTtlForAllFollowers(threadId, ttl);

      // Verify TTL is set on both followers
      const result = await dynamodb.executeStatement({
        Statement: `SELECT ttl FROM "${process.env.TABLE_NAME}" WHERE pk = ?`,
        Parameters: [{ S: pk }],
      });
      expect(result.Items).toHaveLength(2);
      expect(result.Items?.[0]?.ttl?.N).toBe(String(ttl));
      expect(result.Items?.[1]?.ttl?.N).toBe(String(ttl));
    });

    it('should handle empty followers list gracefully', async () => {
      await expect(
        threadFollows.setTtlForAllFollowers(threadId, Math.floor(Date.now() / 1000) + 3600)
      ).resolves.not.toThrow();
    });
  });

  describe('removeTtlForAllFollowers', () => {
    const pk = `${process.env.STAGE}#THREAD#${threadId.participantId}#${threadId.itemId}#FOLLOW`;

    it('should remove TTL from all followers and return their userIds', async () => {
      // Add followers with TTL
      const ttl = Math.floor(Date.now() / 1000) + 3600;
      await threadFollows.follow(threadId, 'user-1', ttl);
      await threadFollows.follow(threadId, 'user-2', ttl);

      const userIds = await threadFollows.removeTtlForAllFollowers(threadId);

      // Verify return value
      expect(userIds.sort()).toEqual([ 'user-1', 'user-2' ]);

      // Verify TTL is removed from all followers
      const result = await dynamodb.executeStatement({
        Statement: `SELECT ttl FROM "${process.env.TABLE_NAME}" WHERE pk = ?`,
        Parameters: [{ S: pk }],
      });
      expect(result.Items).toHaveLength(2);
      expect(result.Items?.[0]?.ttl).toBeUndefined();
      expect(result.Items?.[1]?.ttl).toBeUndefined();
    });

    it('should return empty array for thread with no followers', async () => {
      const userIds = await threadFollows.removeTtlForAllFollowers(threadId);
      expect(userIds).toEqual([]);
    });
  });
});
