import { SendResult, ConnectionId } from '../websocket-client';
import { GoneException } from '@aws-sdk/client-apigatewaymanagementapi';

interface MockSendOptions {
  successConnections?: ConnectionId[],
  goneConnections?: ConnectionId[],
  errorConnections?: ConnectionId[],
}

class MockWSClient {
  private sendCalls: Array<{ connectionIds: ConnectionId[], message: any }> = [];
  private mockOptions: MockSendOptions = {};

  /**
   * Mock the send method - tracks calls and returns configured results
   */
  send(connectionIds: ConnectionId[], message: any): Promise<SendResult[]> {
    this.sendCalls.push({ connectionIds, message });

    const uniqueIds = [ ...new Set(connectionIds) ];

    return Promise.resolve(uniqueIds.map(connectionId => {
      // Check if this connection should return gone
      if (this.mockOptions.goneConnections?.includes(connectionId)) {
        return {
          success: false,
          connectionId,
          error: new GoneException({
            message: 'Connection gone',
            $metadata: {},
          }),
        };
      }

      // Check if this connection should return error
      if (this.mockOptions.errorConnections?.includes(connectionId)) {
        return {
          success: false,
          connectionId,
          error: new Error('Send failed'),
        };
      }

      // Default to success
      return {
        success: true,
        connectionId,
      };
    }));
  }

  /**
   * Configure which connections should fail with GoneException
   */
  setGoneConnections(connectionIds: ConnectionId[]): void {
    this.mockOptions.goneConnections = connectionIds;
  }

  /**
   * Simulate a gone connection (shorthand for setGoneConnections)
   */
  simulateGone(connectionId: ConnectionId): void {
    if (!this.mockOptions.goneConnections) {
      this.mockOptions.goneConnections = [];
    }
    this.mockOptions.goneConnections.push(connectionId);
  }

  /**
   * Configure which connections should fail with generic error
   */
  setErrorConnections(connectionIds: ConnectionId[]): void {
    this.mockOptions.errorConnections = connectionIds;
  }

  /**
   * Get all send calls made to the mock
   */
  getSendCalls(): Array<{ connectionIds: ConnectionId[], message: any }> {
    return this.sendCalls;
  }

  /**
   * Get the last send call
   */
  getLastSendCall(): { connectionIds: ConnectionId[], message: any } | undefined {
    return this.sendCalls[this.sendCalls.length - 1];
  }

  /**
   * Reset all mock state
   */
  reset(): void {
    this.sendCalls = [];
    this.mockOptions = {};
  }

  /**
   * Check if send was called with specific connection ID
   */
  wasSentTo(connectionId: ConnectionId): boolean {
    return this.sendCalls.some(call => call.connectionIds.includes(connectionId));
  }

  /**
   * Get all messages sent to a specific connection
   */
  getMessagesSentTo(connectionId: ConnectionId): any[] {
    return this.sendCalls
      .filter(call => call.connectionIds.includes(connectionId))
      .map(call => call.message);
  }
}

// Export singleton instance for testing
export const mockWSClient = new MockWSClient();

/**
 * Mock the wsClient module
 * Call this in your test setup to replace the real WebSocket client
 */
export const mockWebSocketClient = (): void => {
  jest.mock('../websocket-client', () => ({
    ...jest.requireActual('../websocket-client'),
    wsClient: mockWSClient,
  }));
};

