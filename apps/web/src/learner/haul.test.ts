import { describe, expect, it } from 'vitest';
import { DAY, scheduleReview } from '../domain/review';
import {
  effectiveDueAt,
  groupTone,
  splitDue,
  itemStatus,
  masteryCounts,
  masteryLevel,
  pickHaul,
  planCast,
  skillProgress,
} from './haul';
import type { CatalogOverview } from '../pilot/api';
import type { Attempt, ReviewState, Skill } from '../domain/models';

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
    expect(planCast(o, [], [], NOW)).toEqual({ kind: 'flashcard', revisionId: 'rev0' });
    expect(pickHaul(o, [], [], NOW).map((i) => i.itemId)).toEqual(['i0', 'i1', 'i2', 'i3', 'i4']);
  });
  it('10 due items: 8 targets ascending, due before new', () => {
    const o = mk(12);
    const rs = Array.from({ length: 10 }, (_, i) => rv('i' + (9 - i), 'name:en', 0, -(i + 1)));
    const plan = planCast(o, rs, [], NOW);
    expect(plan.kind).toBe('review');
    if (plan.kind === 'review') {
      expect(plan.targets).toHaveLength(8);
      expect(plan.targets[0].targetId).toBe('i0');
      expect(plan.targets[7].targetId).toBe('i7');
    }
    expect(
      pickHaul(o, rs, [], NOW, 12)
        .slice(10)
        .map((i) => i.itemId),
    ).toEqual(['i10', 'i11']);
    expect(pickHaul(o, rs, [], NOW)[0].itemId).toBe('i0');
  });
  it('all learned, none due: done', () => {
    const o = mk(2);
    const rs = [rv('i0', 'name:en', 1, 3), rv('i1', 'name:en', 1, 3)];
    expect(planCast(o, rs, [], NOW)).toEqual({ kind: 'done' });
    expect(itemStatus('i0', rs, [], NOW)).toBe('learning');
  });
  it('ignores other releases', () => {
    const o = mk(1);
    const rs = [rv('i0', 'name:en', 1, -1, 'old')];
    expect(planCast(o, rs, [], NOW).kind).toBe('flashcard');
    expect(pickHaul(o, rs, [], NOW).map((i) => i.itemId)).toEqual(['i0']);
  });
});
describe('Item-uuid identity', () => {
  it('classifies a review by overview itemId (Item uuid) as ledger targetId', () => {
    const o = mk(2);
    o.items[0].itemId = 'uuid-1';
    o.items[1].itemId = 'uuid-2';
    const rs = [rv('uuid-1', 'name:en', 1, 3)];
    expect(itemStatus('uuid-1', rs, [], NOW)).toBe('learning');
    expect(itemStatus('uuid-2', rs, [], NOW)).toBe('new');
    expect(itemStatus('ext-1', rs, [], NOW)).toBe('new');
    expect(pickHaul(o, rs, [], NOW).map((i) => i.itemId)).toEqual(['uuid-2']);
  });
});
describe('groupTone', () => {
  it('falls back to none for unknown strings and prototype keys', () => {
    expect(groupTone('mollusc').key).toBe('mollusc');
    expect(groupTone('seaweed').key).toBe('none');
    expect(groupTone('constructor')).toEqual({
      key: 'none',
      label: 'Chưa phân nhóm',
      css: 'var(--group-none)',
    });
    expect(groupTone('toString').key).toBe('none');
    expect(groupTone('__proto__').key).toBe('none');
  });
});
describe('progress', () => {
  it('ignores targetIds outside the overview and never exceeds the total', () => {
    const o = mk(2);
    const rs = [
      rv('i0', 'name:en', 1, 1),
      rv('stale-item', 'name:en', 2, 1),
      rv('matching', 'match:en', 1, 1),
      rv('i1', 'match:en', 1, 1),
      ...['a', 'b', 'c', 'd', 'e', 'f'].map((id) => rv(id, 'hs', 1, 1)),
    ];
    const p = skillProgress(o, rs);
    expect(p.find((x) => x.key === 'en')).toMatchObject({ done: 2, total: 2 });
    expect(p.find((x) => x.key === 'hs')).toMatchObject({ done: 4, total: 4 });
  });
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

describe('effective due date (self-rated reviews do not replay forever)', () => {
  const D0 = Date.parse('2026-06-01T08:00:00Z');
  const at = (days: number, hours = 0) =>
    new Date(D0 + days * DAY + hours * 3_600_000).toISOString();
  let n = 0;
  const attempt = (extra: Partial<Attempt>): Attempt => ({
    id: 'a' + n++,
    sessionId: 's' + n,
    questionId: 'q',
    targetId: 'i0',
    skill: 'name:en',
    contentVersion: 'r1',
    attemptNumber: 1,
    correct: true,
    selfRated: true,
    isReview: false,
    answer: 'submitted',
    at: at(0),
    ...extra,
  });
  /** Feed attempts through the real scheduler, as the ledger does. */
  function play(list: Attempt[]) {
    const reviews: Record<string, ReviewState> = {};
    for (const a of list) {
      const key = a.targetId + '/' + a.skill;
      if (!a.skipped) reviews[key] = scheduleReview(reviews[key], a);
    }
    return { reviews: Object.values(reviews), attempts: list };
  }
  const learnDay0 = () => attempt({ sessionId: 'learn', at: at(0) });
  const selfRatedReviewDay2 = () =>
    attempt({ sessionId: 'review-2', at: at(2), isReview: true, selfRated: true });

  it('(a) first learn on day 0 is due on day 1', () => {
    const { reviews, attempts } = play([learnDay0()]);
    expect(effectiveDueAt(reviews[0], attempts)).toBe(Date.parse(at(1)));
    expect(itemStatus('i0', reviews, attempts, Date.parse(at(0, 23)))).toBe('learning');
    expect(itemStatus('i0', reviews, attempts, Date.parse(at(1)))).toBe('due');
  });

  it('(b) a self-rated "Đã nhớ" review on day 2 is due again one stage-0 interval later, not forever', () => {
    const { reviews, attempts } = play([learnDay0(), selfRatedReviewDay2()]);
    // The stored state is unchanged by design: still stage 0, dueAt stuck on day 1.
    expect(reviews[0].stage).toBe(0);
    expect(reviews[0].dueAt).toBe(at(1));
    expect(effectiveDueAt(reviews[0], attempts)).toBe(Date.parse(at(3)));
    expect(itemStatus('i0', reviews, attempts, Date.parse(at(2)))).toBe('learning');
    expect(itemStatus('i0', reviews, attempts, Date.parse(at(2, 23)))).toBe('learning');
    expect(itemStatus('i0', reviews, attempts, Date.parse(at(3)))).toBe('due');
  });

  it('(c) "Thả lưới" on day 2 after that review moves on to the next new species', () => {
    const o = mk(2);
    const { reviews, attempts } = play([learnDay0(), selfRatedReviewDay2()]);
    expect(planCast(o, reviews, attempts, Date.parse(at(2, 1)))).toEqual({
      kind: 'flashcard',
      revisionId: 'rev1',
    });
    expect(pickHaul(o, reviews, attempts, Date.parse(at(2, 1))).map((i) => i.itemId)).toEqual([
      'i1',
    ]);
    // With every species learned and practised, the cast is done rather than a replay.
    const all = play([
      learnDay0(),
      attempt({ targetId: 'i1', sessionId: 'learn', at: at(0) }),
      selfRatedReviewDay2(),
      attempt({ targetId: 'i1', sessionId: 'review-2', at: at(2), isReview: true }),
    ]);
    expect(planCast(o, all.reviews, all.attempts, Date.parse(at(2, 1)))).toEqual({ kind: 'done' });
  });

  it('(d) a wrong answer still brings the item back as due', () => {
    const { reviews, attempts } = play([
      learnDay0(),
      selfRatedReviewDay2(),
      attempt({
        sessionId: 'review-3',
        at: at(3),
        isReview: true,
        selfRated: false,
        correct: false,
      }),
    ]);
    expect(itemStatus('i0', reviews, attempts, Date.parse(at(3, 1)))).toBe('learning');
    expect(itemStatus('i0', reviews, attempts, Date.parse(at(4)))).toBe('due');
    expect(planCast(mk(1), reviews, attempts, Date.parse(at(4)))).toEqual({
      kind: 'review',
      targets: [{ targetId: 'i0', skill: 'name:en' }],
    });
  });

  it('(e) attempts from a different release are ignored', () => {
    const { reviews } = play([learnDay0()]);
    const other = [attempt({ sessionId: 'old', at: at(2), contentVersion: 'r0' })];
    expect(effectiveDueAt(reviews[0], other)).toBe(Date.parse(at(1)));
    expect(planCast(mk(1), reviews, other, Date.parse(at(2))).kind).toBe('review');
  });

  it('the Review screen splits due and scheduled by the effective date, earliest first', () => {
    const { reviews, attempts } = play([
      learnDay0(),
      attempt({ targetId: 'i1', sessionId: 'learn', at: at(0, 1) }),
      selfRatedReviewDay2(),
    ]);
    const split = splitDue(reviews, attempts, Date.parse(at(2, 2)));
    expect(split.due.map((d) => d.review.targetId)).toEqual(['i1']);
    expect(split.later.map((d) => [d.review.targetId, d.at])).toEqual([['i0', Date.parse(at(3))]]);
  });

  it('skipped attempts do not count as practice', () => {
    const { reviews } = play([learnDay0()]);
    const skipped = [attempt({ sessionId: 'x', at: at(2), skipped: true })];
    expect(effectiveDueAt(reviews[0], skipped)).toBe(Date.parse(at(1)));
  });
});
