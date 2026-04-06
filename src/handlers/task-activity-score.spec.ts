import { handleGradeSavedActivity } from './task-activity-score';
import { EventEnvelope } from '../utils/lambda-eventbus-server';
import { GradeSavedPayload } from '../events/grade-saved';
import { UserTaskActivities } from '../dbmodels/user-task-activities';
import { docClient } from '../dynamodb';
import { clearTable } from '../testutils/db';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';

function makePayload(overrides: Partial<GradeSavedPayload> = {}): GradeSavedPayload {
  return {
    answer_id: 'answer-1',
    participant_id: 'participant-1',
    attempt_id: 'attempt-1',
    item_id: 'item-1',
    validated: true,
    caller_id: 'caller-1',
    score: 100,
    score_improved: true,
    ...overrides,
  };
}

function makeEnvelope(time = '2026-03-10T12:00:00Z'): EventEnvelope {
  return {
    version: '1.0',
    type: 'grade_saved',
    source_app: 'algoreabackend',
    instance: 'test',
    time,
    request_id: 'req-1',
    payload: {},
  };
}

async function scanActivities(): Promise<Record<string, unknown>[]> {
  const tableName = process.env.TABLE_USER_TASK_ACTIVITIES;
  const result = await docClient.send(new ScanCommand({ TableName: tableName }));
  return (result.Items ?? []) as Record<string, unknown>[];
}

describe('handleGradeSavedActivity', () => {
  beforeEach(async () => {
    // Ensure the table class can be instantiated
    new UserTaskActivities(docClient);
    await clearTable();
  });

  it('should insert a score activity record for every grade_saved event', async () => {
    await handleGradeSavedActivity(makePayload(), makeEnvelope('2026-03-10T12:00:00Z'));

    const items = await scanActivities();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      pk: 'score#item-1#participant-1',
      answerId: 'answer-1',
      attemptId: 'attempt-1',
      validated: true,
    });
  });

  it('should store score activity even when validated=false', async () => {
    await handleGradeSavedActivity(
      makePayload({ validated: false, score: 50 }),
      makeEnvelope(),
    );

    const items = await scanActivities();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      validated: false,
    });
  });

  it('should store score activity even when score_improved=false', async () => {
    await handleGradeSavedActivity(
      makePayload({ score_improved: false }),
      makeEnvelope(),
    );

    const items = await scanActivities();
    expect(items).toHaveLength(1);
  });
});
