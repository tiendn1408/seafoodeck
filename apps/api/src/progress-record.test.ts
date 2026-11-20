import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Prisma } from './generated/prisma/client';
import {
  buildLogRows,
  rebuildProgress,
  recordAttempt,
  withSerializableRetry,
} from './progress-record';
import type { SubmitContext } from './progress-record';
import { scheduleReview } from './progress-review';
import type { ReviewRow } from './progress-review';

const ctx = (over: Partial<SubmitContext> = {}): SubmitContext => ({
  userId: 'u1',
  sessionId: 's1',
  questionId: 'q1',
  mode: 'flashcard',
  releaseId: 'r1',
  reviewOfId: null,
  at: '2026-06-01T03:00:00.000Z',
  ...over,
});
const versions: Record<string, string> = { a: 'va', b: 'vb', c: 'vc', 'a/listening/en': 'va' };
const versionOf = (id: string) => versions[id];
const base = { skill: 'name:en', skipped: false, correct: true, selfRated: false, targetId: 'a' };

test('self-rated flashcard yields one selfRated row', () => {
  const rows = buildLogRows(ctx(), { ...base, selfRated: true, targetLabel: 'Cá ngừ' }, versionOf);
  assert.deepEqual(rows, [
    {
      targetId: 'a',
      skill: 'name:en',
      correct: true,
      skipped: false,
      selfRated: true,
      label: 'Cá ngừ',
      contentVersion: 'va',
      attemptNumber: 1,
      isReview: false,
    },
  ]);
});

test('match question yields one row per item', () => {
  const rows = buildLogRows(
    ctx({ mode: 'match' }),
    {
      ...base,
      skill: 'match:en',
      targetId: 'matching',
      correct: false,
      items: [
        { targetId: 'a', correct: true, label: 'A' },
        { targetId: 'b', correct: true, label: 'B' },
        { targetId: 'c', correct: false, label: 'C' },
      ],
    },
    versionOf,
  );
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => [r.targetId, r.correct, r.label, r.contentVersion, r.skill]),
    [
      ['a', true, 'A', 'va', 'match:en'],
      ['b', true, 'B', 'vb', 'match:en'],
      ['c', false, 'C', 'vc', 'match:en'],
    ],
  );
});

test('skipped question yields a skipped row', () => {
  const rows = buildLogRows(ctx(), { ...base, skipped: true, correct: false }, versionOf);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].skipped, true);
  assert.equal(rows[0].correct, false);
});

test('skipped match with per-pair items gives one skipped row per pair', () => {
  const rows = buildLogRows(
    ctx({ mode: 'match' }),
    {
      ...base,
      skill: 'match:en',
      targetId: 'matching',
      skipped: true,
      correct: false,
      items: [
        { targetId: 'a', correct: false, label: 'A' },
        { targetId: 'b', correct: false, label: 'B' },
        { targetId: 'c', correct: false, label: 'C' },
      ],
    },
    versionOf,
  );
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.skipped && !r.correct));
});

test('attemptNumber and isReview are derived from the server context', () => {
  assert.equal(buildLogRows(ctx({ reviewOfId: 'old' }), base, versionOf)[0].attemptNumber, 2);
  assert.equal(buildLogRows(ctx(), base, versionOf)[0].attemptNumber, 1);
  assert.equal(buildLogRows(ctx({ mode: 'review' }), base, versionOf)[0].isReview, true);
  assert.equal(buildLogRows(ctx({ mode: 'full' }), base, versionOf)[0].isReview, false);
});

test('targets without a fingerprint are dropped', () => {
  assert.deepEqual(buildLogRows(ctx(), { ...base, targetId: 'gone' }, versionOf), []);
  const rows = buildLogRows(
    ctx(),
    {
      ...base,
      targetId: 'matching',
      items: [
        { targetId: 'a', correct: true },
        { targetId: 'gone', correct: true },
      ],
    },
    versionOf,
  );
  assert.deepEqual(
    rows.map((r) => r.targetId),
    ['a'],
  );
});

// --- In-memory transaction fake -------------------------------------------------------------

