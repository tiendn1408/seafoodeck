import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DAY, effectiveDueAt, scheduleReview } from './progress-review';
import type { ReviewAttempt, ReviewRow } from './progress-review';

interface Vector {
  name: string;
  steps: ReviewAttempt[];
  expected: Omit<ReviewRow, 'lastAttemptAt'>[];
}
const vectors = JSON.parse(
  readFileSync(join(__dirname, '../src/progress-review.vectors.json'), 'utf8'),
) as Vector[];

test('vectors cover the handwritten and 200 random cases', () => {
  assert.ok(vectors.length >= 208);
});

for (const v of vectors) {
  test(`parity vector: ${v.name}`, () => {
    let prev: ReviewRow | undefined;
    v.steps.forEach((s, i) => {
      prev = scheduleReview(prev, s);
      assert.deepEqual(prev, { ...v.expected[i], lastAttemptAt: s.at });
    });
  });
}

test('effectiveDueAt honours the latest attempt over a stale dueAt', () => {
  const t0 = Date.parse('2026-01-01T00:00:00.000Z');
  const at = (d: number) => new Date(t0 + d * DAY).toISOString();
  const base: ReviewAttempt = {
    sessionId: 's1',
    targetId: 't',
    skill: 'name',
    contentVersion: 'v1',
    attemptNumber: 1,
    correct: true,
    selfRated: false,
    isReview: false,
    at: at(0),
  };
  const first = scheduleReview(undefined, base);
  const second = scheduleReview(first, {
    ...base,
    sessionId: 's2',
    selfRated: true,
    isReview: true,
    at: at(2),
  });
  assert.equal(second.stage, 0);
  assert.equal(second.dueAt, at(1));
  assert.equal(effectiveDueAt(second), at(3));
});
