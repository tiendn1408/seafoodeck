import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY } from './progress-review';
import type { ReviewRow } from './progress-review';
import {
  activeRows,
  dueTargets,
  itemStatus,
  masteryCounts,
  masteryLevel,
  pickHaul,
  planCast,
  skillProgress,
} from './progress-derive';
import type { OverviewData } from './progress-derive';

const NOW = Date.parse('2026-06-01T00:00:00Z');
const mk = (n: number): OverviewData => ({
  learnable: n,
  hsCases: 4,
  items: Array.from({ length: n }, (_, i) => ({
    revisionId: 'rev' + i,
    itemId: 'i' + i,
    vi: 'Loài ' + i,
    scientific: 'Sp ' + i,
    taxonomicGroup: 'fish',
    imageId: null,
  })),
});
const rv = (
  id: string,
  skill: string,
  stage: number,
  dueDays: number,
  extra: Partial<ReviewRow> = {},
): ReviewRow => ({
  targetId: id,
  skill,
  stage,
  dueAt: new Date(NOW + dueDays * DAY).toISOString(),
  lastSessionId: 's',
  contentVersion: 'v1',
  selfRated: false,
  lastAttemptAt: new Date(NOW - 365 * DAY).toISOString(),
  ...extra,
});

test('empty ledger: flashcard on first item, first 5 hauled', () => {
  const o = mk(8);
  assert.deepEqual(planCast(o, [], NOW), { kind: 'flashcard', revisionId: 'rev0' });
  assert.deepEqual(
    pickHaul(o, [], NOW).map((i) => i.itemId),
    ['i0', 'i1', 'i2', 'i3', 'i4'],
  );
});

test('10 due items: 8 targets ascending, due before new', () => {
  const o = mk(12);
  const rs = Array.from({ length: 10 }, (_, i) => rv('i' + (9 - i), 'name:en', 0, -(i + 1)));
  const plan = planCast(o, rs, NOW);
  assert.equal(plan.kind, 'review');
  if (plan.kind === 'review') {
    assert.equal(plan.targets.length, 8);
    assert.equal(plan.targets[0].targetId, 'i0');
    assert.equal(plan.targets[7].targetId, 'i7');
  }
  assert.deepEqual(
    pickHaul(o, rs, NOW, 12)
      .slice(10)
      .map((i) => i.itemId),
    ['i10', 'i11'],
  );
  assert.equal(pickHaul(o, rs, NOW)[0].itemId, 'i0');
  assert.equal(dueTargets(rs, NOW, 3).length, 3);
  assert.equal(dueTargets(rs, NOW, 3)[0].targetId, 'i0');
});

test('all learned, none due: done', () => {
  const o = mk(2);
  const rs = [rv('i0', 'name:en', 1, 3), rv('i1', 'name:en', 1, 3)];
  assert.deepEqual(planCast(o, rs, NOW), { kind: 'done' });
  assert.equal(itemStatus('i0', rs, NOW), 'learning');
  assert.equal(itemStatus('zzz', rs, NOW), 'new');
});

test('activeRows drops stale fingerprints: renamed species becomes new, others keep state', () => {
  const o = mk(2);
  const rows = [rv('i0', 'name:en', 1, 3, { contentVersion: 'old' }), rv('i1', 'name:en', 1, 3)];
  const versions: Record<string, string> = { i0: 'new', i1: 'v1' };
  const active = activeRows(rows, (t) => versions[t]);
  assert.equal(active.length, 1);
  assert.equal(itemStatus('i0', active, NOW), 'new');
  assert.equal(itemStatus('i1', active, NOW), 'learning');
  assert.equal(activeRows(rows, () => undefined).length, 0);
  assert.equal(pickHaul(o, active, NOW)[0].itemId, 'i0');
});

test('listening does not make an item learning', () => {
  assert.equal(itemStatus('i0', [rv('i0', 'listening', 1, 3)], NOW), 'new');
  assert.equal(itemStatus('i0', [rv('i0', 'hs', 1, 3)], NOW), 'learning');
});

test('self-rated review after due is not due again immediately', () => {
  const row = rv('i0', 'name:en', 0, -5, {
    selfRated: true,
    lastAttemptAt: new Date(NOW - 1000).toISOString(),
  });
  assert.equal(itemStatus('i0', [row], NOW), 'learning');
  assert.equal(itemStatus('i0', [row], NOW + DAY + 1), 'due');
  assert.equal(dueTargets([row], NOW, 5).length, 0);
});

test('skillProgress ignores foreign targets and never exceeds totals', () => {
  const o = mk(2);
  const rs = [
    rv('i0', 'name:en', 1, 1),
    rv('stale-item', 'name:en', 2, 1),
    rv('matching', 'match:en', 1, 1),
    rv('i1', 'match:en', 1, 1),
    ...['a', 'b', 'c', 'd', 'e', 'f'].map((id) => rv(id, 'hs', 1, 1)),
  ];
  const p = skillProgress(o, rs);
  assert.deepEqual(
    p.map((x) => x.label),
    ['Tiếng Anh', 'Tiếng Nhật', 'Tên khoa học', 'HS dạng hàng'],
  );
  assert.equal(p.find((x) => x.key === 'en')!.done, 2);
  assert.equal(p.find((x) => x.key === 'hs')!.done, 4);
  const one = skillProgress(mk(3), [rv('i0', 'name:en', 1, 1), rv('i0', 'match:en', 2, 1)]);
  assert.equal(one.find((x) => x.key === 'en')!.done, 1);
});

test('masteryLevel 0..4 and counts', () => {
  assert.equal(masteryLevel([], 'i0'), 0);
  assert.equal(masteryLevel([rv('i0', 'name:en', 0, 1)], 'i0'), 1);
  assert.equal(masteryLevel([rv('i0', 'name:en', 1, 1), rv('i0', 'image', 3, 1)], 'i0'), 4);
  assert.deepEqual(
    masteryCounts(mk(5), [
      rv('i0', 'name:en', 0, 1),
      rv('i1', 'name:en', 1, 1),
      rv('i1', 'match:ja', 2, 1),
      rv('i2', 'image', 5, 1),
      rv('zz', 'hs', 2, 1),
    ]),
    { unlearned: 2, level1: 1, level2: 0, level3: 1, level4: 1 },
  );
});
