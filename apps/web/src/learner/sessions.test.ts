import { describe, expect, it } from 'vitest';
import type { Attempt, Skill } from '../domain/models';
import { recentSessions } from './sessions';

let n = 0;
const a = (
  sessionId: string,
  at: string,
  extra: Partial<Attempt> & { skill?: Skill } = {},
): Attempt => ({
  id: 'a' + n++,
  sessionId,
  questionId: 'q' + n,
  targetId: 't' + n,
  skill: 'image',
  contentVersion: 'r1',
  attemptNumber: 1,
  correct: true,
  selfRated: false,
  isReview: false,
  answer: 'submitted',
  at: `2026-11-${at}:00.000Z`,
  ...extra,
});

describe('recentSessions', () => {
  it('is empty without attempts in the release', () => {
    expect(recentSessions([], 'r1')).toEqual([]);
    expect(recentSessions([a('s', '10T08:00', { contentVersion: 'r0' })], 'r1')).toEqual([]);
  });

  it('groups by session, newest first, last 5, labelled by mode', () => {
    const attempts = [
      a('flash', '10T08:00', { skill: 'name:en', selfRated: true }),
      a('flash', '10T08:01', { skill: 'name:ja', selfRated: true }),
      a('match', '11T08:00', { skill: 'match:ja' }),
      a('image', '12T08:00'),
      a('hs', '13T08:00', { skill: 'hs' }),
      a('review', '14T08:00', { skill: 'name:en', isReview: true }),
      a('listen', '15T08:00', { skill: 'listening' }),
      a('other-release', '16T08:00', { contentVersion: 'r0' }),
    ];
    const rows = recentSessions(attempts, 'r1');
    expect(rows.map((r) => [r.sessionId, r.mode])).toEqual([
      ['listen', 'Nghe tên'],
      ['review', 'Ôn tập'],
      ['hs', 'HS'],
      ['image', 'Đoán hình'],
      ['match', 'Ghép tên'],
    ]);
    expect(recentSessions(attempts, 'r1', 10).at(-1)).toMatchObject({
      sessionId: 'flash',
      mode: 'Flashcard',
      at: Date.parse('2026-11-10T08:01:00.000Z'),
    });
  });

  it('splits graded answers from self-rated cards and skips skipped ones', () => {
    const rows = recentSessions(
      [
        a('s', '10T08:00'),
        a('s', '10T08:01', { correct: false }),
        a('s', '10T08:02'),
        a('s', '10T08:03', { attemptNumber: 2 }),
        a('s', '10T08:04', { selfRated: true, skill: 'name:en' }),
        a('s', '10T08:05', { skipped: true, correct: false }),
      ],
      'r1',
    );
    expect(rows).toEqual([
      {
        sessionId: 's',
        at: Date.parse('2026-11-10T08:05:00.000Z'),
        mode: 'Đoán hình',
        answered: 4,
        firstTry: 2,
        percent: 50,
        selfRated: 1,
      },
    ]);
  });

  it('has no percentage for a session of self-rated cards only', () => {
    const [row] = recentSessions([a('f', '10T08:00', { selfRated: true, skill: 'name:en' })], 'r1');
    expect(row).toMatchObject({ answered: 0, firstTry: 0, percent: null, selfRated: 1 });
  });
});
