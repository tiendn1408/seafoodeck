import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HttpException } from '@nestjs/common';
import type { AuthSession } from './generated/prisma/client';
import type { Db } from './db';
import type { Catalog } from './catalog';
import type { Media } from './media';
import { Learning, canonical } from './learning';
import { hash } from './security';
import { itemFingerprint, scenarioFingerprint } from './progress-fingerprint';
import { ProgressService, summarize, touchedTargets } from './progress.service';

const NOW = Date.parse('2026-06-10T00:00:00.000Z');
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const actor = (role: string, userId: string | null = null, id = 'a1') =>
  ({ id, role, userId, internal: false, csrf: 'c', expiresAt: new Date(NOW + DAY) }) as AuthSession;
const student = actor('student', 'u1');
const learner = actor('learner');

const names = (vi: string) => [
  { kind: 'vi', label: vi },
  { kind: 'en', label: vi + ' en' },
];
const fpItem = (vi: string) => itemFingerprint(names(vi));
const hsData = { prompt: 'P', options: [{ label: 'x', correct: true }] };
const revisions = ['A', 'B', 'C', 'D', 'E'].map((v) => ({
  id: 'rev-' + v,
  itemId: 'item-' + v,
  names: names(v),
}));
const scenarios = [{ id: 'hs-1', data: hsData }];

interface Rec {
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
const rec = (targetId: string, over: Partial<Rec> = {}): Rec => ({
  userId: 'u1',
  targetId,
  skill: 'name:en',
  stage: 0,
  dueAt: new Date(NOW - 2 * DAY),
  lastAttemptAt: new Date(NOW - 3 * DAY),
  lastSessionId: 's0',
  contentVersion: fpItem(targetId.split('/listening/')[0].replace('item-', '')),
  selfRated: false,
  ...over,
});

const release = { id: 'r1', internal: false };
const catalogFake = {
  current: async () => release,
  overview: async () => ({
    releaseId: 'r1',
    internal: false,
    learnable: 5,
    groups: { fish: 5, crustacean: 0, mollusc: 0, other: 0, none: 0 },
    hsCases: 1,
    items: revisions.map((r) => ({
      revisionId: r.id,
      itemId: r.itemId,
      vi: r.names[0].label,
      scientific: '',
      taxonomicGroup: 'fish',
      imageId: null,
    })),
  }),
} as unknown as Catalog;

function fakeDb(progress: Rec[] = [], extra: Record<string, unknown> = {}) {
  const calls: Record<string, unknown[]> = {};
  const log = (name: string, arg: unknown) => (calls[name] ??= []).push(arg);
  const db = {
    revision: {
      // Session building selects ids only; returning none makes every built item lack data.
      findMany: async (arg: { select?: unknown }) => (
        log('revision.findMany', arg),
        arg.select ? [] : revisions
      ),
      findFirst: async (arg: unknown) => (log('revision.findFirst', arg), null),
    },
    tradeScenario: { findMany: async () => scenarios },
    reviewProgress: {
      findMany: async (arg: { where: { userId: string } }) => (
        log('reviewProgress.findMany', arg),
        progress.filter((p) => p.userId === arg.where.userId)
      ),
    },
    ...extra,
  };
  return { db: db as unknown as Db, calls };
}

const errorOf = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (e) {
    return {
      status: (e as HttpException).getStatus?.(),
      message: (e as Error).message,
    };
  }
  return { status: 200, message: '' };
};

test('dueForReview: only effectively due, active rows, at most limit, earliest first', async () => {
  const rows = [
    // Raw dueAt passed but stage-2 interval from lastAttemptAt (7d) not yet: not effectively due.
    rec('item-A', { stage: 2, dueAt: new Date(NOW - DAY), lastAttemptAt: new Date(NOW - DAY) }),
    rec('item-B', { dueAt: new Date(NOW - 5 * DAY), lastAttemptAt: new Date(NOW - 6 * DAY) }),
    // Stale fingerprint: dropped even though it is the most overdue.
    rec('item-C', { dueAt: new Date(NOW - 9 * DAY), contentVersion: 'old' }),
    rec('item-D', { dueAt: new Date(NOW - 4 * DAY), lastAttemptAt: new Date(NOW - 5 * DAY) }),
    rec('hs-1', {
      skill: 'hs',
      contentVersion: scenarioFingerprint(hsData),
      dueAt: new Date(NOW - 3 * DAY),
      lastAttemptAt: new Date(NOW - 4 * DAY),
    }),
    rec('item-E/listening/en', { skill: 'listening' }),
    rec('item-E', { userId: 'u2', dueAt: new Date(NOW - 20 * DAY) }),
  ];
  const svc = new ProgressService(fakeDb(rows).db, catalogFake);
  assert.deepEqual(await svc.dueForReview(student, 3, NOW), [
    { targetId: 'item-B', skill: 'name:en' },
    { targetId: 'item-D', skill: 'name:en' },
    { targetId: 'hs-1', skill: 'hs' },
  ]);
  const all = await svc.dueForReview(student, 30, NOW);
  assert.deepEqual(
    all.map((t) => t.targetId),
    ['item-B', 'item-D', 'hs-1', 'item-E/listening/en'],
  );
});

