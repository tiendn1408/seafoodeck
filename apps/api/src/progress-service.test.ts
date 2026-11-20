import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, type HttpException } from '@nestjs/common';
import type { AuthSession } from './generated/prisma/client';
import type { Db } from './db';
import type { Catalog } from './catalog';
import type { Media } from './media';
import { Learning, canonical } from './learning';
import { hash, type ActorRequest } from './security';
import { MeProgressController } from './me.controller';
import { itemFingerprint, scenarioFingerprint } from './progress-fingerprint';
import {
  ProgressService,
  REVIEW_CANDIDATES,
  solidSpecies,
  summarize,
  touchedTargets,
} from './progress.service';

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
const scenarios = [{ id: 'hs-1', revisionId: 'rev-B', data: hsData }];

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
  progress.dueForReview = async (_a: AuthSession, limit: number) => (
    asked.push(limit),
    due.slice(0, limit)
  );
  return { l: new Learning(db, catalogFake, {} as Media, progress), asked };
}

test('student review ignores client reviewTargets and uses due items', async () => {
  const { db, calls } = fakeDb();
  const { l, asked } = learning(db, [{ targetId: 'item-B', skill: 'name:en' }]);
  const err = await errorOf(() =>
    l.start(student, 'review', 'en', undefined, undefined, [
      { targetId: 'client-item', skill: 'name:en' },
    ]),
  );
  // The due item lacks data in this fake, so it is skipped silently and nothing is left.
  assert.deepEqual(err, { status: 400, message: 'Chưa có mục nào đến hạn ôn.' });
  assert.deepEqual(asked, [REVIEW_CANDIDATES]);
  const looked = (calls['revision.findFirst'] ?? []).map(
    (a) => (a as { where: { itemId: string } }).where.itemId,
  );
  assert.deepEqual(looked, ['item-B']);
});

test('student review with nothing due is a 400; limit outside 1..30 is rejected', async () => {
  const { l, asked } = learning(fakeDb().db, []);
  const err = await errorOf(() =>
    l.start(student, 'review', 'en', undefined, undefined, undefined, false, undefined, 5),
  );
  assert.deepEqual(err, { status: 400, message: 'Chưa có mục nào đến hạn ôn.' });
  assert.deepEqual(asked, [REVIEW_CANDIDATES]);
  for (const bad of [0, 31, 2.5])
    assert.deepEqual(
      await errorOf(() =>
        l.start(student, 'review', 'en', undefined, undefined, undefined, false, undefined, bad),
      ),
      { status: 400, message: 'Số mục ôn phải từ 1 đến 30.' },
    );
});

/**
 * Builds server-chosen sessions with a stubbed per-target build: `fail` targets throw a 400,
 * `empty` targets build no matching question, every other due target builds one flashcard.
 */
function buildable(due: string[], fail: string[], empty: string[]) {
  const store = sessionStore();
  const tried: string[] = [];
  const { db } = fakeDb([], {
    gameSession: { ...store.gameSession, delete: async () => ({}) },
    revision: {
      findMany: async () => [],
      findFirst: async ({ where }: { where: { itemId: string } }) => ({ id: where.itemId }),
    },
    question: {
      findMany: async ({ where }: { where: { sessionId: string } }) => {
        const itemId = where.sessionId.replace('tmp-', '');
        if (empty.includes(itemId)) return [];
        return [
          {
            private: {
              type: 'flashcard',
              targetId: itemId,
              skill: 'name:en',
              prompt: 'p',
              explanation: 'e',
            },
          },
        ];
      },
    },
  });
  const { l, asked } = learning(
    db,
    due.map((targetId) => ({ targetId, skill: 'name:en' })),
  );
  const real = l.start.bind(l);
  l.start = (async (...args: Parameters<Learning['start']>) => {
    if (args[6] !== true) return real(...args);
    const itemId = args[3]!;
    tried.push(itemId);
    if (fail.includes(itemId)) throw new BadRequestException('Chưa có mục đủ bốn tên để học.');
    return { id: 'tmp-' + itemId };
  }) as Learning['start'];
  return { l, asked, store, tried };
}
const builtTargets = (store: ReturnType<typeof sessionStore>) =>
  (store.created[0].data.questions as { create: { private: { targetId: string } }[] }).create.map(
    (c) => c.private.targetId,
  );

