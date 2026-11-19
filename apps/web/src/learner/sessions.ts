import type { Attempt } from '../domain/models';

export type SessionRow = {
  sessionId: string;
  /** Time of the session's latest answer. */
  at: number;
  mode: string;
  /** Automatically graded answers (self-rated cards are counted apart, as on Progress). */
  answered: number;
  firstTry: number;
  /** First-try correct share of `answered`, or null when nothing was graded. */
  percent: number | null;
  selfRated: number;
};

function modeOf(attempts: Attempt[]) {
  if (attempts.some((a) => a.isReview)) return 'Ôn tập';
  const skill = attempts[0].skill;
  if (skill.startsWith('name:')) return 'Flashcard';
  if (skill.startsWith('match:')) return 'Ghép tên';
  if (skill === 'image') return 'Đoán hình';
  if (skill === 'hs') return 'HS';
  return 'Nghe tên';
}

/** The latest sessions of a release, newest first, with the same split as the Progress figures. */
export function recentSessions(attempts: Attempt[], releaseId: string, limit = 5): SessionRow[] {
  const bySession = new Map<string, Attempt[]>();
  for (const a of attempts)
    if (a.contentVersion === releaseId)
      bySession.set(a.sessionId, [...(bySession.get(a.sessionId) ?? []), a]);
  return [...bySession.entries()]
    .map(([sessionId, list]) => {
      const counted = list.filter((a) => !a.skipped);
      const graded = counted.filter((a) => !a.selfRated);
      const firstTry = graded.filter((a) => a.correct && a.attemptNumber === 1).length;
      return {
        sessionId,
        at: Math.max(...list.map((a) => Date.parse(a.at)).filter(isFinite)),
        mode: modeOf(list),
        answered: graded.length,
        firstTry,
        percent: graded.length ? Math.round((firstTry / graded.length) * 100) : null,
        selfRated: counted.length - graded.length,
      };
    })
    .sort((a, b) => b.at - a.at)
    .slice(0, limit);
}
