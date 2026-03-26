import { handleGradeSaved } from './task-validation-storage';
import { EventEnvelope } from '../utils/lambda-eventbus-server';
import { GradeSavedPayload } from '../events/grade-saved';
import { Validations } from '../dbmodels/validations';
import { ValidationCounts } from '../dbmodels/validation-counts';
import { docClient } from '../dynamodb';
import { clearTable } from '../testutils/db';

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

describe('handleGradeSaved (root-level)', () => {
  let validations: Validations;
  let validationCounts: ValidationCounts;

  beforeEach(async () => {
    validations = new Validations(docClient);
    validationCounts = new ValidationCounts(docClient);
    await clearTable();
  });

  it('should insert a validation when validated=true and score_improved=true', async () => {
    const envelope = makeEnvelope('2026-03-10T12:00:00Z');
    await handleGradeSaved(makePayload(), envelope);

    const result = await validations.getLatest(10);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      sk: new Date('2026-03-10T12:00:00Z').getTime(),
      participantId: 'participant-1',
      itemId: 'item-1',
      answerId: 'answer-1',
    });

    const statsNow = new Date('2026-03-10T23:59:59Z').getTime();
    expect(await validationCounts.sumLastDays(1, statsNow)).toBe(1);
  });

  it('should skip when validated=false', async () => {
    await handleGradeSaved(makePayload({ validated: false }), makeEnvelope());

    const result = await validations.getLatest(10);
    expect(result).toHaveLength(0);
    expect(await validationCounts.sumLastDays(1, Date.now())).toBe(0);
  });

  it('should skip when score_improved=false', async () => {
    await handleGradeSaved(makePayload({ score_improved: false }), makeEnvelope());

    const result = await validations.getLatest(10);
    expect(result).toHaveLength(0);
    expect(await validationCounts.sumLastDays(1, Date.now())).toBe(0);
  });

  it('should skip when both validated=false and score_improved=false', async () => {
    await handleGradeSaved(makePayload({ validated: false, score_improved: false }), makeEnvelope());

    const result = await validations.getLatest(10);
    expect(result).toHaveLength(0);
    expect(await validationCounts.sumLastDays(1, Date.now())).toBe(0);
  });
});
