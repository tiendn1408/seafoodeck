import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learnerMetrics } from './progress-manager';
import { solidSpecies } from './progress.service';
import { DAY } from './progress-review';
import type { ReviewRow } from './progress-review';
import type { OverviewData } from './progress-derive';

const NOW = Date.parse('2026-06-10T05:00:00.000Z'); // 12:00 in Vietnam
const o: OverviewData = {
  items: ['A', 'B', 'C', 'D'].map((x) => ({
    revisionId: 'r' + x,
    itemId: 'i' + x,
    vi: x,
    scientific: '',
    taxonomicGroup: null,
    imageId: null,
  })),
  learnable: 4,
  hsCases: 0,
};
const row = (item: string, over: Partial<ReviewRow> = {}): ReviewRow => ({
  targetId: 'i' + item,
  skill: 'name:en',
  stage: 0,
  dueAt: new Date(NOW + DAY).toISOString(),
  lastSessionId: 's',
  contentVersion: 'v',
  selfRated: false,
  lastAttemptAt: new Date(NOW).toISOString(),
  ...over,
});
const at = (iso: string, sessionId = 'x', skipped = false) => ({ sessionId, skipped, at: iso });

test('no answers at all: 0, 0, null, null, 0, 0', () => {
  assert.deepEqual(learnerMetrics(o, [], [], NOW), {
    learning: 0,
    solid: 0,
    avgLevel: null,
    lastStudyAt: null,
    overdue: 0,
    sessions7d: 0,
  });
});

test('learning, average level (1 decimal), overdue by effective due date', () => {
  const rows = [
    row('A'), // level 1, not due
    row('B', { stage: 1 }), // level 2
    row('C', { stage: 2 }), // level 3
    // listening-only target and unrelated skill do not make D "learning"
    row('D', { skill: 'listening:vi', targetId: 'iD/listening/vi' }),
  ];
  const m = learnerMetrics(o, rows, [], NOW);
  assert.equal(m.learning, 3);
  assert.equal(m.avgLevel, 2); // (1+2+3)/3
  assert.equal(m.overdue, 0);
  const odd = learnerMetrics(o, [row('A'), row('B', { stage: 3 })], [], NOW);
  assert.equal(odd.avgLevel, 2.5);
  // dueAt in the past but lastAttemptAt + interval in the future: effective due is later, not overdue
  const fresh = row('A', {
    dueAt: new Date(NOW - 2 * DAY).toISOString(),
    lastAttemptAt: new Date(NOW - 1000).toISOString(),
  });
  assert.equal(learnerMetrics(o, [fresh], [], NOW).overdue, 0);
  const stale = row('A', {
    dueAt: new Date(NOW - 2 * DAY).toISOString(),
    lastAttemptAt: new Date(NOW - 3 * DAY).toISOString(),
  });
  assert.equal(learnerMetrics(o, [stale, row('B')], [], NOW).overdue, 1);
  assert.equal(
    learnerMetrics(
      o,
      [
        row('A', {
          stage: 1,
          dueAt: new Date(NOW - DAY).toISOString(),
          lastAttemptAt: new Date(NOW - 4 * DAY).toISOString(),
        }),
      ],
      [],
      NOW,
    ).overdue,
    1,
  );
});

test('solid threshold: stage 1 is level 2 (not solid), stage 2 is level 3 (solid)', () => {
  assert.equal(learnerMetrics(o, [row('A', { stage: 1 })], [], NOW).solid, 0);
  assert.equal(learnerMetrics(o, [row('A', { stage: 2 })], [], NOW).solid, 1);
  assert.equal(learnerMetrics(o, [row('A', { stage: 3 })], [], NOW).solid, 1);
});

test('solid matches ProgressService.solidSpecies on the same data', () => {
  const rows = [
    row('A', { stage: 0 }),
    row('A', { skill: 'image', stage: 2 }),
    row('B', { stage: 1 }),
    row('C', { stage: 3 }),
    row('D', { stage: 2, targetId: 'iD/listening/vi', skill: 'listening:vi' }),
    row('Z', { stage: 3 }), // not in catalog
  ];
  assert.equal(learnerMetrics(o, rows, [], NOW).solid, solidSpecies(o, rows));
  for (let s = 0; s <= 3; s++)
    assert.equal(
      learnerMetrics(o, [row('A', { stage: s })], [], NOW).solid,
      solidSpecies(o, [row('A', { stage: s })]),
    );
});

test('lastStudyAt ignores skipped answers; sessions7d counts distinct sessions', () => {
  const log = [
    at('2026-06-09T03:00:00.000Z', 'a'),
    at('2026-06-09T03:05:00.000Z', 'a'),
    at('2026-06-08T03:00:00.000Z', 'b'),
    at('2026-06-10T04:00:00.000Z', 'c', true), // skipped: ignored entirely
  ];
  const m = learnerMetrics(o, [], log, NOW);
  assert.equal(m.lastStudyAt, '2026-06-09T03:05:00.000Z');
  assert.equal(m.sessions7d, 2);
  assert.equal(
    learnerMetrics(o, [], [at('2026-06-10T04:00:00.000Z', 'c', true)], NOW).lastStudyAt,
    null,
  );
});

test('7-day window is Vietnam days: midnight boundary and month rollover', () => {
  // now = 2026-07-02 12:00 VN: window is VN days Jun 26 .. Jul 2
  const now = Date.parse('2026-07-02T05:00:00.000Z');
  const inside = at('2026-06-25T17:00:00.000Z', 'in'); // Jun 26 00:00 VN: first day in window
  const outside = at('2026-06-25T16:59:59.000Z', 'out'); // Jun 25 23:59:59 VN
  assert.equal(learnerMetrics(o, [], [inside], now).sessions7d, 1);
  assert.equal(learnerMetrics(o, [], [outside], now).sessions7d, 0);
  assert.equal(learnerMetrics(o, [], [outside], now).lastStudyAt, outside.at);
  // crosses the VN midnight: 16:59Z and 17:00Z are different VN days but both inside
  assert.equal(
    learnerMetrics(
      o,
      [],
      [at('2026-07-01T16:59:00.000Z', 'p'), at('2026-07-01T17:00:00.000Z', 'q')],
      now,
    ).sessions7d,
    2,
  );
});
