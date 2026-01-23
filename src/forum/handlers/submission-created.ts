import { EventBridgeEvent } from 'aws-lambda';

interface SubmissionCreatedDetail {
  submissionId: string,
  participantId: string,
  attemptId: string,
  itemId: string,
  answerId: string,
}

/**
 * Handles the submission_created event from EventBridge.
 * Currently logs the event details for debugging purposes.
 */
export function handleSubmissionCreated(
  event: EventBridgeEvent<string, SubmissionCreatedDetail>
): void {
  // eslint-disable-next-line no-console
  console.log('Submission created event received:', JSON.stringify(event.detail));
}
