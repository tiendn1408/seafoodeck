import { describe, expect, it } from 'vitest';
import { empty, mergeScore } from './ledger';
import type { Game, Score } from '../pilot/api';

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
});
