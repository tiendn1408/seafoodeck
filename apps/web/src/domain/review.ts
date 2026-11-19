import type { Attempt, ReviewState } from './models';

export const DAY = 86_400_000;
/** Days until the next review at each mastery stage (0–3). */
export const INTERVAL_DAYS: readonly number[] = [1, 3, 7, 14];
export const reviewKey = (targetId: string, skill: string) => `${targetId}/${skill}`;
export function scheduleReview(previous: ReviewState | undefined, attempt: Attempt): ReviewState {
  const sameSession = previous?.lastSessionId === attempt.sessionId;
  const sameVersion = previous?.contentVersion === attempt.contentVersion;
  // Only a first, automatically graded answer in a later session can advance mastery.
  const canAdvance =
    !!previous &&
    !sameSession &&
    sameVersion &&
    attempt.isReview &&
    Date.parse(previous.dueAt) <= Date.parse(attempt.at) &&
    !attempt.selfRated &&
    attempt.attemptNumber === 1;
  const stage = !attempt.correct
    ? 0
    : canAdvance
      ? Math.min(previous.stage + 1, 3)
      : previous && sameVersion
        ? previous.stage
        : 0;
  return {
    key: reviewKey(attempt.targetId, attempt.skill),
    targetId: attempt.targetId,
    skill: attempt.skill,
    stage,
    dueAt:
      attempt.correct && previous && sameVersion && !canAdvance
        ? previous.dueAt
        : new Date(Date.parse(attempt.at) + INTERVAL_DAYS[stage] * DAY).toISOString(),
    lastSessionId: attempt.sessionId,
    contentVersion: attempt.contentVersion,
    selfRated: attempt.selfRated,
  };
}
