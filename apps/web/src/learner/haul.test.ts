import { describe, expect, it } from 'vitest';
import {
  groupTone,
  itemStatus,
  masteryCounts,
  masteryLevel,
  pickHaul,
  planCast,
  skillProgress,
} from './haul';
import type { CatalogOverview } from '../pilot/api';
import type { ReviewState, Skill } from '../domain/models';

const NOW = Date.parse('2026-06-01T00:00:00Z');
const mk = (n: number): CatalogOverview => ({
  releaseId: 'r1',
  internal: true,
  learnable: n,
  groups: { fish: n, crustacean: 0, mollusc: 0, other: 0, none: 0 },
  hsCases: 4,
  items: Array.from({ length: n }, (_, i) => ({
    revisionId: 'rev' + i,
    itemId: 'i' + i,
    vi: 'Loài ' + i,
    scientific: 'Sp ' + i,
    taxonomicGroup: 'fish' as const,
    imageId: null,
  })),
});
const rv = (
  id: string,
  skill: Skill,
  stage: number,
  dueDays: number,
  version = 'r1',
): ReviewState => ({
  key: id + '/' + skill,
  targetId: id,
  skill,
  stage,
  dueAt: new Date(NOW + dueDays * 86_400_000).toISOString(),
  lastSessionId: 's',
  contentVersion: version,
  selfRated: false,
});

describe('groupTone', () => {
  it('maps groups', () => {
    expect(groupTone(null).key).toBe('none');
    expect(groupTone('crustacean').label).toBe('Giáp xác');
    expect(groupTone('fish').css).toBe('var(--group-fish)');
  });
});
describe('haul', () => {
  it('empty ledger: flashcard on first item, first 5 hauled', () => {
    const o = mk(8);
    expect(planCast(o, [], NOW)).toEqual({ kind: 'flashcard', revisionId: 'rev0' });
    expect(pickHaul(o, [], NOW).map((i) => i.itemId)).toEqual(['i0', 'i1', 'i2', 'i3', 'i4']);
  });
  it('10 due items: 8 targets ascending, due before new', () => {
    const o = mk(12);
    const rs = Array.from({ length: 10 }, (_, i) => rv('i' + (9 - i), 'name:en', 0, -(i + 1)));
    const plan = planCast(o, rs, NOW);
    expect(plan.kind).toBe('review');
    if (plan.kind === 'review') {
      expect(plan.targets).toHaveLength(8);
      expect(plan.targets[0].targetId).toBe('i0');
      expect(plan.targets[7].targetId).toBe('i7');
    }
    expect(
      pickHaul(o, rs, NOW, 12)
        .slice(10)
        .map((i) => i.itemId),
    ).toEqual(['i10', 'i11']);
    expect(pickHaul(o, rs, NOW)[0].itemId).toBe('i0');
  });
  it('all learned, none due: done', () => {
    const o = mk(2);
    const rs = [rv('i0', 'name:en', 1, 3), rv('i1', 'name:en', 1, 3)];
    expect(planCast(o, rs, NOW)).toEqual({ kind: 'done' });
    expect(itemStatus('i0', rs, NOW)).toBe('learning');
  });
  it('ignores other releases', () => {
    const o = mk(1);
    const rs = [rv('i0', 'name:en', 1, -1, 'old')];
    expect(planCast(o, rs, NOW).kind).toBe('flashcard');
    expect(pickHaul(o, rs, NOW).map((i) => i.itemId)).toEqual(['i0']);
  });
});
describe('Item-uuid identity', () => {
  it('classifies a review by overview itemId (Item uuid) as ledger targetId', () => {
    const o = mk(2);
    o.items[0].itemId = 'uuid-1';
    o.items[1].itemId = 'uuid-2';
    const rs = [rv('uuid-1', 'name:en', 1, 3)];
    expect(itemStatus('uuid-1', rs, NOW)).toBe('learning');
    expect(itemStatus('uuid-2', rs, NOW)).toBe('new');
    expect(itemStatus('ext-1', rs, NOW)).toBe('new');
    expect(pickHaul(o, rs, NOW).map((i) => i.itemId)).toEqual(['uuid-2']);
  });
});
describe('progress', () => {
  it('counts an item once per language', () => {
    const o = mk(3);
    const rs = [rv('i0', 'name:en', 1, 1), rv('i0', 'match:en', 2, 1)];
    const en = skillProgress(o, rs).find((p) => p.key === 'en')!;
    expect(en.done).toBe(1);
    expect(en.total).toBe(3);
  });
  it('mastery 0 without reviews, max stage + 1 otherwise', () => {
    expect(masteryLevel([], 'i0')).toBe(0);
    expect(masteryLevel([rv('i0', 'name:en', 1, 1), rv('i0', 'image', 3, 1)], 'i0')).toBe(4);
  });
  it('counts species per mastery level for the current release only', () => {
    const counts = masteryCounts(mk(5), [
      rv('i0', 'name:en', 0, 1),
      rv('i1', 'name:en', 1, 1),
      rv('i1', 'match:ja', 2, 1),
      rv('i2', 'image', 5, 1),
      rv('i3', 'name:en', 3, 1, 'old-release'),
      rv('zz', 'hs', 2, 1),
    ]);
    // level 0 (not studied), 1, 2, 3, 4
    expect(counts).toEqual([2, 1, 0, 1, 1]);
  });
});
