import type { AppState, Attempt, ContentPack, Question, StudySession } from './models';
import { buildPairs, imageQuestions } from './content';
import { reviewKey, scheduleReview } from './review';

export const emptyState = (): AppState => ({
  schemaVersion: 1,
  session: null,
  attempts: [],
  reviews: {},
});
export function createSession(
  pack: ContentPack,
  mode: StudySession['mode'],
  reviews: AppState['reviews'] = {},
  kind: 'en' | 'ja' | 'scientific' = 'en',
  now = new Date().toISOString(),
  speciesId = pack.species[0]?.id ?? '',
): StudySession {
  const selectedId = pack.species.some((s) => s.id === speciesId) ? speciesId : pack.species[0]?.id;
  const remaining = pack.species.map((s) => s.id).filter((id) => id !== selectedId);
  if (pack.species.length > 3) {
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
  }
  const order =
    pack.species.length > 3 ? [selectedId!, ...remaining] : pack.species.map((s) => s.id);
  const pairs = buildPairs(pack, kind, order.slice(0, 3));
  const match: Question[] = pairs
    ? [
        {
          id: `match-${kind}`,
          type: 'match',
          kind,
          pairs,
          rightOrder: [pairs[2].speciesId, pairs[0].speciesId, pairs[1].speciesId],
        },
      ]
    : [];
  const full: Question[] = [
    ...(['en', 'ja', 'scientific'] as const).map((k) => ({
      id: `flash-${k}`,
      type: 'flashcard' as const,
      speciesId: selectedId!,
      kind: k,
    })),
    ...match,
    ...pack.scenarios.slice(0, 2).map((s) => ({ id: s.id, type: 'hs' as const, scenarioId: s.id })),
  ];
  let questions =
    mode === 'match'
      ? match
      : mode === 'image'
        ? imageQuestions(pack, order)
        : mode === 'flashcard'
          ? full.filter((q) => q.type === 'flashcard')
          : mode === 'hs'
            ? pack.scenarios.map((s) => ({ id: s.id, type: 'hs' as const, scenarioId: s.id }))
            : full;
  if (mode === 'review') {
    const due = Object.values(reviews).filter(
      (r) => r.contentVersion === pack.version && Date.parse(r.dueAt) <= Date.parse(now),
    );
    questions = [];
    for (const r of due) {
      if (r.skill === 'hs') {
        if (pack.scenarios.some((s) => s.id === r.targetId))
          questions.push({ id: r.targetId, type: 'hs', scenarioId: r.targetId });
      } else if (r.skill.startsWith('name:') && pack.species.some((s) => s.id === r.targetId)) {
        const k = r.skill.slice(5) as 'en' | 'ja' | 'scientific';
        questions.push({
          id: `review-${r.targetId}-${k}`,
          type: 'flashcard',
          speciesId: r.targetId,
          kind: k,
        });
      } else if (r.skill === 'image') {
        const photo = imageQuestions(pack).find(
          (q) => q.type === 'image' && q.speciesId === r.targetId,
        );
        if (photo) questions.push(photo);
      } else if (r.skill.startsWith('match:')) {
        const k = r.skill.slice(6) as 'en' | 'ja' | 'scientific';
        if (!questions.some((q) => q.type === 'match' && q.kind === k)) {
          const p = buildPairs(pack, k);
          if (p)
            questions.push({
              id: `match-${k}`,
              type: 'match',
              kind: k,
              pairs: p,
              rightOrder: [p[2].speciesId, p[0].speciesId, p[1].speciesId],
            });
        }
      }
    }
    questions = questions.slice(0, 8);
  }
  return {
    id: crypto.randomUUID(),
    mode,
    contentVersion: pack.version,
    questions,
    cursor: 0,
    startedAt: now,
    ui: {},
  };
}
export function submitAttempt(state: AppState, attempt: Attempt): AppState {
  const session = state.session;
  if (
    !session ||
    session.completedAt ||
    attempt.sessionId !== session.id ||
    attempt.contentVersion !== session.contentVersion ||
    state.attempts.some((a) => a.id === attempt.id)
  )
    return state;
  const current = session.questions[session.cursor];
  if (!current || current.id !== attempt.questionId) return state;
  if (
    state.attempts.some(
      (a) =>
        a.sessionId === session.id &&
        a.questionId === attempt.questionId &&
        a.targetId === attempt.targetId &&
        (a.correct || current.type !== 'match'),
    )
  )
    return state;
  const targetValid =
    current.type === 'hs'
      ? attempt.targetId === current.scenarioId && attempt.skill === 'hs'
      : current.type === 'match'
        ? current.pairs.some((p) => p.speciesId === attempt.targetId) &&
          attempt.skill === `match:${current.kind}`
        : current.type === 'image'
          ? attempt.targetId === current.speciesId && attempt.skill === 'image'
          : attempt.targetId === current.speciesId && attempt.skill === `name:${current.kind}`;
  if (!targetValid || (attempt.skipped && current.type !== 'image')) return state;
  const key = reviewKey(attempt.targetId, attempt.skill);
  return {
    ...state,
    attempts: [...state.attempts, attempt],
    reviews: attempt.skipped
      ? state.reviews
      : {
          ...state.reviews,
          [key]: scheduleReview(
            state.reviews[key]?.contentVersion === attempt.contentVersion
              ? state.reviews[key]
              : undefined,
            attempt,
          ),
        },
  };
}
export function advanceSession(state: AppState, now = new Date().toISOString()): AppState {
  const s = state.session;
  if (!s || s.completedAt) return state;
  const q = s.questions[s.cursor];
  const attempts = state.attempts.filter((a) => a.sessionId === s.id && a.questionId === q?.id);
  if (
    !q ||
    (q.type === 'match'
      ? !q.pairs.every((p) => attempts.some((a) => a.targetId === p.speciesId && a.correct))
      : !attempts.length)
  )
    return state;
  const cursor = s.cursor + 1;
  return {
    ...state,
    session: { ...s, cursor, ...(cursor >= s.questions.length ? { completedAt: now } : {}) },
  };
}
export function retryCandidates(state: AppState, skipped = false): Question[] {
  const s = state.session;
  if (!s?.completedAt) return [];
  const latest = new Map<string, Question>();
  for (const q of s.questions) latest.set(q.id.split(':retry-')[0], q);
  return [...latest.values()].filter((q) =>
    state.attempts.some(
      (a) =>
        a.sessionId === s.id &&
        a.questionId === q.id &&
        (skipped ? a.skipped : !a.skipped && !a.correct),
    ),
  );
}
export function retryMistakes(state: AppState, skipped = false): AppState {
  const s = state.session;
  const questions = retryCandidates(state, skipped);
  if (!s || !questions.length) return state;
  const suffix = `:retry-${s.questions.length}`;
  return {
    ...state,
    session: {
      ...s,
      questions: [
        ...s.questions,
        ...questions.map((q) => ({ ...q, id: q.id.split(':retry-')[0] + suffix })),
      ],
      cursor: s.questions.length,
      completedAt: undefined,
    },
  };
}
