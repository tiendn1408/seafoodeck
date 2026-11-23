import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DAY, scheduleReview } from './review';
import type { Attempt, ReviewState, Skill } from './models';

const VECTORS = resolve(process.cwd(), '../../apps/api/src/progress-review.vectors.json');
const SEED = 20261119;
const T0 = Date.parse('2026-01-01T00:00:00.000Z');

interface Step {
  sessionId: string;
  targetId: string;
  skill: string;
  contentVersion: string;
  attemptNumber: number;
  correct: boolean;
  selfRated: boolean;
  isReview: boolean;
  at: string;
}
interface Vector {
  name: string;
  steps: Step[];
  expected: Omit<ReviewState, 'key'>[];
}

const step = (day: number, o: Partial<Step> = {}): Step => ({
  sessionId: 's1',
  targetId: 'sp-1',
  skill: 'name',
  contentVersion: 'v1',
  attemptNumber: 1,
  correct: true,
  selfRated: false,
  isReview: true,
  at: new Date(T0 + day * DAY).toISOString(),
  ...o,
});

function run(steps: Step[]): Omit<ReviewState, 'key'>[] {
  let prev: ReviewState | undefined;
  return steps.map((s) => {
    prev = scheduleReview(prev, {
      ...s,
      id: 'a',
      questionId: 'q',
      answer: '',
      skill: s.skill as Skill,
    } as Attempt);
    const row: Partial<ReviewState> = { ...prev };
    delete row.key;
    return row as Omit<ReviewState, 'key'>;
  });
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomSteps(): Vector[] {
  const rnd = mulberry32(SEED);
  const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  return Array.from({ length: 200 }, (_, i) => {
    const n = 2 + Math.floor(rnd() * 11);
    let hour = 0;
    const steps = Array.from({ length: n }, () => {
      hour += Math.floor(rnd() * 24 * 8);
      return {
        sessionId: pick(['s1', 's2', 's3', 's4', 's5']),
        targetId: 'sp-1',
        skill: 'name',
        contentVersion: rnd() < 0.1 ? 'v2' : 'v1',
        attemptNumber: rnd() < 0.2 ? 2 : 1,
        correct: rnd() < 0.75,
        selfRated: rnd() < 0.2,
        isReview: rnd() < 0.85,
        at: new Date(T0 + hour * 3_600_000).toISOString(),
      };
    });
    return { name: `random seed=${SEED} #${i}`, steps, expected: run(steps) };
  });
}

function handwritten(): Vector[] {
  const cases: [string, Step[]][] = [
    ['first learn on day 0 is due day 1', [step(0, { isReview: false })]],
    [
      'correct review after due in a later session advances 0 to 1 (due +3d)',
      [step(0, { isReview: false }), step(1, { sessionId: 's2' })],
    ],
    [
      'self-rated correct does not advance and keeps dueAt',
      [step(0, { isReview: false }), step(2, { sessionId: 's2', selfRated: true })],
    ],
    [
      'wrong answer drops to stage 0',
      [
        step(0, { isReview: false }),
        step(1, { sessionId: 's2' }),
        step(4, { sessionId: 's3', correct: false }),
      ],
    ],
    [
      'attemptNumber 2 does not advance',
      [step(0, { isReview: false }), step(1, { sessionId: 's2', attemptNumber: 2 })],
    ],
    ['same session does not advance', [step(0, { isReview: false }), step(1)]],
    [
      'contentVersion change resets to stage 0',
      [
        step(0, { isReview: false }),
        step(1, { sessionId: 's2' }),
        step(4, { sessionId: 's3', contentVersion: 'v2' }),
      ],
    ],
    [
      'stage 3 stays at 3 (due +14d)',
      [
        step(0, { isReview: false }),
        step(1, { sessionId: 's2' }),
        step(4, { sessionId: 's3' }),
        step(11, { sessionId: 's4' }),
        step(25, { sessionId: 's5' }),
        step(39, { sessionId: 's6' }),
      ],
    ],
  ];
  return cases.map(([name, steps]) => ({ name, steps, expected: run(steps) }));
}

/** One compact JSON vector per line. */
const serialize = (vs: Vector[]): string =>
  '[\n' + vs.map((v) => JSON.stringify(v)).join(',\n') + '\n]\n';

const all = (): Vector[] => [...handwritten(), ...randomSteps()];

describe('review parity vectors', () => {
  if (process.env.WRITE_REVIEW_VECTORS === '1') {
    it('writes vectors', () => {
      writeFileSync(VECTORS, serialize(all()));
    });
  }
  const file = (): Vector[] => JSON.parse(readFileSync(VECTORS, 'utf8')) as Vector[];

  it('committed vector file matches regenerated sequences (seeded)', () => {
    expect(file()).toEqual(all());
    expect(readFileSync(VECTORS, 'utf8')).toBe(serialize(all()));
  });
  it('contains the 200 seeded random sequences', () => {
    expect(file().filter((v) => v.name.startsWith(`random seed=${SEED}`))).toHaveLength(200);
  });
  it('web scheduleReview reproduces every vector', () => {
    for (const v of file()) expect(run(v.steps), v.name).toEqual(v.expected);
  });
});