test('dueForReview is empty for actors without a student account', async () => {
  const { db, calls } = fakeDb([rec('item-B')]);
  const svc = new ProgressService(db, catalogFake);
  assert.deepEqual(await svc.dueForReview(learner, 8, NOW), []);
  assert.deepEqual(await svc.dueForReview(actor('manager', 'u1'), 8, NOW), []);
  assert.equal(calls['reviewProgress.findMany'], undefined);
});

test('context maps the overview and scopes rows with activeRows', async () => {
  const svc = new ProgressService(
    fakeDb([rec('item-B'), rec('item-C', { contentVersion: 'old' })]).db,
    catalogFake,
  );
  const c = await svc.context(student);
  assert.equal(c.releaseId, 'r1');
  assert.equal(c.internal, false);
  assert.equal(c.overview.learnable, 5);
  assert.equal(c.overview.hsCases, 1);
  assert.deepEqual(Object.keys(c.overview.items[0]).sort(), [
    'imageId',
    'itemId',
    'revisionId',
    'scientific',
    'taxonomicGroup',
    'vi',
  ]);
  assert.deepEqual(
    c.rows.map((r) => r.targetId),
    ['item-B'],
  );
  assert.equal(c.versionOf('item-A/listening/ja'), fpItem('A'));
  assert.equal(c.versionOf('hs-1'), scenarioFingerprint(hsData));
  assert.equal(c.versionOf('gone'), undefined);
});

function learning(db: Db, due: { targetId: string; skill: string }[] = []) {
  const asked: number[] = [];
  const progress = new ProgressService(db, catalogFake);
  progress.dueForReview = async (_a: AuthSession, limit: number) => (asked.push(limit), due);
  return { l: new Learning(db, catalogFake, {} as Media, progress), asked };
}

test('student review ignores client reviewTargets and uses due items (default limit 8)', async () => {
  const { db, calls } = fakeDb();
  const { l, asked } = learning(db, [{ targetId: 'item-B', skill: 'name:en' }]);
  const err = await errorOf(() =>
    l.start(student, 'review', 'en', undefined, undefined, [
      { targetId: 'client-item', skill: 'name:en' },
    ]),
  );
  // The due item lacks data in this fake, so it is skipped silently and nothing is left.
  assert.deepEqual(err, { status: 400, message: 'Chưa có mục nào đến hạn ôn.' });
  assert.deepEqual(asked, [8]);
  const looked = (calls['revision.findFirst'] ?? []).map(
    (a) => (a as { where: { itemId: string } }).where.itemId,
  );
  assert.deepEqual(looked, ['item-B']);
});

test('student review with nothing due is a 400 and honours limit', async () => {
  const { l, asked } = learning(fakeDb().db, []);
  const err = await errorOf(() =>
    l.start(student, 'review', 'en', undefined, undefined, undefined, false, undefined, 5),
  );
  assert.deepEqual(err, { status: 400, message: 'Chưa có mục nào đến hạn ôn.' });
  assert.deepEqual(asked, [5]);
});

test('non-student review keeps honouring client reviewTargets', async () => {
  const { db, calls } = fakeDb();
  const { l, asked } = learning(db, [{ targetId: 'item-B', skill: 'name:en' }]);
  const err = await errorOf(() =>
    l.start(learner, 'review', 'en', undefined, undefined, [
      { targetId: 'client-item', skill: 'name:en' },
    ]),
  );
  assert.equal(err.status, 400);
  assert.deepEqual(asked, []);
  assert.equal(
    (calls['revision.findFirst']![0] as { where: { itemId: string } }).where.itemId,
    'client-item',
  );
});

