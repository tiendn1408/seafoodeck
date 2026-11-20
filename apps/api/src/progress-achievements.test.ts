import { test } from 'node:test';
import assert from 'node:assert/strict';
import { badges, dayKey, figures, recentSessions, streakDays } from './progress-achievements';
import type { LogRow } from './progress-achievements';

const row = (over: Partial<LogRow> = {}): LogRow => ({
  sessionId: 's1',
  targetId: 't1',
  skill: 'name:en',
  mode: 'flashcard',
  isReview: false,
  attemptNumber: 1,
  correct: true,
  skipped: false,
  selfRated: false,
  label: 'x',
  at: '2026-06-01T03:00:00Z',
  ...over,
});

test('dayKey uses Vietnam time', () => {
  assert.equal(dayKey('2026-06-01T16:59:00Z'), '2026-06-01'); // 23:59 +7
  assert.equal(dayKey('2026-06-01T17:01:00Z'), '2026-06-02'); // 00:01 +7
});

test('23:59 and 00:01 Vietnam time are consecutive days', () => {
  const rows = [row({ at: '2026-06-01T16:59:00Z' }), row({ at: '2026-06-01T17:01:00Z' })];
  assert.deepEqual(streakDays(rows, Date.parse('2026-06-01T17:30:00Z')), {
    current: 2,
    longest: 2,
  });
});

test('streak across month end', () => {
  const rows = ['2026-01-30', '2026-01-31', '2026-02-01'].map((d) => row({ at: d + 'T05:00:00Z' }));
  assert.deepEqual(streakDays(rows, Date.parse('2026-02-01T09:00:00Z')), {
    current: 3,
    longest: 3,
  });
});

test('streak is alive when only yesterday was studied', () => {
  const rows = ['2026-06-01', '2026-06-02'].map((d) => row({ at: d + 'T05:00:00Z' }));
  assert.equal(streakDays(rows, Date.parse('2026-06-03T05:00:00Z')).current, 2);
});

test('broken streak: current 0, longest kept; skipped rows do not count', () => {
  const rows = [
    ...['2026-06-01', '2026-06-02', '2026-06-03'].map((d) => row({ at: d + 'T05:00:00Z' })),
    row({ at: '2026-06-05T05:00:00Z', skipped: true }),
  ];
  assert.deepEqual(streakDays(rows, Date.parse('2026-06-05T05:00:00Z')), {
    current: 0,
    longest: 3,
  });
  assert.deepEqual(streakDays([], 0), { current: 0, longest: 0 });
});

test('recentSessions groups by session, newest first, limit default 5', () => {
  const rows: LogRow[] = [];
  for (let i = 1; i <= 7; i++)
    rows.push(row({ sessionId: 's' + i, at: `2026-06-0${i}T05:00:00Z` }));
  const out = recentSessions(rows);
  assert.equal(out.length, 5);
  assert.equal(out[0]!.sessionId, 's7');
  assert.equal(recentSessions(rows, 2).length, 2);
});

test('recentSessions splits self-rated, percent, mode', () => {
  const rows = [
    row({ at: '2026-06-01T05:00:00Z' }),
    row({ correct: false, at: '2026-06-01T05:01:00Z' }),
    row({ selfRated: true, at: '2026-06-01T05:02:00Z' }),
    row({ skipped: true, at: '2026-06-01T05:03:00Z' }),
    row({ sessionId: 's2', selfRated: true, skill: 'match:en', at: '2026-06-02T05:00:00Z' }),
    row({ sessionId: 's3', isReview: true, skill: 'hs', at: '2026-06-03T05:00:00Z' }),
  ];
  const out = recentSessions(rows);
  const s1 = out.find((s) => s.sessionId === 's1')!;
  assert.deepEqual(
    [s1.mode, s1.answered, s1.firstTry, s1.selfRated, s1.percent],
    ['flashcard', 2, 1, 1, 50],
  );
  assert.equal(s1.at, '2026-06-01T05:03:00Z');
  const s2 = out.find((s) => s.sessionId === 's2')!;
  assert.deepEqual([s2.mode, s2.answered, s2.selfRated, s2.percent], ['match', 0, 1, null]);
  assert.equal(out.find((s) => s.sessionId === 's3')!.mode, 'review');
});

test('figures follows the Progress screen split', () => {
  const rows = [row(), row({ correct: false }), row({ selfRated: true }), row({ skipped: true })];
  assert.deepEqual(figures(rows), { answered: 2, firstTryPercent: 50, selfRated: 1 });
  assert.deepEqual(figures([]), { answered: 0, firstTryPercent: null, selfRated: 0 });
});

test('badges: earnedAt null when not reached', () => {
  const none = badges({ species: 3, solid: 0, reviewSessions: 0, streak: 2, at: [] });
  assert.deepEqual(
    none.map((b) => [b.id, b.earnedAt]),
    [
      ['first10', null],
      ['streak7', null],
      ['solid50', null],
      ['species100', null],
      ['review10', null],
    ],
  );
});

test('badges: reached ones carry a date', () => {
  const at = Array.from(
    { length: 12 },
    (_, i) => `2026-06-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
  );
  const out = badges({ species: 12, solid: 0, reviewSessions: 10, streak: 7, at });
  const by = Object.fromEntries(out.map((b) => [b.id, b.earnedAt]));
  assert.equal(by.first10, at[9]);
  assert.equal(by.streak7, at[11]);
  assert.equal(by.review10, at[11]);
  assert.equal(by.solid50, null);
  assert.equal(by.species100, null);
});

test('badges: reached badge with no species instants falls back to lastAt, never null', () => {
  const lastAt = '2026-03-09T10:00:00.000Z';
  const out = badges({ species: 0, solid: 0, reviewSessions: 10, streak: 7, at: [], lastAt });
  const by = Object.fromEntries(out.map((b) => [b.id, b.earnedAt]));
  assert.equal(by.review10, lastAt);
  assert.equal(by.streak7, lastAt);
  assert.equal(by.first10, null);
  assert.equal(by.solid50, null);
});