interface LogRec {
  id: string;
  userId: string;
  sessionId: string;
  questionId: string;
  targetId: string;
  skill: string;
  mode: string;
  isReview: boolean;
  attemptNumber: number;
  correct: boolean;
  skipped: boolean;
  selfRated: boolean;
  contentVersion: string;
  releaseId: string;
  label: string;
  at: Date;
}
interface ProgRec {
  userId: string;
  targetId: string;
  skill: string;
  stage: number;
  dueAt: Date;
  lastAttemptAt: Date;
  lastSessionId: string;
  contentVersion: string;
  selfRated: boolean;
}
function fakeTx() {
  const logs: LogRec[] = [];
  const progress = new Map<string, ProgRec>();
  let seq = 0;
  const key = (w: { userId: string; targetId: string; skill: string }) =>
    `${w.userId}|${w.targetId}|${w.skill}`;
  const tx = {
    learningAttempt: {
      async createMany(args: { data: Omit<LogRec, 'id'>[]; skipDuplicates?: boolean }) {
        let count = 0;
        for (const d of args.data) {
          if (logs.some((l) => l.questionId === d.questionId && l.targetId === d.targetId)) {
            if (!args.skipDuplicates) throw Object.assign(new Error('dup'), { code: 'P2002' });
            continue;
          }
          logs.push({ ...d, id: String(++seq).padStart(6, '0') });
          count++;
        }
        return { count };
      },
      async findMany(args: { where?: { userId?: string; skipped?: boolean } }) {
        const w = args.where ?? {};
        return logs
          .filter(
            (l) =>
              (w.userId === undefined || l.userId === w.userId) &&
              (w.skipped === undefined || l.skipped === w.skipped),
          )
          .sort((x, y) => x.at.getTime() - y.at.getTime() || x.id.localeCompare(y.id))
          .map((l) => ({ ...l }));
      },
    },
    reviewProgress: {
      async findUnique(args: {
        where: { userId_targetId_skill: { userId: string; targetId: string; skill: string } };
      }) {
        const found = progress.get(key(args.where.userId_targetId_skill));
        return found ? { ...found } : null;
      },
      async upsert(args: {
        where: { userId_targetId_skill: { userId: string; targetId: string; skill: string } };
        create: ProgRec;
        update: Partial<ProgRec>;
      }) {
        const k = key(args.where.userId_targetId_skill);
        const prev = progress.get(k);
        const next = prev ? { ...prev, ...args.update } : { ...args.create };
        progress.set(k, next);
        return { ...next };
      },
      async deleteMany(args: { where?: { userId?: string } }) {
        let count = 0;
        for (const [k, v] of progress)
          if (args.where?.userId === undefined || v.userId === args.where.userId) {
            progress.delete(k);
            count++;
          }
        return { count };
      },
      async createMany(args: { data: ProgRec[] }) {
        for (const d of args.data) progress.set(key(d), { ...d });
        return { count: args.data.length };
      },
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, logs, progress };
}
const snapshot = (progress: Map<string, ProgRec>) =>
  [...progress.values()]
    .map((p) => ({
      ...p,
      dueAt: p.dueAt.toISOString(),
      lastAttemptAt: p.lastAttemptAt.toISOString(),
    }))
    .sort((a, b) =>
      `${a.userId}${a.targetId}${a.skill}`.localeCompare(`${b.userId}${b.targetId}${b.skill}`),
    );

test('recording the same (questionId, targetId) twice creates one log row', async () => {
  const { tx, logs, progress } = fakeTx();
  const c = ctx();
  const rows = buildLogRows(c, base, versionOf);
  const first = await recordAttempt(tx, c, rows);
  const second = await recordAttempt(tx, c, rows);
  assert.equal(logs.length, 1);
  assert.equal(first.length, 1);
  assert.deepEqual(second, []);
  assert.equal(progress.size, 1);
  assert.equal(progress.get('u1|a|name:en')!.stage, 0);
});

test('skipped rows are logged but do not touch ReviewProgress', async () => {
  const { tx, logs, progress } = fakeTx();
  const c = ctx();
  const out = await recordAttempt(
    tx,
    c,
    buildLogRows(c, { ...base, skipped: true, correct: false }, versionOf),
  );
  assert.equal(logs.length, 1);
  assert.equal(logs[0].skipped, true);
  assert.equal(progress.size, 0);
  assert.deepEqual(out, []);
});

test('a skipped match logs every pair but creates no progress rows', async () => {
  const { tx, logs, progress } = fakeTx();
  const c = ctx({ mode: 'match' });
  const out = await recordAttempt(
    tx,
    c,
    buildLogRows(
      c,
      {
        ...base,
        skill: 'match:en',
        targetId: 'matching',
        skipped: true,
        correct: false,
        items: ['a', 'b', 'c'].map((targetId) => ({ targetId, correct: false })),
      },
      versionOf,
    ),
  );
  assert.equal(logs.length, 3);
  assert.equal(progress.size, 0);
  assert.deepEqual(out, []);
});

test('two skills of the same target create two progress rows', async () => {
  const { tx, progress } = fakeTx();
  await recordAttempt(tx, ctx(), buildLogRows(ctx(), base, versionOf));
  const c2 = ctx({ questionId: 'q2' });
  await recordAttempt(tx, c2, buildLogRows(c2, { ...base, skill: 'image' }, versionOf));
  assert.deepEqual([...progress.keys()].sort(), ['u1|a|image', 'u1|a|name:en']);
});

test('six answers match scheduleReview applied in order, and rebuild reproduces them', async () => {
  const { tx, progress } = fakeTx();
  const DAY = 86_400_000;
  const t0 = Date.parse('2026-06-01T03:00:00.000Z');
  const plan = [
    { day: 0, mode: 'flashcard', correct: true, reviewOfId: null },
    { day: 1, mode: 'review', correct: true, reviewOfId: null },
    { day: 4, mode: 'review', correct: true, reviewOfId: null },
    { day: 5, mode: 'review', correct: false, reviewOfId: null },
    { day: 5, mode: 'review', correct: true, reviewOfId: 's4' },
    { day: 12, mode: 'review', correct: true, reviewOfId: null },
  ];
  let expected: ReviewRow | undefined;
  for (const [i, p] of plan.entries()) {
    const c = ctx({
      sessionId: `s${i + 1}`,
      questionId: `q${i + 1}`,
      mode: p.mode,
      reviewOfId: p.reviewOfId,
      at: new Date(t0 + p.day * DAY + i * 1000).toISOString(),
    });
    const rows = buildLogRows(c, { ...base, skill: 'image', correct: p.correct }, versionOf);
    const written = await recordAttempt(tx, c, rows);
    expected = scheduleReview(expected, {
      sessionId: c.sessionId,
      targetId: 'a',
      skill: 'image',
      contentVersion: 'va',
      attemptNumber: p.reviewOfId ? 2 : 1,
      correct: p.correct,
      selfRated: false,
      isReview: p.mode === 'review',
      at: c.at,
    });
    assert.deepEqual(written, [expected]);
  }
  // A second user and a skipped answer must not disturb the rebuild.
  const other = ctx({ userId: 'u2', questionId: 'q9', sessionId: 's9' });
  await recordAttempt(tx, other, buildLogRows(other, base, versionOf));
  const skip = ctx({ questionId: 'q10', sessionId: 's10', at: '2026-07-01T00:00:00.000Z' });
  await recordAttempt(
    tx,
    skip,
    buildLogRows(skip, { ...base, skill: 'image', skipped: true, correct: false }, versionOf),
  );

  const stored = progress.get('u1|a|image')!;
  assert.equal(stored.stage, expected!.stage);
  assert.equal(stored.dueAt.toISOString(), expected!.dueAt);
  const before = snapshot(progress);

  progress.clear();
  assert.deepEqual(await rebuildProgress(tx), { users: 2, rows: 2 });
  assert.deepEqual(snapshot(progress), before);

  // Rebuilding a single user replaces only that user's rows.
  progress.get('u2|a|name:en')!.stage = 3;
  progress.get('u1|a|image')!.stage = 3;
  assert.deepEqual(await rebuildProgress(tx, 'u1'), { users: 1, rows: 1 });
  assert.equal(progress.get('u1|a|image')!.stage, expected!.stage);
  assert.equal(progress.get('u2|a|name:en')!.stage, 3);
});

const noWait = async () => {};
test('serialization conflicts (P2034) are retried at most 3 times', async () => {
  let calls = 0;
  const conflict = () => Object.assign(new Error('conflict'), { code: 'P2034' });
  assert.equal(
    await withSerializableRetry(async () => {
      if (++calls < 3) throw conflict();
      return 'ok';
    }, noWait),
    'ok',
  );
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(
    withSerializableRetry(async () => {
      calls++;
      throw conflict();
    }, noWait),
    { code: 'P2034' },
  );
  assert.equal(calls, 4);
  calls = 0;
  await assert.rejects(
    withSerializableRetry(async () => {
      calls++;
      throw Object.assign(new Error('dup'), { code: 'P2002' });
    }),
    { code: 'P2002' },
  );
  assert.equal(calls, 1);
});

test('commit-time pg adapter conflicts (no code, cause 40001) are retried', async () => {
  const waits: number[] = [];
  const wait = async (ms: number) => {
    waits.push(ms);
  };
  // Shape of @prisma/adapter-pg DriverAdapterError raised at COMMIT: no `code`, info in `cause`.
  const commitConflict = () =>
    Object.assign(new Error('Transaction failed due to a write conflict or a deadlock'), {
      name: 'DriverAdapterError',
      cause: { kind: 'TransactionWriteConflict', originalCode: '40001' },
    });
  let calls = 0;
  assert.equal(
    await withSerializableRetry(async () => {
      if (++calls < 2) throw commitConflict();
      return 'ok';
    }, wait),
    'ok',
  );
  assert.equal(calls, 2);
  assert.equal(waits.length, 1);
  assert.ok(waits[0] >= 5 && waits[0] <= 25, `jitter ${waits[0]}`);

  // Either marker alone is enough, including one level deeper in the cause chain.
  for (const cause of [
    { kind: 'TransactionWriteConflict' },
    { originalCode: '40001' },
    { cause: { kind: 'TransactionWriteConflict', originalCode: '40001' } },
  ]) {
    calls = 0;
    assert.equal(
      await withSerializableRetry(async () => {
        if (++calls < 2) throw { cause };
        return 'ok';
      }, wait),
      'ok',
    );
    assert.equal(calls, 2);
  }

  calls = 0;
  const last = commitConflict();
  await assert.rejects(
    withSerializableRetry(async () => {
      calls++;
      throw last;
    }, wait),
    (e) => e === last,
  );
  assert.equal(calls, 4);

  calls = 0;
  const unrelated = new Error('boom');
  await assert.rejects(
    withSerializableRetry(async () => {
      calls++;
      throw unrelated;
    }, wait),
    (e) => e === unrelated,
  );
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(
    withSerializableRetry(async () => {
      calls++;
      throw Object.assign(new Error('other'), { cause: { kind: 'UniqueConstraintViolation' } });
    }, wait),
  );
  assert.equal(calls, 1);
});

// --- Step 4: session cleanup never removes the durable log ---------------------------------

const root = path.join(__dirname, '..');
const modelBlock = (schema: string, name: string) =>
  schema.slice(schema.indexOf(`model ${name} {`)).split('\n}')[0];

test('LearningAttempt/ReviewProgress hang off User only, not sessions', () => {
  const schema = readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
  for (const name of ['LearningAttempt', 'ReviewProgress']) {
    const block = modelBlock(schema, name);
    const relations = block.split('\n').filter((l) => l.includes('@relation'));
    assert.deepEqual(
      relations.map((l) => l.trim().split(/\s+/)[1]),
      ['User'],
      `${name} relations`,
    );
  }
  for (const name of ['AuthSession', 'GameSession', 'Question', 'Attempt'])
    assert.doesNotMatch(modelBlock(schema, name), /LearningAttempt|ReviewProgress/);
});

test('maintenance and re-login do not delete the durable log', () => {
  for (const file of ['maintenance.ts', 'auth.controller.ts']) {
    const source = readFileSync(path.join(root, 'src', file), 'utf8');
    assert.doesNotMatch(source, /learningAttempt|reviewProgress|user\.delete/, file);
  }
});