function sessionStore(owner = 'a1') {
  const created: { data: Record<string, unknown> }[] = [];
  const q = {
    type: 'flashcard',
    targetId: 'item-B',
    skill: 'name:en',
    prompt: 'p',
    explanation: 'e',
  };
  const sessions: Record<string, unknown> = {
    old: {
      id: 'old',
      actorId: owner,
      releaseId: 'r1',
      mode: 'flashcard',
      reviewOfId: null,
      expiresAt: new Date(Date.now() + DAY),
      release: { internal: false },
      questions: [
        { id: 'q1', position: 0, private: q, attempt: { result: { correct: false } } },
        { id: 'q2', position: 1, private: q, attempt: { result: { correct: true } } },
      ],
    },
  };
  const gameSession = {
    findFirst: async ({ where }: { where: { id: string; actorId: string } }) => {
      const s = sessions[where.id] as { actorId: string } | undefined;
      return s && s.actorId === where.actorId ? s : null;
    },
    create: async (arg: { data: Record<string, unknown> }) => {
      created.push(arg);
      const qs = (arg.data.questions as { create: { position: number; private: unknown }[] })
        .create;
      sessions.new = {
        id: 'new',
        actorId: arg.data.actorId,
        releaseId: arg.data.releaseId,
        mode: arg.data.mode,
        reviewOfId: arg.data.reviewOfId ?? null,
        expiresAt: arg.data.expiresAt,
        release: { internal: false },
        questions: qs.map((c, i) => ({ id: 'n' + i, ...c, attempt: null })),
      };
      return sessions.new;
    },
  };
  return { gameSession, created, sessions };
}

test('a retry session started with reviewOf stores the source session id', async () => {
  for (const who of [student, learner]) {
    const store = sessionStore();
    const { l, asked } = learning(fakeDb([], { gameSession: store.gameSession }).db, [
      { targetId: 'item-B', skill: 'name:en' },
    ]);
    const game = await l.start(who, 'review', 'en', undefined, 'old');
    assert.equal(store.created[0].data.reviewOfId, 'old');
    assert.equal(game.questions.length, 1);
    assert.deepEqual(asked, [], 'a retry never asks for server-chosen targets');
  }
});

test('summarize builds entries from graded results only', () => {
  const rows = [
    {
      targetId: 'item-B',
      skill: 'name:en',
      stage: 1,
      dueAt: iso(NOW + 2.5 * DAY),
      lastAttemptAt: iso(NOW - DAY),
      lastSessionId: 's',
      contentVersion: 'v',
      selfRated: false,
    },
    {
      targetId: 'item-C',
      skill: 'match:en',
      stage: 0,
      dueAt: iso(NOW - 3 * DAY),
      lastAttemptAt: iso(NOW - 5 * DAY),
      lastSessionId: 's',
      contentVersion: 'v',
      selfRated: false,
    },
  ];
  const results = [
    { targetId: 'item-B', targetLabel: 'B', skill: 'name:en', correct: true, skipped: false },
    null,
    { targetId: 'item-D', targetLabel: 'D', skill: 'image', correct: false, skipped: true },
    {
      targetId: 'matching',
      targetLabel: 'B',
      skill: 'match:en',
      correct: false,
      skipped: false,
      items: [
        { targetId: 'item-C', label: 'C', correct: true },
        { targetId: 'item-X', label: 'X', correct: false },
      ],
    },
  ];
  const s = summarize(results, rows, NOW);
  assert.deepEqual(s, {
    total: 4,
    caught: 2,
    entries: [
      { targetId: 'item-B', label: 'B', correct: true, skipped: false, nextReviewInDays: 3 },
      { targetId: 'item-D', label: 'D', correct: false, skipped: true, nextReviewInDays: null },
      { targetId: 'item-C', label: 'C', correct: true, skipped: false, nextReviewInDays: 0 },
      { targetId: 'item-X', label: 'X', correct: false, skipped: false, nextReviewInDays: null },
    ],
  });
  // Invite-code sessions have no progress rows at all.
  assert.ok(summarize(results, null, NOW).entries.every((e) => e.nextReviewInDays === null));
});

test('summary is limited to the actor’s own session and leaks no answers', async () => {
  const store = sessionStore('a1');
  const old = store.sessions.old as { questions: { attempt: { result: unknown } }[] };
  old.questions[0].attempt.result = {
    targetId: 'item-B',
    targetLabel: 'B',
    skill: 'name:en',
    correct: false,
    skipped: false,
    correctOption: 'secret',
    reveal: { label: 'B en' },
  };
  old.questions[1].attempt.result = {
    targetId: 'item-C',
    targetLabel: 'C',
    skill: 'name:en',
    correct: true,
    skipped: false,
  };
  const { l } = learning(fakeDb([rec('item-B')], { gameSession: store.gameSession }).db);
  const other = await errorOf(() => l.summary(actor('student', 'u1', 'someone-else'), 'old'));
  assert.equal(other.status, 404);
  const s = await l.summary(student, 'old');
  assert.equal(s.total, 2);
  assert.equal(s.caught, 1);
  assert.deepEqual(
    s.entries.map((e) => Object.keys(e).sort()),
    [0, 1].map(() => ['correct', 'label', 'nextReviewInDays', 'skipped', 'targetId']),
  );
  assert.ok(
    !/secret|correctOption|rarity|marketPrice|hsHints|provenance|tradeRestriction/.test(
      JSON.stringify(s),
    ),
  );
  // Learner (no account) gets nulls.
  const ls = await l.summary(learner, 'old');
  assert.ok(ls.entries.every((e) => e.nextReviewInDays === null));
});