test('server-chosen review builds past unbuildable due items up to limit', async () => {
  const { l, store, tried } = buildable(
    ['item-A', 'item-B', 'item-C', 'item-D', 'item-E', 'item-F'],
    ['item-A', 'item-B'],
    ['item-C'],
  );
  const game = await l.start(
    student,
    'review',
    'en',
    undefined,
    undefined,
    undefined,
    false,
    undefined,
    2,
  );
  assert.deepEqual(builtTargets(store), ['item-D', 'item-E']);
  assert.equal(game.questions.length, 2);
  assert.equal(store.created[0].data.mode, 'review');
  assert.equal(store.created[0].data.reviewOfId, undefined);
  assert.deepEqual(tried, ['item-A', 'item-B', 'item-C', 'item-D', 'item-E'], 'stops at limit');
});

test('server-chosen review: more blocked due rows than limit still yields a session', async () => {
  const blocked = Array.from({ length: 10 }, (_, i) => 'item-x' + i);
  const { l, store } = buildable([...blocked, 'item-ok'], blocked, []);
  await l.start(student, 'review', 'en', undefined, undefined, undefined, false, undefined, 3);
  assert.deepEqual(builtTargets(store), ['item-ok']);
  const none = buildable(blocked, blocked, []);
  assert.deepEqual(await errorOf(() => none.l.start(student, 'review', 'en')), {
    status: 400,
    message: 'Chưa có mục nào đến hạn ôn.',
  });
  assert.equal(none.store.created.length, 0);
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

// ---- /me/* (Task 9) ----

const FORBIDDEN = /rarity|marketPrice|hsHints|provenance|tradeRestriction/;

interface La {
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
let qn = 0;
const la = (sessionId: string, targetId: string, at: string, over: Partial<La> = {}): La => ({
  userId: 'u1',
  sessionId,
  questionId: 'q' + qn++,
  targetId,
  skill: 'name:en',
  mode: 'flashcard',
  isReview: false,
  attemptNumber: 1,
  correct: true,
  skipped: false,
  selfRated: false,
  contentVersion: 'v',
  releaseId: 'r1',
  label: 'L ' + targetId,
  at: new Date(at),
  ...over,
});

function meDb(
  progress: Rec[],
  log: La[] = [],
  active: { id: string } | null = null,
  pick?: (arg: never) => { id: string } | undefined,
) {
  const store = fakeDb(progress, {
    learningAttempt: {
      findMany: async (arg: { where: { userId: string } }) => (
        (store.calls['learningAttempt.findMany'] ??= []).push(arg),
        log
          .filter((r) => r.userId === arg.where.userId)
          .sort((a, b) => a.at.getTime() - b.at.getTime())
      ),
    },
    gameSession: {
      findFirst: async (arg: unknown) => (
        (store.calls['gameSession.findFirst'] ??= []).push(arg),
        pick ? (pick(arg as never) ?? null) : active
      ),
    },
  });
  return store;
}
const hsRec = (over: Partial<Rec> = {}) =>
  rec('hs-1', { skill: 'hs', contentVersion: scenarioFingerprint(hsData), ...over });

test('/me/mastery: every current item, status by effective due, level from scoped rows', async () => {
  const rows = [
    // Raw dueAt passed, stage-2 interval from lastAttemptAt not yet: learning, level 3.
    rec('item-B', { stage: 2, dueAt: new Date(NOW - DAY), lastAttemptAt: new Date(NOW - DAY) }),
    // Stale fingerprint: ignored -> new.
    rec('item-C', { stage: 3, contentVersion: 'old' }),
    rec('item-D', { stage: 0 }),
    // Listening only: not a learn skill, not the item's own target id.
    rec('item-E/listening/en', { skill: 'listening' }),
  ];
  const svc = new ProgressService(meDb(rows).db, catalogFake);
  assert.deepEqual(await svc.mastery(student, NOW), {
    'item-A': { status: 'new', level: 0 },
    'item-B': { status: 'learning', level: 3 },
    'item-C': { status: 'new', level: 0 },
    'item-D': { status: 'due', level: 1 },
    'item-E': { status: 'new', level: 0 },
  });
});

test('/me/*: two students see only their own rows', async () => {
  const rows = [
    rec('item-B', { stage: 1, dueAt: new Date(NOW + 5 * DAY) }),
    rec('item-D', { userId: 'u2', stage: 3, dueAt: new Date(NOW + 20 * DAY) }),
  ];
  const log = [
    la('s1', 'item-B', '2026-06-09T03:00:00.000Z'),
    la('s2', 'item-D', '2026-06-09T03:00:00.000Z', { userId: 'u2', correct: false }),
  ];
  const { db, calls } = meDb(rows, log);
  const svc = new ProgressService(db, catalogFake);
  const other = actor('student', 'u2', 'a2');
  const [m1, m2] = [await svc.mastery(student, NOW), await svc.mastery(other, NOW)];
  assert.deepEqual(
    [m1['item-B'], m1['item-D']],
    [
      { status: 'learning', level: 2 },
      { status: 'new', level: 0 },
    ],
  );
  assert.deepEqual(
    [m2['item-B'], m2['item-D']],
    [
      { status: 'new', level: 0 },
      { status: 'learning', level: 4 },
    ],
  );
  const [r1, r2] = [await svc.review(student, NOW), await svc.review(other, NOW)];
  assert.deepEqual(
    r1.scheduled.map((e) => e.targetId),
    ['item-B'],
  );
  assert.deepEqual(
    r2.scheduled.map((e) => e.targetId),
    ['item-D'],
  );
  const [p1, p2] = [await svc.progress(student, NOW), await svc.progress(other, NOW)];
  assert.equal(p1.figures.firstTryPercent, 100);
  assert.equal(p2.figures.firstTryPercent, 0);
  assert.deepEqual(
    p1.sessions.map((s) => s.sessionId),
    ['s1'],
  );
  assert.deepEqual(
    p2.sessions.map((s) => s.sessionId),
    ['s2'],
  );
  // Call i belongs to request i: mastery, review, progress, alternating u1 then u2.
  const users = (name: string) =>
    calls[name]!.map((c) => (c as { where: { userId: string } }).where.userId);
  assert.deepEqual(users('reviewProgress.findMany'), ['u1', 'u2', 'u1', 'u2', 'u1', 'u2']);
  assert.deepEqual(users('learningAttempt.findMany'), ['u1', 'u2']);
});

test('/me/review splits due and scheduled by effective due, earliest first', async () => {
  const rows = [
    // Raw due passed but effective due is lastAttemptAt + 7d = NOW + 6d: scheduled.
    rec('item-B', { stage: 2, dueAt: new Date(NOW - DAY), lastAttemptAt: new Date(NOW - DAY) }),
    rec('item-D', { dueAt: new Date(NOW - 4 * DAY), lastAttemptAt: new Date(NOW - 5 * DAY) }),
    rec('item-A', { stage: 1, dueAt: new Date(NOW + 2 * DAY), lastAttemptAt: new Date(NOW) }),
    rec('item-E/listening/en', {
      skill: 'listening',
      dueAt: new Date(NOW - 2 * DAY),
      lastAttemptAt: new Date(NOW - 3 * DAY),
    }),
    hsRec({ dueAt: new Date(NOW - 3 * DAY), lastAttemptAt: new Date(NOW - 4 * DAY) }),
    rec('item-C', { contentVersion: 'old' }),
  ];
  const r = await new ProgressService(meDb(rows).db, catalogFake).review(student, NOW);
  assert.deepEqual(r.due, [
    {
      targetId: 'item-D',
      itemId: 'item-D',
      label: 'D',
      skill: 'name:en',
      stage: 0,
      dueAt: iso(NOW - 4 * DAY),
    },
    {
      targetId: 'hs-1',
      itemId: null,
      label: 'B',
      skill: 'hs',
      stage: 0,
      dueAt: iso(NOW - 3 * DAY),
    },
    {
      targetId: 'item-E/listening/en',
      itemId: 'item-E',
      label: 'E',
      skill: 'listening',
      stage: 0,
      dueAt: iso(NOW - 2 * DAY),
    },
  ]);
  assert.deepEqual(r.scheduled, [
    {
      targetId: 'item-A',
      itemId: 'item-A',
      label: 'A',
      skill: 'name:en',
      stage: 1,
      dueAt: iso(NOW + 3 * DAY),
    },
    {
      targetId: 'item-B',
      itemId: 'item-B',
      label: 'B',
      skill: 'name:en',
      stage: 2,
      dueAt: iso(NOW + 6 * DAY),
    },
  ]);
});

test('/me/home: haul, cast, due count, skills and the resumable session', async () => {
  const rows = [
    rec('item-D', { dueAt: new Date(NOW - 4 * DAY), lastAttemptAt: new Date(NOW - 5 * DAY) }),
    rec('item-B', { stage: 2, dueAt: new Date(NOW - DAY), lastAttemptAt: new Date(NOW - DAY) }),
    hsRec({ dueAt: new Date(NOW - 3 * DAY), lastAttemptAt: new Date(NOW - 4 * DAY) }),
  ];
  const { db, calls } = meDb(rows, [], { id: 'g1' });
  const h = await new ProgressService(db, catalogFake).home(student, NOW);
  assert.equal(h.releaseId, 'r1');
  assert.equal(h.internal, false);
  assert.equal(h.learnable, 5);
  assert.equal(h.due, 2, 'item-D and hs-1 are effectively due; item-B is not');
  assert.deepEqual(
    h.haul.map((i) => i.itemId),
    ['item-D', 'item-A', 'item-C', 'item-E'],
  );
  assert.deepEqual(h.cast, {
    kind: 'review',
    targets: [
      { targetId: 'item-D', skill: 'name:en' },
      { targetId: 'hs-1', skill: 'hs' },
    ],
  });
  assert.deepEqual(
    h.skills.map((s) => [s.key, s.done, s.total]),
    [
      ['en', 1, 5],
      ['ja', 0, 5],
      ['scientific', 0, 5],
      ['hs', 0, 1],
    ],
  );
  assert.equal(h.activeSessionId, 'g1');
  assert.deepEqual(calls['gameSession.findFirst']![0], {
    where: {
      actorId: 'a1',
      expiresAt: { gt: new Date(NOW) },
      questions: { some: { attempt: { is: null } } },
      releaseId: 'r1',
      release: { internal: false },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  const none = await new ProgressService(meDb([]).db, catalogFake).home(student, NOW);
  assert.equal(none.activeSessionId, null);
  assert.equal(none.due, 0);
  assert.deepEqual(none.cast, { kind: 'flashcard', revisionId: 'rev-A' });
});

test('/me/progress: figures, sessions, streak and badge inputs from a sample log', async () => {
  const day = (d: string, h = '03') => `2026-05-0${d}T${h}:00:00.000Z`;
  const log = [
    la('d1', 's10', day('1', '01'), { skipped: true, correct: false }),
    la('d1', 's0', day('1')),
    la('d1', 's1', day('1'), { selfRated: true }),
    la('d1', 'hs-1', day('1'), { skill: 'hs', correct: false }),
    la('d2', 's2', day('2')),
    la('d2', 's3', day('2'), { correct: false }),
    la('d3', 's4', day('3')),
    la('d4', 's5', day('4')),
    la('d5', 's6', day('5')),
    la('d6', 's7', day('6')),
    la('r7', 's8', day('7'), { isReview: true }),
    la('last', 's9', '2026-06-09T03:00:00.000Z', { isReview: true }),
    la('last', 's0', '2026-06-09T04:00:00.000Z', { isReview: true, attemptNumber: 2 }),
    la('last', 's11', '2026-06-09T05:00:00.000Z', { isReview: true }),
    la('x', 's20', '2026-06-09T06:00:00.000Z', { userId: 'u2' }),
  ];
  const rows = [rec('item-B', { stage: 1 }), rec('item-D', { stage: 3 })];
  const { db, calls } = meDb(rows, log);
  const p = await new ProgressService(db, catalogFake).progress(student, NOW);
  assert.deepEqual(calls['learningAttempt.findMany']![0], {
    where: { userId: 'u1' },
    orderBy: { at: 'asc' },
  });
  assert.deepEqual(p.figures, { answered: 12, firstTryPercent: 83, selfRated: 1 });
  assert.deepEqual(
    p.sessions.map((s) => s.sessionId),
    ['last', 'r7', 'd6', 'd5', 'd4'],
  );
  assert.deepEqual(p.sessions[0], {
    sessionId: 'last',
    at: '2026-06-09T05:00:00.000Z',
    mode: 'review',
    answered: 3,
    firstTry: 2,
    selfRated: 0,
    percent: 67,
  });
  assert.deepEqual(p.mastery, { unlearned: 3, level1: 0, level2: 1, level3: 0, level4: 1 });
  assert.deepEqual(p.achievements.streak, { current: 1, longest: 7 });
  const badge = Object.fromEntries(p.achievements.badges.map((b) => [b.id, b.earnedAt]));
  // 11 species (skipped s10 and HS cases excluded); first10 dated at the 10th species' first seen.
  assert.equal(badge.first10, '2026-06-09T03:00:00.000Z');
  // Longest streak (7) counts even though the current one is 1; dated at the latest species.
  assert.equal(badge.streak7, '2026-06-09T05:00:00.000Z');
  assert.equal(badge.species100, null);
  assert.equal(badge.solid50, null);
  assert.equal(badge.review10, null);
  assert.equal(p.skills.length, 4);
});

test('/me/* responses never carry restricted catalog fields', async () => {
  const leaky = {
    ...catalogFake,
    overview: async () => {
      const o = await catalogFake.overview(student);
      return {
        ...o,
        items: o.items.map((i) => ({
          ...i,
          rarity: 'rare',
          marketPrice: 1,
          hsHints: ['x'],
          provenance: 'p',
          tradeRestriction: 't',
        })),
      };
    },
  } as unknown as Catalog;
  const rows = [rec('item-B'), rec('item-D', { stage: 2, dueAt: new Date(NOW + DAY) }), hsRec()];
  const log = [la('s1', 'item-B', '2026-06-09T03:00:00.000Z')];
  const svc = new ProgressService(meDb(rows, log, { id: 'g1' }).db, leaky);
  const controller = new MeProgressController(svc);
  const req = { actor: student } as unknown as ActorRequest;
  for (const res of [
    await controller.home(req),
    await controller.review(req),
    await controller.progress(req),
    await controller.mastery(req),
  ])
    assert.ok(!FORBIDDEN.test(JSON.stringify(res)), JSON.stringify(res));
});

test('solid species: stage >= 2 (remembered for a week or more) counts, stage 1 does not', async () => {
  const rows = [
    rec('item-A', { stage: 1 }),
    rec('item-B', { stage: 2 }),
    rec('item-C', { stage: 3 }),
    rec('item-D', { stage: 1, skill: 'name:ja' }),
    rec('item-D', { stage: 0 }),
    rec('item-E', { stage: 3, contentVersion: 'old' }),
  ];
  const svc = new ProgressService(meDb(rows).db, catalogFake);
  const c = await svc.context(student);
  assert.equal(solidSpecies(c.overview, c.rows), 2, 'item-B and item-C; stale item-E dropped');
  const many = Array.from({ length: 60 }, (_, i) => ({
    revisionId: 'rev-' + i,
    itemId: 'it-' + i,
    vi: 'v' + i,
    scientific: '',
    taxonomicGroup: null,
    imageId: null,
  }));
  const at = (stage: number) =>
    many.map((m) => ({
      targetId: m.itemId,
      skill: 'name:en',
      stage,
      dueAt: iso(NOW),
      lastSessionId: 's',
      contentVersion: 'v',
      selfRated: false,
      lastAttemptAt: iso(NOW),
    }));
  const o = { items: many, learnable: 60, hsCases: 0 };
  assert.equal(solidSpecies(o, at(1)), 0);
  assert.equal(solidSpecies(o, at(2)), 60);
});

test('submit tolerates afterSubmit failure: graded result, progress [], stored result unchanged', async () => {
  const progress: Rec[] = [];
  const { db, writes } = submitDb(progress);
  const svc = new ProgressService(db, catalogFake);
  svc.afterSubmit = async () => {
    throw new Error('db hiccup');
  };
  const l = new Learning(db, catalogFake, {} as Media, svc);
  const errors: unknown[][] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => void errors.push(a);
  let r: Record<string, unknown>;
  try {
    r = (await l.submit(student, 'sess', 'q1', 'key-12345', answer)) as Record<string, unknown>;
  } finally {
    console.error = orig;
  }
  assert.deepEqual(r.progress, []);
  assert.equal(r.correct, (writes[0] as Record<string, unknown>).correct);
  assert.equal((writes[0] as Record<string, unknown>).progress, undefined);
  assert.equal(errors.length, 1);
});

test('/me/home resumes only a session of the current release', async () => {
  const sessions = [{ id: 'old', releaseId: 'r0' }];
  const withSessions = (list: { id: string; releaseId: string }[]) =>
    meDb([], [], null, (arg: { where: { releaseId: string } }) =>
      list.find((s) => s.releaseId === arg.where.releaseId),
    );
  const stale = await new ProgressService(withSessions(sessions).db, catalogFake).home(
    student,
    NOW,
  );
  assert.equal(stale.activeSessionId, null);
  const current = await new ProgressService(
    withSessions([...sessions, { id: 'cur', releaseId: 'r1' }]).db,
    catalogFake,
  ).home(student, NOW);
  assert.equal(current.activeSessionId, 'cur');
});

test('afterSubmit skips rows with a stale fingerprint and keeps the others', async () => {
  const rows = [rec('item-A', { contentVersion: 'old-fingerprint' }), rec('item-B', { stage: 1 })];
  const { db } = fakeDb(rows);
  const result = {
    skipped: false,
    targetId: 'matching',
    skill: 'name:en',
    items: [{ targetId: 'item-A' }, { targetId: 'item-B' }],
  };
  const svc = new ProgressService(db, catalogFake);
  const touched = touchedTargets(result as never);
  assert.equal(touched.length, 2, 'fixture touches both rows');
  const out = await svc.afterSubmit(student, result);
  assert.deepEqual(
    out.map((e) => e.targetId),
    ['item-B'],
  );
});
