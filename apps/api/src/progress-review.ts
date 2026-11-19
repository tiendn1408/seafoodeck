export const DAY = 86_400_000;
/** Days until the next review at each mastery stage (0-3). */
export const INTERVAL_DAYS: readonly number[] = [1, 3, 7, 14];

export interface ReviewAttempt {
  sessionId: string;
  targetId: string;
  skill: string;
  contentVersion: string;
  attemptNumber: number;
  correct: boolean;
  selfRated: boolean;
  isReview: boolean;
  at: string;
}
export interface ReviewRow {
  targetId: string;
  skill: string;
  stage: number;
  dueAt: string;
  lastSessionId: string;
  contentVersion: string;
  selfRated: boolean;
  lastAttemptAt: string;
}

export function scheduleReview(previous: ReviewRow | undefined, attempt: ReviewAttempt): ReviewRow {
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
    lastAttemptAt: attempt.at,
  };
}

/** max(dueAt, lastAttemptAt + stage interval), mirroring the learner UI. */
export function effectiveDueAt(row: ReviewRow): string {
  const days = INTERVAL_DAYS[Math.min(Math.max(row.stage, 0), INTERVAL_DAYS.length - 1)];
  return new Date(
    Math.max(Date.parse(row.dueAt), Date.parse(row.lastAttemptAt) + days * DAY),
  ).toISOString();
}
