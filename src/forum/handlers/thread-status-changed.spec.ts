import { handleThreadStatusChanged, ThreadStatusChangedPayload } from './thread-status-changed';
import { EventEnvelope } from '../../utils/lambda-eventbus-server';

function createMockPayload(overrides?: Partial<ThreadStatusChangedPayload>): ThreadStatusChangedPayload {
  return {
    participant_id: '3',
    item_id: '1000',
    new_status: 'waiting_for_trainer',
    former_status: 'not_started',
    helper_group_id: '100',
    ...overrides,
  };
}

function createMockEnvelope(payload: unknown = createMockPayload()): EventEnvelope {
  return {
    version: '1.0',
    type: 'thread_status_changed',
    source_app: 'algoreabackend',
    instance: 'dev',
    time: '2026-01-23T14:36:20.392285135Z',
    request_id: 'test-request-123',
    payload,
  };
}

describe('handleThreadStatusChanged', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('successful parsing', () => {
    it('should log the parsed payload fields', () => {
      const envelope = createMockEnvelope();

      handleThreadStatusChanged(envelope);

      expect(consoleLogSpy).toHaveBeenCalledWith('Thread status changed:', {
        participantId: '3',
        itemId: '1000',
        newStatus: 'waiting_for_trainer',
        formerStatus: 'not_started',
        helperGroupId: '100',
        instance: 'dev',
        requestId: 'test-request-123',
      });
    });

    it('should handle events with all required fields without throwing', () => {
      const envelope = createMockEnvelope();

      expect(() => handleThreadStatusChanged(envelope)).not.toThrow();
    });

    it('should handle different status values', () => {
      const envelope = createMockEnvelope(createMockPayload({
        new_status: 'validated',
        former_status: 'waiting_for_participant',
      }));

      handleThreadStatusChanged(envelope);

      expect(consoleLogSpy).toHaveBeenCalledWith('Thread status changed:', expect.objectContaining({
        newStatus: 'validated',
        formerStatus: 'waiting_for_participant',
      }));
    });
  });

  describe('invalid payload handling', () => {
    it('should log error for missing required fields', () => {
      const envelope = createMockEnvelope({
        participant_id: '3',
        // missing other required fields
      });

      handleThreadStatusChanged(envelope);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to parse thread_status_changed payload:',
        expect.any(String)
      );
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should log error for null payload', () => {
      const envelope = createMockEnvelope(null);

      handleThreadStatusChanged(envelope);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });
});
