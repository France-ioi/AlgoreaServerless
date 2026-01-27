import { generateToken, initializeKeys } from '../../testutils/token-generator';
import { mockALBEvent, mockWebSocketMessageEvent } from '../../testutils/event-mocks';
import { clearTable } from '../../testutils/db';
import { UserConnections } from '../../dbmodels/user-connections';
import { dynamodb } from '../../dynamodb';

const mockSend = jest.fn();

jest.mock('../../websocket-client', () => ({
  ...jest.requireActual('../../websocket-client'),
  wsClient: { send: mockSend },
}));

import { globalHandler } from '../../handlers';

describe('E2E: Message Flow', () => {
  const threadId = { participantId: 'user123', itemId: 'item456' };

  beforeAll(async () => {
    await initializeKeys();
  });

  beforeEach(async () => {
    await clearTable();
    jest.clearAllMocks();
    mockSend.mockImplementation((connectionIds) =>
      Promise.resolve(connectionIds.map((id: string) => ({ success: true, connectionId: id }))));
  });

  it('should handle complete message lifecycle: subscribe, post, receive, get', async () => {
    const user1Token = await generateToken({ ...threadId, userId: 'user1', canWrite: true });
    const user2Token = await generateToken({ ...threadId, userId: 'user2', canWrite: false });

    // Step 1: User2 subscribes to thread via WebSocket
    const subscribeEvent = mockWebSocketMessageEvent({
      connectionId: 'user2-conn',
      body: JSON.stringify({
        action: 'forum.subscribe',
        token: user2Token,
      }),
    });

    const subscribeResult = await globalHandler(subscribeEvent, {} as any) as any;
    expect(subscribeResult.statusCode).toBe(200);

    // Step 2: User1 posts a message via REST API
    const postEvent = mockALBEvent({
      path: `/sls/forum/thread/${threadId.itemId}/${threadId.participantId}/messages`,
      httpMethod: 'POST',
      headers: { authorization: `Bearer ${user1Token}` },
      body: JSON.stringify({ text: 'Hello from user1', uuid: 'msg-uuid-1' }),
    });

    const postResult = await globalHandler(postEvent, {} as any) as any;
    expect(postResult.statusCode).toBe(201);

    // Step 3: Verify User2 received WebSocket notification
    expect(mockSend).toHaveBeenCalledWith(
      [ 'user2-conn' ],
      expect.objectContaining({
        action: 'forum.message.new',
        authorId: 'user1',
        text: 'Hello from user1',
        uuid: 'msg-uuid-1',
      })
    );

    // Step 4: User2 retrieves messages via REST API
    const getEvent = mockALBEvent({
      path: `/sls/forum/thread/${threadId.itemId}/${threadId.participantId}/messages`,
      httpMethod: 'GET',
      headers: { authorization: `Bearer ${user2Token}` },
    });

    const getResult = await globalHandler(getEvent, {} as any) as any;
    expect(getResult.statusCode).toBe(200);

    const messages = JSON.parse(getResult.body);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      authorId: 'user1',
      text: 'Hello from user1',
      uuid: 'msg-uuid-1',
    });

    // Step 5: User2 unsubscribes
    const unsubscribeEvent = mockWebSocketMessageEvent({
      connectionId: 'user2-conn',
      body: JSON.stringify({
        action: 'forum.unsubscribe',
        token: user2Token,
      }),
    });

    const unsubscribeResult = await globalHandler(unsubscribeEvent, {} as any) as any;
    expect(unsubscribeResult.statusCode).toBe(200);
  });

  it('should handle multiple subscribers receiving the same message', async () => {
    const user1Token = await generateToken({ ...threadId, userId: 'user1', canWrite: true });
    const user2Token = await generateToken({ ...threadId, userId: 'user2', canWrite: false });
    const user3Token = await generateToken({ ...threadId, userId: 'user3', canWrite: false });

    // Subscribe two users
    await globalHandler(mockWebSocketMessageEvent({
      connectionId: 'user2-conn',
      body: JSON.stringify({ action: 'forum.subscribe', token: user2Token }),
    }), {} as any);

    await globalHandler(mockWebSocketMessageEvent({
      connectionId: 'user3-conn',
      body: JSON.stringify({ action: 'forum.subscribe', token: user3Token }),
    }), {} as any);

    // User1 posts a message
    const postEvent = mockALBEvent({
      path: `/sls/forum/thread/${threadId.itemId}/${threadId.participantId}/messages`,
      httpMethod: 'POST',
      headers: { authorization: `Bearer ${user1Token}` },
      body: JSON.stringify({ text: 'Broadcast message', uuid: 'msg-broadcast' }),
    });

    await globalHandler(postEvent, {} as any);

    // Both subscribers should receive the message
    expect(mockSend).toHaveBeenCalledWith(
      expect.arrayContaining([ 'user2-conn', 'user3-conn' ]),
      expect.objectContaining({
        action: 'forum.message.new',
        text: 'Broadcast message',
      })
    );
  });

  it('should handle posting multiple messages in sequence', async () => {
    const userToken = await generateToken({ ...threadId, userId: 'user1', canWrite: true });

    // Post three messages
    for (let i = 1; i <= 3; i++) {
      const postEvent = mockALBEvent({
        path: `/sls/forum/thread/${threadId.itemId}/${threadId.participantId}/messages`,
        httpMethod: 'POST',
        headers: { authorization: `Bearer ${userToken}` },
        body: JSON.stringify({ text: `Message ${i}`, uuid: `msg-${i}` }),
      });

      const result = await globalHandler(postEvent, {} as any) as any;
      expect(result.statusCode).toBe(201);
    }

    // Retrieve all messages
    const getEvent = mockALBEvent({
      path: `/sls/forum/thread/${threadId.itemId}/${threadId.participantId}/messages`,
      httpMethod: 'GET',
      headers: { authorization: `Bearer ${userToken}` },
    });

    const getResult = await globalHandler(getEvent, {} as any) as any;
    const messages = JSON.parse(getResult.body);

    expect(messages).toHaveLength(3);
    // Should be in reverse chronological order
    expect(messages[0].text).toBe('Message 3');
    expect(messages[1].text).toBe('Message 2');
    expect(messages[2].text).toBe('Message 1');
  });

  it('should clean up gone subscribers when posting message', async () => {
    const userConnections = new UserConnections(dynamodb);

    const user1Token = await generateToken({ ...threadId, userId: 'user1', canWrite: true });
    const user2Token = await generateToken({ ...threadId, userId: 'user2', canWrite: false });
    const user3Token = await generateToken({ ...threadId, userId: 'user3', canWrite: false });

    // Create user connections before subscribing (simulating what handleConnect does)
    await userConnections.insert('user2-conn', 'user2');
    await userConnections.insert('user3-gone-conn', 'user3');

    // Subscribe two users (this will also update the connection with subscriptionKeys)
    await globalHandler(mockWebSocketMessageEvent({
      connectionId: 'user2-conn',
      body: JSON.stringify({ action: 'forum.subscribe', token: user2Token }),
    }), {} as any);

    await globalHandler(mockWebSocketMessageEvent({
      connectionId: 'user3-gone-conn',
      body: JSON.stringify({ action: 'forum.subscribe', token: user3Token }),
    }), {} as any);

    // Simulate user3 connection is gone
    mockSend.mockImplementation((connectionIds) => Promise.resolve(connectionIds.map((id: string) => {
      if (id === 'user3-gone-conn') {
        const error = new Error('Gone');
        error.name = 'GoneException';
        return { success: false, connectionId: id, error };
      }
      return { success: true, connectionId: id };
    })));

    // Post a message
    const postEvent = mockALBEvent({
      path: `/sls/forum/thread/${threadId.itemId}/${threadId.participantId}/messages`,
      httpMethod: 'POST',
      headers: { authorization: `Bearer ${user1Token}` },
      body: JSON.stringify({ text: 'Test cleanup', uuid: 'msg-cleanup' }),
    });

    await globalHandler(postEvent, {} as any);

    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify gone connection was removed
    // We can't directly check the DB here without exposing internals,
    // but the next message should only go to user2-conn
    jest.clearAllMocks();
    mockSend.mockImplementation((connectionIds) =>
      Promise.resolve(connectionIds.map((id: string) => ({ success: true, connectionId: id }))));

    await globalHandler(mockALBEvent({
      path: `/sls/forum/thread/${threadId.itemId}/${threadId.participantId}/messages`,
      httpMethod: 'POST',
      headers: { authorization: `Bearer ${user1Token}` },
      body: JSON.stringify({ text: 'Second message', uuid: 'msg-2' }),
    }), {} as any);

    const calls = mockSend.mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[0]).toEqual([ 'user2-conn' ]);
    expect(lastCall?.[0]).not.toContain('user3-gone-conn');
  });
});

