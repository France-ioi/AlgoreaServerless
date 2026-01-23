import { EventBridgeEvent } from 'aws-lambda';
import { handleSubmissionCreated } from './submission-created';

interface SubmissionCreatedDetail {
  submissionId: string,
  participantId: string,
  attemptId: string,
  itemId: string,
  answerId: string,
}

function createSubmissionCreatedEvent(): EventBridgeEvent<string, SubmissionCreatedDetail> {
  return {
    'version': '0',
    'id': 'test-event-id',
    'detail-type': 'submission_created',
    'source': 'algorea.backend',
    'account': '123456789',
    'time': '2026-01-23T10:00:00Z',
    'region': 'eu-west-3',
    'resources': [],
    'detail': {
      submissionId: 'sub-123',
      participantId: 'part-456',
      attemptId: 'att-789',
      itemId: 'item-001',
      answerId: 'ans-002',
    },
  };
}

describe('handleSubmissionCreated', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should log the event details', () => {
    const event = createSubmissionCreatedEvent();

    handleSubmissionCreated(event);

    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Submission created event received:',
      JSON.stringify(event.detail)
    );
  });

  it('should handle events with all required fields', () => {
    const event = createSubmissionCreatedEvent();

    expect(() => handleSubmissionCreated(event)).not.toThrow();
  });
});
