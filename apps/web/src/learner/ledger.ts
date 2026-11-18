import { reviewKey, scheduleReview } from '../domain/review';
import { validState } from '../domain/storage';
import type { Attempt, ReviewState, Skill } from '../domain/models';
import type { Game, Score } from '../pilot/api';
export const LEDGER_KEY = 'seafood-deck:pilot:v1';
export type Ledger = {
  sessionId: string | null;
  attempts: Attempt[];
  reviews: Record<string, ReviewState>;
  labels?: Record<string, string>;
};
export const empty: Ledger = { sessionId: null, attempts: [], reviews: {} };
export function loadLedger() {
  try {
    const text = localStorage.getItem(LEDGER_KEY);
    if (!text) return { ledger: empty, warning: '' };
    const raw = JSON.parse(text);
    if (
      !raw ||
      !(raw.sessionId === null || typeof raw.sessionId === 'string') ||
      !validState({ schemaVersion: 1, session: null, attempts: raw.attempts, reviews: raw.reviews })
    )
      throw Error();
    return { ledger: raw as Ledger, warning: '' };
  } catch {
    return {
      ledger: empty,
      warning:
        'Tiến độ cục bộ không đọc được. Dữ liệu cũ được giữ cho đến khi bạn chủ động bắt đầu lượt mới.',
    };
  }
}
export function skillLabel(value: string) {
  const [type, kind] = value.split(':');
  const language = kind === 'en' ? 'Anh' : kind === 'ja' ? 'Nhật' : 'khoa học';
  return type === 'name'
    ? `Tên tiếng ${language}`
    : type === 'match'
      ? `Ghép Việt–${language}`
      : type === 'hs'
        ? 'HS theo dạng hàng'
        : type === 'image'
          ? 'Nhận diện nguyên liệu'
          : 'Nghe và chọn tên';
}
export function mergeScore(previous: Ledger, result: Score, g: Game): Ledger {
  let next = previous;
  for (const row of result.items?.length
    ? result.items
    : [{ targetId: result.targetId, correct: result.correct, label: result.targetLabel }]) {
    const id = g.id + '/' + result.questionId + (result.items?.length ? '/' + row.targetId : '');
    if (next.attempts.some((a) => a.id === id)) continue;
    const attempt: Attempt = {
      id,
      sessionId: g.id,
      questionId: result.questionId,
      targetId: row.targetId,
      skill: result.skill as Skill,
      contentVersion: result.contentVersion,
      attemptNumber: 1,
      correct: row.correct,
      selfRated: result.selfRated,
      isReview: g.mode === 'review',
      answer: 'submitted',
      at: result.at ?? g.expiresAt,
      skipped: result.skipped,
    };
    const reviews = { ...next.reviews };
    if (!result.skipped)
      reviews[reviewKey(attempt.targetId, attempt.skill)] = scheduleReview(
        reviews[reviewKey(attempt.targetId, attempt.skill)],
        attempt,
      );
    next = {
      ...next,
      attempts: [...next.attempts, attempt],
      reviews,
      labels: { ...next.labels, [row.targetId]: row.label ?? result.targetLabel ?? 'Mục học' },
    };
  }
  return next;
}
export function mergeGame(previous: Ledger, g: Game) {
  return g.questions.reduce(
    (next, q) => (q.result ? mergeScore(next, q.result, g) : next),
    previous,
  );
}
