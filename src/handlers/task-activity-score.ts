import { EventEnvelope } from '../utils/lambda-eventbus-server';
import { GradeSavedPayload } from '../events/grade-saved';
import { userTaskActivitiesTable } from '../dbmodels/user-task-activities';

export async function handleGradeSavedActivity(payload: GradeSavedPayload, envelope: EventEnvelope): Promise<void> {
  const time = new Date(envelope.time).getTime();
  await userTaskActivitiesTable.insertScore(payload.item_id, payload.participant_id, time, {
    answerId: payload.answer_id,
    attemptId: payload.attempt_id,
    validated: payload.validated,
    score: payload.score,
  });
}
