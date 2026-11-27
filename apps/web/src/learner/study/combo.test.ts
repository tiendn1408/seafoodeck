import { describe, expect, it } from 'vitest';
import type { ApiQuestion, Score } from '../../pilot/api';
import { pairCombo, sessionCombo } from './combo';

const q = (id: string, extra?: Partial<Score> | null): ApiQuestion => ({
  id,
  type: 'image',
  prompt: 'p',
  unavailable: false,
  ...(extra === null
    ? {}
    : {
        result: {
          answered: true,
          skipped: false,
          correct: true,
          selfRated: false,
          questionId: id,
          targetId: 't',
          skill: 's',
          contentVersion: 'v',
          explanation: '',
          ...extra,
        },
      }),
});
const ok = (id: string) => q(id);
const bad = (id: string) => q(id, { correct: false });

describe('sessionCombo', () => {
  it('is zero for no questions', () => {
    expect(sessionCombo([])).toEqual({ current: 0, best: 0 });
  });
  it.each([
    ['ccc', [ok('1'), ok('2'), ok('3')], { current: 3, best: 3 }],
    ['cc wrong', [ok('1'), ok('2'), bad('3')], { current: 0, best: 2 }],
    ['c w cc', [ok('1'), bad('2'), ok('3'), ok('4')], { current: 2, best: 2 }],
    ['cc w c', [ok('1'), ok('2'), bad('3'), ok('4')], { current: 1, best: 2 }],
  ])('%s', (_, qs, want) => {
    expect(sessionCombo(qs)).toEqual(want);
  });
  it('ignores skipped and self-rated results in between', () => {
    const qs = [
      ok('1'),
      q('2', { skipped: true, answered: false, correct: false }),
      q('3', { selfRated: true, correct: false }),
      ok('4'),
    ];
    expect(sessionCombo(qs)).toEqual({ current: 2, best: 2 });
  });
  it('ignores questions without a result, also after the last answered one', () => {
    expect(sessionCombo([ok('1'), q('2', null), ok('3'), q('4', null)])).toEqual({
      current: 2,
      best: 2,
    });
  });
  it('counts a provisional correct result like a confirmed one', () => {
    expect(sessionCombo([ok('1'), q('2', { provisional: true })])).toEqual({
      current: 2,
      best: 2,
    });
  });
  it('is pure: the same input gives the same output', () => {
    const qs = [ok('1'), ok('2'), bad('3'), ok('4')];
    expect(sessionCombo(qs)).toEqual(sessionCombo(qs));
    expect(sessionCombo(qs)).toEqual({ current: 1, best: 2 });
  });
});

describe('pairCombo', () => {
  it('gives the running streak per position', () => {
    expect(pairCombo([true, true, false, true])).toEqual([1, 2, 0, 1]);
    expect(pairCombo([])).toEqual([]);
    expect(pairCombo([false, false])).toEqual([0, 0]);
  });
  it('is pure and does not change its input', () => {
    const v = [true, true];
    expect(pairCombo(v)).toEqual(pairCombo(v));
    expect(v).toEqual([true, true]);
  });
});
