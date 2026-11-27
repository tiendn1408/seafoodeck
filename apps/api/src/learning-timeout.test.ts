import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { AuthSession } from './generated/prisma/client';
import type { Db } from './db';
import type { Catalog } from './catalog';
import type { Media } from './media';
import { Learning, grade, type PrivateQuestion } from './learning';
import { ProgressService } from './progress.service';

const PREFIX = 'Hết giờ, tính là chưa chính xác.';
const DAY = 86_400_000;
const student = {
  id: 'a1',
  role: 'student',
  userId: 'u1',
  internal: false,
  csrf: 'c',
  expiresAt: new Date(Date.now() + DAY),
} as AuthSession;

const imageQ: PrivateQuestion = {
  type: 'image',
  targetId: 'item-B',
  skill: 'name:en',
  prompt: 'Đây là loài nào?',
  options: [
    { id: 'o-right', label: 'Cá B' },
    { id: 'o-wrong', label: 'Cá C' },
  ],
  correct: 'o-right',
  explanation: 'Cá B có thân dài.',
};
const otherQs: Record<string, PrivateQuestion> = {
  match: {
    type: 'match',
    targetId: 'board',
    skill: 'match:en',
    prompt: 'Ghép',
    pairs: { a: 'x' },
    explanation: '',
  },
  hs: {
    type: 'hs',
    targetId: 'case',
    skill: 'hs',
    prompt: 'HS',
    options: [{ id: 'o1', label: 'Mã' }],
    correct: 'o1',
    explanation: '',
  },
  listening: {
    type: 'listening',
    targetId: 'item-B/listening/en',
    skill: 'listening',
    prompt: 'Nghe',
    options: [{ id: 'o1', label: 'Cá B' }],
    correct: 'o1',
    explanation: '',
  },
  flashcard: {
    type: 'flashcard',
    targetId: 'item-B',
    skill: 'name:en',
    front: 'B',
    prompt: 'Tên',
    explanation: '',
  },
};

test('grade: a timeout on an image question is answered, wrong, not skipped, not self-rated', () => {
  assert.deepEqual(grade(imageQ, { timeout: true }), {
    answered: true,
    skipped: false,
    correct: false,
    selfRated: false,
  });
});
test('grade: a timeout beside the correct option id is still a timeout (wrong)', () => {
  assert.equal(grade(imageQ, { timeout: true, optionId: 'o-right' }).correct, false);
  assert.equal(grade(imageQ, { optionId: 'o-right' }).correct, true);
});
test('grade: skip still wins over timeout; timeout:false is not a timeout', () => {
  assert.equal(grade(imageQ, { skip: true, timeout: true }).skipped, true);
  assert.throws(() => grade(imageQ, { timeout: false }), BadRequestException);
  assert.throws(() => grade(imageQ, { timeout: 'true' }), BadRequestException);
});
test('grade: a timeout is refused for match, hs, listening and flashcard questions', () => {
  for (const q of Object.values(otherQs))
    assert.throws(() => grade(q, { timeout: true }), BadRequestException, q.type);
});

// ---- the real attempt path over a stateful fake database ----

