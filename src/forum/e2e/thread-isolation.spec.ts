import { clearTable } from '../../testutils/db';
import { generateToken, initializeKeys } from '../../testutils/token-generator';
import { mockALBEvent, mockWebSocketMessageEvent } from '../../testutils/event-mocks';

const mockSend = jest.fn();

jest.mock('../../websocket-client', () => ({
  ...jest.requireActual('../../websocket-client'),
  wsClient: { send: mockSend },
}));

import { globalHandler } from '../../handlers';

describe('E2E: Thread Isolation', () => {
  const thread1 = { participantId: 'user1', itemId: 'item1' };
  const thread2 = { participantId: 'user2', itemId: 'item2' };

  beforeAll(async () => {
    await initializeKeys();
  });

  beforeEach(async () => {
    await clearTable();
    jest.clearAllMocks();
    mockSend.mockImplementation((connectionIds) =>
      Promise.resolve(connectionIds.map((id: string) => ({ success: true, connectionId: id }))));
  });

  // SKIP: These tests call getAllMessages via GET /forum/message which depends on a query not supported by DynamoDB Local
  it.skip('should isolate messages between different threads', async () => {
    const thread1Token = await generateToken({ ...thread1, userId: 'user1', canWrite: true });
    const thread2Token = await generateToken({ ...thread2, userId: 'user2', canWrite: true });

    // Post message to thread1
    await globalHandler(mockALBEvent({
      path: '/sls/forum/message',
      httpMethod: 'POST',
      headers: { authorization: `Bearer ${thread1Token}` },
      body: JSON.stringify({ text: 'Thread 1 message', uuid: 'msg-t1' }),
    }), {} as any);

    // Post message to thread2
    await globalHandler(mockALBEvent({
      path: '/sls/forum/message',
      httpMethod: 'POST',
      headers: { authorization: `Bearer ${thread2Token}` },
      body: JSON.stringify({ text: 'Thread 2 message', uuid: 'msg-t2' }),
    }), {} as any);

    // Get messages from thread1
    const thread1Messages = await globalHandler(mockALBEvent({
      path: '/sls/forum/message',
      httpMethod: 'GET',
      headers: { authorization: `Bearer ${thread1Token}` },
    }), {} as any) as any;

    const thread1Data = JSON.parse(thread1Messages.body);
    expect(thread1Data).toHaveLength(1);
    expect(thread1Data[0].text).toBe('Thread 1 message');

    // Get messages from thread2
    const thread2Messages = await globalHandler(mockALBEvent({
      path: '/sls/forum/message',
      httpMethod: 'GET',
      headers: { authorization: `Bearer ${thread2Token}` },
    }), {} as any) as any;

    const thread2Data = JSON.parse(thread2Messages.body);
    expect(thread2Data).toHaveLength(1);
    expect(thread2Data[0].text).toBe('Thread 2 message');
  });

  it('should isolate subscriptions between different threads', async () => {
    const thread1User1 = await generateToken({ ...thread1, userId: 'user1', canWrite: true });
    const thread1User2 = await generateToken({ ...thread1, userId: 'user2', canWrite: false });
    const thread2User3 = await generateToken({ ...thread2, userId: 'user3', canWrite: false });

    // Subscribe user2 to thread1
    await globalHandler(mockWebSocketMessageEvent({
      connectionId: 'user2-conn',
      body: JSON.stringify({ action: 'forum.subscribe', token: thread1User2 }),
    }), {} as any);

    // Subscribe user3 to thread2
    await globalHandler(mockWebSocketMessageEvent({
      connectionId: 'user3-conn',
      body: JSON.stringify({ action: 'forum.subscribe', token: thread2User3 }),
    }), {} as any);

    jest.clearAllMocks();
    mockSend.mockImplementation((connectionIds) =>
      Promise.resolve(connectionIds.map((id: string) => ({ success: true, connectionId: id }))));

    // Post message to thread1
    await globalHandler(mockALBEvent({
      path: '/sls/forum/message',
      httpMethod: 'POST',
      headers: { authorization: `Bearer ${thread1User1}` },
      body: JSON.stringify({ text: 'Thread 1 only', uuid: 'msg-t1-only' }),
    }), {} as any);

    // Only user2 (subscribed to thread1) should receive notification
    expect(mockSend).toHaveBeenCalledWith(
      [ 'user2-conn' ],
      expect.objectContaining({ text: 'Thread 1 only' })
    );
    expect(mockSend).not.toHaveBeenCalledWith(
      expect.arrayContaining([ 'user3-conn' ]),
      expect.anything()
    );
  });

  it.skip('should allow same user to participate in multiple threads', async () => {
    const userId = 'multi-thread-user';
    const thread1Token = await generateToken({ ...thread1, userId, canWrite: true });
    const thread2Token = await generateToken({ ...thread2, userId, canWrite: true });

    // Post to both threads
    await globalHandler(mockALBEvent({
      path: '/sls/forum/message',
      httpMethod: 'POST',
      headers: { authorization: `Bearer ${thread1Token}` },
      body: JSON.stringify({ text: 'Message in thread1', uuid: 'msg-1' }),
    }), {} as any);

    await globalHandler(mockALBEvent({
      path: '/sls/forum/message',
      httpMethod: 'POST',
      headers: { authorization: `Bearer ${thread2Token}` },
      body: JSON.stringify({ text: 'Message in thread2', uuid: 'msg-2' }),
    }), {} as any);

    // Retrieve from both threads
    const thread1Result = await globalHandler(mockALBEvent({
      path: '/sls/forum/message',
      httpMethod: 'GET',
      headers: { authorization: `Bearer ${thread1Token}` },
    }), {} as any) as any;

    const thread2Result = await globalHandler(mockALBEvent({
      path: '/sls/forum/message',
      httpMethod: 'GET',
      headers: { authorization: `Bearer ${thread2Token}` },
    }), {} as any) as any;

    const thread1Messages = JSON.parse(thread1Result.body);
    const thread2Messages = JSON.parse(thread2Result.body);

    expect(thread1Messages).toHaveLength(1);
    expect(thread2Messages).toHaveLength(1);
    expect(thread1Messages[0].text).toBe('Message in thread1');
    expect(thread2Messages[0].text).toBe('Message in thread2');
  });

  it.skip('should handle unsubscribe from one thread without affecting other threads', async () => {
    const userId = 'multi-sub-user';
    const thread1Token = await generateToken({ ...thread1, userId, canWrite: false });
    const thread2Token = await generateToken({ ...thread2, userId, canWrite: false });
    const posterToken = await generateToken({ ...thread1, userId: 'poster', canWrite: true });

    // Subscribe to both threads with different connection IDs
    await globalHandler(mockWebSocketMessageEvent({
      connectionId: 'user-conn-t1',
      body: JSON.stringify({ action: 'forum.subscribe', token: thread1Token }),
    }), {} as any);

    await globalHandler(mockWebSocketMessageEvent({
      connectionId: 'user-conn-t2',
      body: JSON.stringify({ action: 'forum.subscribe', token: thread2Token }),
    }), {} as any);

    // Unsubscribe from thread1
    await globalHandler(mockWebSocketMessageEvent({
      connectionId: 'user-conn-t1',
      body: JSON.stringify({ action: 'forum.unsubscribe', token: thread1Token }),
    }), {} as any);

    jest.clearAllMocks();
    mockSend.mockImplementation((connectionIds) =>
      Promise.resolve(connectionIds.map((id: string) => ({ success: true, connectionId: id }))));

    // Post to thread1
    await globalHandler(mockALBEvent({
      path: '/sls/forum/message',
      httpMethod: 'POST',
      headers: { authorization: `Bearer ${posterToken}` },
      body: JSON.stringify({ text: 'After unsubscribe', uuid: 'msg-after' }),
    }), {} as any);

    // user-conn-t1 should not receive notification
    const calls = mockSend.mock.calls;
    const connectionsCalled = calls.flatMap(call => call[0]);
    expect(connectionsCalled).not.toContain('user-conn-t1');
  });
});

