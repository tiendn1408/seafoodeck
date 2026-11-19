import { describe, expect, it } from 'vitest';
import { empty, mergeScore } from './ledger';
import { skillProgress } from './haul';
import type { CatalogOverview, Game, Score } from '../pilot/api';

const game = {
  id: 'g1',
  mode: 'match',
  expiresAt: '2026-01-01T00:00:00Z',
  questions: [],
} as unknown as Game;
const base = {
  answered: true,
  skipped: false,
  correct: true,
  selfRated: false,
  questionId: 'q1',
  targetId: 't1',
  skill: 'name:en',
  contentVersion: 'r1',
  explanation: '',
  at: '2026-01-01T00:00:00Z',
} as Score;

describe('ledger', () => {
  it('does not record an existing answer twice', () => {
    const once = mergeScore(empty, base, game);
    expect(mergeScore(once, base, game).attempts).toHaveLength(1);
  });
  it('expands a multi-item match into one attempt per item', () => {
    const r = {
      ...base,
      skill: 'match:en',
      items: [
        { targetId: 'a', correct: true },
        { targetId: 'b', correct: false },
        { targetId: 'c', correct: true },
      ],
    } as Score;
    expect(mergeScore(empty, r, game).attempts).toHaveLength(3);
  });
  it('a 3-item match result becomes three reviews that feed skillProgress', () => {
    const ids = ['item-a', 'item-b', 'item-c'];
    const match = {
      ...base,
      skill: 'match:en',
      items: ids.map((targetId) => ({ targetId, correct: true })),
    } as Score;
    const first = mergeScore(empty, match, game);
    const reviews = Object.values(first.reviews);
    expect(reviews.map((r) => r.targetId).sort()).toEqual(ids);
    expect(reviews.every((r) => r.skill === 'match:en' && r.contentVersion === 'r1')).toBe(true);
    const overview: CatalogOverview = {
      releaseId: 'r1',
      internal: true,
      learnable: 4,
      groups: { fish: 4, crustacean: 0, mollusc: 0, other: 0, none: 0 },
      hsCases: 0,
      items: [...ids, 'item-d'].map((itemId) => ({
        revisionId: 'rev-' + itemId,
        itemId,
        vi: itemId,
        scientific: itemId,
        taxonomicGroup: 'fish' as const,
        imageId: null,
      })),
    };
    const en = (l: typeof first) =>
      skillProgress(overview, Object.values(l.reviews)).find((p) => p.key === 'en')!;
    // A first answer only schedules (stage 0); a correct review in a later session advances it.
    expect(en(first)).toMatchObject({ done: 0, total: 4 });
    const review = { ...game, id: 'g2', mode: 'review' } as unknown as Game;
    const next = mergeScore(
      first,
      { ...match, questionId: 'q2', at: '2026-01-03T00:00:00Z' },
      review,
    );
    expect(Object.values(next.reviews).map((r) => r.stage)).toEqual([1, 1, 1]);
    expect(en(next)).toMatchObject({ done: 3, total: 4 });
  });
});
