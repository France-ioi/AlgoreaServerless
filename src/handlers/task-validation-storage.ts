import { EventEnvelope } from '../utils/lambda-eventbus-server';
import { GradeSavedPayload } from '../events/grade-saved';
import { validationsTable } from '../dbmodels/validations';

/**
 * Root-level handler for grade_saved events.
 * Persists a validation record when both validated and score_improved are true.
 */
export async function handleGradeSaved(payload: GradeSavedPayload, envelope: EventEnvelope): Promise<void> {
  if (!payload.validated || !payload.score_improved) return;

  const time = new Date(envelope.time).getTime();
  await validationsTable.insert(time, {
    participantId: payload.participant_id,
    itemId: payload.item_id,
    answerId: payload.answer_id,
  });
}
