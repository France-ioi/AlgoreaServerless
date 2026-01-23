import { handleSubmissionCreated, SubmissionPayload } from './submission-created';
import { EventEnvelope } from '../../utils/lambda-eventbus-server';

function createMockPayload(overrides?: Partial<SubmissionPayload>): SubmissionPayload {
  return {
    answer_id: '2370069782874587543',
    attempt_id: '0',
    author_id: '4830897401562438517',
    item_id: '6379723280369399253',
    participant_id: '4830897401562438517',
    ...overrides,
  };
}

function createMockEnvelope(payload: unknown = createMockPayload()): EventEnvelope {
  return {
    version: '1.0',
    type: 'submission_created',
    source_app: 'algoreabackend',
    instance: 'dev',
    time: '2026-01-23T14:36:20.392285135Z',
    request_id: '169.254.80.227/DB0MBqcJM6-000006',
    payload,
  };
}

describe('handleSubmissionCreated', () => {
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

      handleSubmissionCreated(envelope);

      expect(consoleLogSpy).toHaveBeenCalledWith('Submission created:', {
        answerId: '2370069782874587543',
        attemptId: '0',
        authorId: '4830897401562438517',
        itemId: '6379723280369399253',
        participantId: '4830897401562438517',
        instance: 'dev',
        requestId: '169.254.80.227/DB0MBqcJM6-000006',
      });
    });

    it('should handle events with all required fields without throwing', () => {
      const envelope = createMockEnvelope();

      expect(() => handleSubmissionCreated(envelope)).not.toThrow();
    });

    it('should use envelope fields for instance and requestId', () => {
      const envelope = createMockEnvelope();
      envelope.instance = 'production';
      envelope.request_id = 'prod-request-456';

      handleSubmissionCreated(envelope);

      expect(consoleLogSpy).toHaveBeenCalledWith('Submission created:', expect.objectContaining({
        instance: 'production',
        requestId: 'prod-request-456',
      }));
    });
  });

  describe('invalid payload handling', () => {
    it('should log error for missing required fields', () => {
      const envelope = createMockEnvelope({
        answer_id: '123',
        // missing other required fields
      });

      handleSubmissionCreated(envelope);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to parse submission_created payload:',
        expect.any(String)
      );
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should log error for completely invalid payload', () => {
      const envelope = createMockEnvelope('not an object');

      handleSubmissionCreated(envelope);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should log error for null payload', () => {
      const envelope = createMockEnvelope(null);

      handleSubmissionCreated(envelope);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });
});