test('touchedTargets: skipped touches nothing, match touches each pair', () => {
  assert.deepEqual(touchedTargets({ skipped: true, targetId: 'a', skill: 'image' }), []);
  assert.deepEqual(touchedTargets({ skipped: false, targetId: 'a', skill: 'image' }), [
    { targetId: 'a', skill: 'image' },
  ]);
  assert.deepEqual(
    touchedTargets({
      skipped: false,
      targetId: 'matching',
      skill: 'match:en',
      items: [{ targetId: 'b' }, { targetId: 'c' }],
    }),
    [
      { targetId: 'b', skill: 'match:en' },
      { targetId: 'c', skill: 'match:en' },
    ],
  );
});

const flashQ = {
  type: 'flashcard',
  targetId: 'item-B',
  skill: 'name:en',
  front: 'B',
  prompt: 'Tên tiếng Anh',
  explanation: 'e',
};
function submitDb(progress: Rec[], existing?: { payloadHash: string; result: unknown }) {
  const writes: unknown[] = [];
  const session = {
    id: 'sess',
    actorId: 'a1',
    releaseId: 'r1',
    mode: 'flashcard',
    reviewOfId: null,
    expiresAt: new Date(Date.now() + DAY),
    release: { internal: false },
    questions: [{ id: 'q1', position: 0, private: flashQ, attempt: null }],
  };
  const reviewProgress = {
    findMany: async (arg: { where: { userId: string } }) =>
      progress.filter((p) => p.userId === arg.where.userId),
    findUnique: async () => null,
    upsert: async (arg: { create: Rec }) => {
      const i = progress.findIndex(
        (p) => p.targetId === arg.create.targetId && p.skill === arg.create.skill,
      );
      if (i >= 0) progress.splice(i, 1);
      progress.push(arg.create);
    },
  };
  const tx = {
    attempt: {
      create: async (arg: { data: { result: unknown } }) => (
        writes.push(arg.data.result),
        arg.data
      ),
    },
    revision: { findMany: async () => revisions },
    tradeScenario: { findMany: async () => scenarios },
    learningAttempt: { createMany: async () => ({ count: 1 }) },
    reviewProgress,
  };
  const { db } = fakeDb(progress, {
    gameSession: { findFirst: async () => session },
    attempt: { findUnique: async () => existing ?? null },
    reviewProgress,
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  });
  return { db, writes };
}
const answer = { rating: 'known' };
const payloadHash = hash(canonical({ sessionId: 'sess', questionId: 'q1', answer }));

test('submit adds progress for students on a fresh answer, keeping the stored result', async () => {
  const progress: Rec[] = [];
  const { db, writes } = submitDb(progress);
  const svc = new ProgressService(db, catalogFake);
  const l = new Learning(db, catalogFake, {} as Media, svc);
  const r = (await l.submit(student, 'sess', 'q1', 'key-12345', answer)) as Record<string, unknown>;
  assert.equal((writes[0] as Record<string, unknown>).progress, undefined);
  const p = r.progress as {
    targetId: string;
    skill: string;
    stage: number;
    dueAt: string;
    level: number;
  }[];
  assert.equal(p.length, 1);
  assert.equal(p[0].targetId, 'item-B');
  assert.equal(p[0].skill, 'name:en');
  assert.equal(p[0].stage, 0);
  assert.equal(p[0].level, 1);
  assert.ok(!Number.isNaN(Date.parse(p[0].dueAt)));
});

test('submit replay adds progress for students and stays byte-identical for others', async () => {
  const stored = {
    answered: true,
    skipped: false,
    correct: true,
    selfRated: true,
    targetId: 'item-B',
    skill: 'name:en',
    questionId: 'q1',
  };
  const progress = [rec('item-B', { stage: 2 }), rec('item-B', { skill: 'name:ja', stage: 3 })];
  for (const who of [student, learner, actor('manager', 'u1')]) {
    const { db } = submitDb(progress, { payloadHash, result: stored });
    const l = new Learning(db, catalogFake, {} as Media, new ProgressService(db, catalogFake));
    const r = (await l.submit(who, 'sess', 'q1', 'key-12345', answer)) as Record<string, unknown>;
    if (who === student) {
      assert.deepEqual(r.progress, [
        {
          targetId: 'item-B',
          skill: 'name:en',
          stage: 2,
          dueAt: iso(NOW - 3 * DAY + 7 * DAY),
          level: 4,
        },
      ]);
      assert.equal((stored as Record<string, unknown>).progress, undefined);
    } else assert.equal(JSON.stringify(r), JSON.stringify(stored));
  }
});