interface Stored {
  questionId: string;
  actorId: string;
  idempotencyKey: string;
  payloadHash: string;
  answer: unknown;
  result: Record<string, unknown>;
}
function harness(
  q: PrivateQuestion = imageQ,
  opts: { staleSession?: boolean; revoked?: boolean } = {},
) {
  const attempts: Stored[] = [];
  const logs: Record<string, unknown>[] = [];
  const progress: Record<string, unknown>[] = [];
  const session = {
    id: 'sess',
    actorId: 'a1',
    releaseId: 'r1',
    mode: 'image',
    reviewOfId: null,
    expiresAt: new Date(Date.now() + DAY),
    release: { internal: false },
    questions: [
      {
        id: 'q1',
        position: 0,
        private: q,
        get attempt() {
          return opts.staleSession ? null : (attempts.find((a) => a.questionId === 'q1') ?? null);
        },
      },
    ],
  };
  const tx = {
    attempt: {
      create: async ({ data }: { data: Stored }) => {
        if (
          attempts.some(
            (a) =>
              a.questionId === data.questionId ||
              (a.actorId === data.actorId && a.idempotencyKey === data.idempotencyKey),
          )
        )
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        attempts.push(data);
        return data;
      },
    },
    revision: {
      findMany: async () => [
        {
          itemId: 'item-B',
          names: [
            { kind: 'vi', label: 'B' },
            { kind: 'en', label: 'B en' },
          ],
        },
      ],
    },
    tradeScenario: { findMany: async () => [] },
    learningAttempt: {
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => (
        logs.push(...data),
        { count: data.length }
      ),
    },
    reviewProgress: {
      findUnique: async () => null,
      upsert: async ({ create }: { create: Record<string, unknown> }) => void progress.push(create),
    },
  };
  const db = {
    gameSession: { findFirst: async () => session },
    attempt: {
      findUnique: async ({
        where: {
          actorId_idempotencyKey: { actorId, idempotencyKey },
        },
      }: {
        where: { actorId_idempotencyKey: { actorId: string; idempotencyKey: string } };
      }) =>
        attempts.find((a) => a.actorId === actorId && a.idempotencyKey === idempotencyKey) ?? null,
      findFirst: async ({
        where: { OR },
      }: {
        where: { OR: { questionId?: string; actorId?: string; idempotencyKey?: string }[] };
      }) =>
        attempts.find((a) =>
          OR.some((c) =>
            c.questionId
              ? a.questionId === c.questionId
              : a.actorId === c.actorId && a.idempotencyKey === c.idempotencyKey,
          ),
        ) ?? null,
    },
    mediaAsset: {
      findUnique: async () => ({ id: 'img', revokedAt: opts.revoked ? new Date() : null }),
    },
    revision: { findMany: async () => [], findFirst: async () => null },
    tradeScenario: { findMany: async () => [] },
    reviewProgress: { findMany: async () => [] },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as Db;
  const catalog = {
    current: async () => ({ id: 'r1', internal: false }),
  } as unknown as Catalog;
  const svc = new ProgressService(db, catalog);
  svc.afterSubmit = async () => [];
  const learning = new Learning(db, catalog, {} as Media, svc);
  return { learning, attempts, logs, progress };
}
const submit = (h: ReturnType<typeof harness>, key: string, answer: Record<string, unknown>) =>
  h.learning.submit(student, 'sess', 'q1', key, answer) as Promise<Record<string, unknown>>;

test('attempt: a timeout is stored as a wrong, answered attempt that reveals the answer', async () => {
  const h = harness();
  const r = await submit(h, 'timeout-key-0001', { timeout: true });
  assert.equal(r.correct, false);
  assert.equal(r.skipped, false);
  assert.equal(r.answered, true);
  assert.equal(r.selfRated, false);
  assert.equal(r.correctOption, 'o-right');
  assert.equal(r.explanation, `${PREFIX} ${imageQ.explanation}`);
  assert.equal(h.attempts.length, 1);
  assert.deepEqual(h.attempts[0].answer, { timeout: true });
  assert.equal(h.attempts[0].result.correct, false);
  assert.equal(h.attempts[0].result.skipped, false);
});

test('attempt: a timeout has the same log and review effect as a wrong option', async () => {
  const t = harness(),
    w = harness();
  await submit(t, 'timeout-key-0001', { timeout: true });
  await submit(w, 'wrong-key-0001', { optionId: 'o-wrong' });
  assert.equal(t.logs.length, 1);
  assert.equal(t.logs[0].correct, false);
  assert.equal(t.logs[0].skipped, false);
  assert.equal(t.progress.length, 1);
  const strip = (rows: Record<string, unknown>[]) =>
    rows.map(({ at: _a, lastAttemptAt: _l, dueAt: _d, ...rest }) => rest);
  assert.deepEqual(strip(t.logs), strip(w.logs));
  assert.deepEqual(strip(t.progress), strip(w.progress));
  assert.equal(t.progress[0].stage, w.progress[0].stage);
});

test('attempt: a timeout beside the correct option id is stored wrong, not correct', async () => {
  const h = harness();
  const r = await submit(h, 'timeout-key-0001', { timeout: true, optionId: 'o-right' });
  assert.equal(r.correct, false);
  assert.equal(h.logs[0].correct, false);
});

test('attempt: the same key twice returns the same result and logs one attempt', async () => {
  const h = harness();
  const a = await submit(h, 'timeout-key-0001', { timeout: true });
  const b = await submit(h, 'timeout-key-0001', { timeout: true });
  assert.deepEqual(b, a);
  assert.equal(h.attempts.length, 1);
  assert.equal(h.logs.length, 1);
});

test('attempt: a timeout on a non-image question is a 400 and stores nothing', async () => {
  for (const q of Object.values(otherQs)) {
    const h = harness(q);
    await assert.rejects(
      () => submit(h, 'timeout-key-0001', { timeout: true }),
      BadRequestException,
    );
    assert.equal(h.attempts.length, 0);
  }
});

test('attempt: key check allows [A-Za-z0-9_-] only: timeout-<uuid>-<uuid> (81 chars) passes, a colon is a 400', async () => {
  const key = `timeout-${'a'.repeat(36)}-${'b'.repeat(36)}`;
  assert.equal(key.length, 81);
  const h = harness();
  await submit(h, key, { timeout: true });
  assert.equal(h.attempts[0].idempotencyKey, key);
  const colon = `timeout:${'a'.repeat(36)}:${'b'.repeat(36)}`;
  await assert.rejects(() => submit(harness(), colon, { timeout: true }), BadRequestException);
});

// Pins the CURRENT behaviour for Task 3: a second attempt for an answered question with a
// DIFFERENT key. Same payload returns the stored first result; a different payload is a 409.
test('attempt: second attempt, different key, different payload (option then timeout) is a 409', async () => {
  const h = harness();
  const first = await submit(h, 'option-key-0001', { optionId: 'o-right' });
  await assert.rejects(
    () => submit(h, 'timeout-key-0001', { timeout: true }),
    (e: unknown) => e instanceof ConflictException,
  );
  assert.equal(h.attempts.length, 1);
  assert.equal(h.attempts[0].result.correct, true);
  assert.equal(first.correct, true);
});
test('attempt: second attempt, different key, different payload (timeout then option) is a 409', async () => {
  const h = harness();
  await submit(h, 'timeout-key-0001', { timeout: true });
  await assert.rejects(
    () => submit(h, 'option-key-0001', { optionId: 'o-right' }),
    (e: unknown) => e instanceof ConflictException,
  );
  assert.equal(h.attempts[0].result.correct, false);
});
test('attempt: second timeout with a different key returns the stored first result', async () => {
  const h = harness();
  const a = await submit(h, 'timeout-key-0001', { timeout: true });
  const b = await submit(h, 'timeout-key-0002', { timeout: true });
  assert.deepEqual(b, a);
  assert.equal(h.attempts.length, 1);
  assert.equal(h.logs.length, 1);
});
test('attempt: truly concurrent option then timeout (stale session read) is a 409, first one wins', async () => {
  const h = harness(imageQ, { staleSession: true });
  await submit(h, 'option-key-0001', { optionId: 'o-right' });
  await assert.rejects(
    () => submit(h, 'timeout-key-0001', { timeout: true }),
    (e: unknown) => e instanceof ConflictException,
  );
  assert.equal(h.attempts.length, 1);
  assert.equal(h.attempts[0].result.correct, true);
});

test('attempt: a timeout on an image that is now unavailable is skipped (existing rule)', async () => {
  const h = harness({ ...imageQ, assetId: 'img' }, { revoked: true });
  const r = await submit(h, 'timeout-key-0001', { timeout: true });
  assert.equal(r.skipped, true);
  assert.equal(r.answered, false);
});
