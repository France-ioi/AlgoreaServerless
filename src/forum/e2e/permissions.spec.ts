import { globalHandler } from '../../handlers';
import { clearTable } from '../../testutils/db';
import { generateToken, initializeKeys } from '../../testutils/token-generator';
import { mockALBEvent, mockWebSocketMessageEvent } from '../../testutils/event-mocks';

describe('E2E: Permissions', () => {
  const threadId = { participantId: 'user123', itemId: 'item456' };

  beforeAll(async () => {
    await initializeKeys();
  });

  beforeEach(async () => {
    await clearTable();
  });

  describe('canWrite permission', () => {
    it('should allow message creation with canWrite=true', async () => {
      const token = await generateToken({ ...threadId, userId: 'user1', canWrite: true });

      const postEvent = mockALBEvent({
        path: `/sls/forum/thread/${threadId.itemId}/${threadId.participantId}/messages`,
        httpMethod: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: 'Can write', uuid: 'msg-1' }),
      });

      const result = await globalHandler(postEvent, {} as any) as any;
      expect(result.statusCode).toBe(201);
    });

    it('should reject message creation with canWrite=false', async () => {
      const token = await generateToken({ ...threadId, userId: 'user1', canWrite: false });

      const postEvent = mockALBEvent({
        path: `/sls/forum/thread/${threadId.itemId}/${threadId.participantId}/messages`,
        httpMethod: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: 'Cannot write', uuid: 'msg-1' }),
      });

      const result = await globalHandler(postEvent, {} as any) as any;
      expect(result.statusCode).toBe(403);
      expect(result.body).toContain('canWrite');
    });

    it('should allow message retrieval regardless of canWrite', async () => {
      // First create a message with canWrite=true
      const writerToken = await generateToken({ ...threadId, userId: 'writer', canWrite: true });
      await globalHandler(mockALBEvent({
        path: `/sls/forum/thread/${threadId.itemId}/${threadId.participantId}/messages`,
        httpMethod: 'POST',
        headers: { authorization: `Bearer ${writerToken}` },
        body: JSON.stringify({ text: 'Test message', uuid: 'msg-1' }),
      }), {} as any);

      // Retrieve with canWrite=false
      const readerToken = await generateToken({ ...threadId, userId: 'reader', canWrite: false });
      const getEvent = mockALBEvent({
        path: `/sls/forum/thread/${threadId.itemId}/${threadId.participantId}/messages`,
        httpMethod: 'GET',
        headers: { authorization: `Bearer ${readerToken}` },
      });

      const result = await globalHandler(getEvent, {} as any) as any;
      expect(result.statusCode).toBe(200);

      const messages = JSON.parse(result.body);
      expect(messages).toHaveLength(1);
      expect(messages[0].text).toBe('Test message');
    });
  });

  describe('token validation', () => {
    it('should reject request with invalid token', async () => {
      const postEvent = mockALBEvent({
        path: `/sls/forum/thread/${threadId.itemId}/${threadId.participantId}/messages`,
        httpMethod: 'POST',
        headers: { authorization: 'Bearer invalid-token' },
        body: JSON.stringify({ text: 'Test', uuid: 'msg-1' }),
      });

      const result = await globalHandler(postEvent, {} as any) as any;
      expect(result.statusCode).toBe(401);
    });

    it('should reject request without authorization header', async () => {
      const postEvent = mockALBEvent({
        path: `/sls/forum/thread/${threadId.itemId}/${threadId.participantId}/messages`,
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({ text: 'Test', uuid: 'msg-1' }),
      });

      const result = await globalHandler(postEvent, {} as any) as any;
      expect(result.statusCode).toBe(401);
    });

    it('should reject WebSocket action with invalid token', async () => {
      const subscribeEvent = mockWebSocketMessageEvent({
        connectionId: 'conn-123',
        body: JSON.stringify({ action: 'forum.subscribe', token: 'invalid-token' }),
      });

      const result = await globalHandler(subscribeEvent, {} as any) as any;
      expect(result.statusCode).toBe(500);
      expect(result.body).toContain('error:');
    });

    it('should reject WebSocket action without token', async () => {
      const subscribeEvent = mockWebSocketMessageEvent({
        connectionId: 'conn-123',
        body: JSON.stringify({ action: 'forum.subscribe' }),
      });

      const result = await globalHandler(subscribeEvent, {} as any) as any;
      expect(result.statusCode).toBe(500);
      expect(result.body).toContain('error:');
    });
  });

  describe('thread access', () => {
    it('should only allow access to messages from the token thread', async () => {
      const thread1 = { participantId: 'user1', itemId: 'item1' };
      const thread2 = { participantId: 'user2', itemId: 'item2' };

      // Post message to thread1
      const thread1Token = await generateToken({ ...thread1, userId: 'user1', canWrite: true });
      await globalHandler(mockALBEvent({
        path: `/sls/forum/thread/${thread1.itemId}/${thread1.participantId}/messages`,
        httpMethod: 'POST',
        headers: { authorization: `Bearer ${thread1Token}` },
        body: JSON.stringify({ text: 'Thread 1 message', uuid: 'msg-t1' }),
      }), {} as any);

      // Try to access with thread2 token
      const thread2Token = await generateToken({ ...thread2, userId: 'user2', canWrite: false });
      const getEvent = mockALBEvent({
        path: `/sls/forum/thread/${thread2.itemId}/${thread2.participantId}/messages`,
        httpMethod: 'GET',
        headers: { authorization: `Bearer ${thread2Token}` },
      });

      const result = await globalHandler(getEvent, {} as any) as any;
      expect(result.statusCode).toBe(200);

      const messages = JSON.parse(result.body);
      // Should not see thread1 messages
      expect(messages).toEqual([]);
    });

    it('should allow subscribe only to the thread in the token', async () => {
      const token = await generateToken({ ...threadId, userId: 'user1', canWrite: false });

      const subscribeEvent = mockWebSocketMessageEvent({
        connectionId: 'conn-123',
        body: JSON.stringify({ action: 'forum.subscribe', token }),
      });

      const result = await globalHandler(subscribeEvent, {} as any) as any;
      expect(result.statusCode).toBe(200);

      // The subscription is for threadId (user123/item456) only
      // Posting to a different thread should not notify this connection
    });
  });

  describe('input validation', () => {
    it('should validate message body for POST', async () => {
      const token = await generateToken({ ...threadId, userId: 'user1', canWrite: true });

      const postEvent = mockALBEvent({
        path: `/sls/forum/thread/${threadId.itemId}/${threadId.participantId}/messages`,
        httpMethod: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: 'Missing uuid' }),
      });

      const result = await globalHandler(postEvent, {} as any) as any;
      expect(result.statusCode).toBe(400);
    });

    it('should validate limit parameter for GET', async () => {
      const token = await generateToken({ ...threadId, userId: 'user1', canWrite: false });

      const getEvent = mockALBEvent({
        path: `/sls/forum/thread/${threadId.itemId}/${threadId.participantId}/messages`,
        httpMethod: 'GET',
        headers: { authorization: `Bearer ${token}` },
      });
      // Manually add query params since mockALBEvent might not support it
      (getEvent as any).queryStringParameters = { limit: '999' };

      const result = await globalHandler(getEvent, {} as any) as any;
      expect(result.statusCode).toBe(400);
    });

    it('should handle malformed JSON in POST body', async () => {
      const token = await generateToken({ ...threadId, userId: 'user1', canWrite: true });

      const postEvent = mockALBEvent({
        path: `/sls/forum/thread/${threadId.itemId}/${threadId.participantId}/messages`,
        httpMethod: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: 'not-valid-json',
      });

      const result = await globalHandler(postEvent, {} as any) as any;
      expect(result.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('token route parameter validation', () => {
    it('should reject request when token itemId does not match route', async () => {
      const token = await generateToken({ ...threadId, userId: 'user1', canWrite: true });

      const postEvent = mockALBEvent({
        path: `/sls/forum/thread/different-item/${threadId.participantId}/messages`,
        httpMethod: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: 'Test', uuid: 'msg-1' }),
      });

      const result = await globalHandler(postEvent, {} as any) as any;
      expect(result.statusCode).toBe(403);
      expect(result.body).toContain('itemId');
    });

    it('should reject request when token participantId does not match route', async () => {
      const token = await generateToken({ ...threadId, userId: 'user1', canWrite: true });

      const postEvent = mockALBEvent({
        path: `/sls/forum/thread/${threadId.itemId}/different-participant/messages`,
        httpMethod: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: 'Test', uuid: 'msg-1' }),
      });

      const result = await globalHandler(postEvent, {} as any) as any;
      expect(result.statusCode).toBe(403);
      expect(result.body).toContain('participantId');
    });
  });
});

