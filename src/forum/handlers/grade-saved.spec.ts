import { handleGradeSaved, GradeSavedPayload } from './grade-saved';
import { EventEnvelope } from '../../utils/lambda-eventbus-server';

function createMockPayload(overrides?: Partial<GradeSavedPayload>): GradeSavedPayload {
  return {
    answer_id: '123',
    participant_id: '101',
    attempt_id: '0',
    item_id: '50',
    validated: true,
    caller_id: '101',
    score: 100,
    ...overrides,
  };
}

function createMockEnvelope(payload: unknown = createMockPayload()): EventEnvelope {
  return {
    version: '1.0',
    type: 'grade_saved',
    source_app: 'algoreabackend',
    instance: 'dev',
    time: '2026-01-23T14:36:20.392285135Z',
    request_id: 'test-request-456',
    payload,
  };
}

describe('handleGradeSaved', () => {
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

      handleGradeSaved(envelope);

      expect(consoleLogSpy).toHaveBeenCalledWith('Grade saved:', {
        answerId: '123',
        participantId: '101',
        attemptId: '0',
        itemId: '50',
        validated: true,
        callerId: '101',
        score: 100,
        instance: 'dev',
        requestId: 'test-request-456',
      });
    });

    it('should handle events with all required fields without throwing', () => {
      const envelope = createMockEnvelope();

      expect(() => handleGradeSaved(envelope)).not.toThrow();
    });

    it('should handle validated=false', () => {
      const envelope = createMockEnvelope(createMockPayload({
        validated: false,
        score: 50,
      }));

      handleGradeSaved(envelope);

      expect(consoleLogSpy).toHaveBeenCalledWith('Grade saved:', expect.objectContaining({
        validated: false,
        score: 50,
      }));
    });

    it('should handle zero score', () => {
      const envelope = createMockEnvelope(createMockPayload({
        validated: false,
        score: 0,
      }));

      handleGradeSaved(envelope);

      expect(consoleLogSpy).toHaveBeenCalledWith('Grade saved:', expect.objectContaining({
        score: 0,
      }));
    });
  });

  describe('invalid payload handling', () => {
    it('should log error for missing required fields', () => {
      const envelope = createMockEnvelope({
        answer_id: '123',
        // missing other required fields
      });

      handleGradeSaved(envelope);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to parse grade_saved payload:',
        expect.any(String)
      );
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should log error for wrong type on validated field', () => {
      const envelope = createMockEnvelope({
        ...createMockPayload(),
        validated: 'true', // should be boolean
      });

      handleGradeSaved(envelope);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should log error for wrong type on score field', () => {
      const envelope = createMockEnvelope({
        ...createMockPayload(),
        score: '100', // should be number
      });

      handleGradeSaved(envelope);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should log error for null payload', () => {
      const envelope = createMockEnvelope(null);

      handleGradeSaved(envelope);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });
});
