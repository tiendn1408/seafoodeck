import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HttpException } from '@nestjs/common';
import type { Response } from 'express';
import type { Db } from './db';
import type { Catalog } from './catalog';
import type { ActorRequest } from './security';
import { ProgressService } from './progress.service';
import { MeProgressController } from './me.controller';
import { ManagerController } from './manager.controller';
import { itemFingerprint } from './progress-fingerprint';

const NOW = Date.parse('2026-06-10T00:00:00.000Z');
const DAY = 86_400_000;
const names = (vi: string) => [
  { kind: 'vi', label: vi },
  { kind: 'en', label: vi + ' en' },
];
const revisions = ['A', 'B', 'C'].map((v) => ({
  id: 'rev-' + v,
  itemId: 'item-' + v,
  names: names(v),
}));
const release = { id: 'r1', internal: false };
const catalogFake = {
  current: async () => release,
  overview: async () => ({
    releaseId: 'r1',
    internal: false,
    learnable: 3,
    groups: { fish: 3, crustacean: 0, mollusc: 0, other: 0, none: 0 },
    hsCases: 0,
    items: revisions.map((r) => ({
      revisionId: r.id,
      itemId: r.itemId,
      vi: r.names[0].label,
      scientific: '',
      taxonomicGroup: 'fish',
      imageId: null,
      rarity: 'rare',
      marketPrice: 1,
      hsHints: ['x'],
      provenance: 'p',
      tradeRestriction: 't',
    })),
  }),
} as unknown as Catalog;

const user = (id: string, role: string, over: Record<string, unknown> = {}) => ({
  id,
  username: 'name-' + id,
  passwordHash: 'secret-hash',
  role,
  displayName: null,
  disabledAt: null,
  mustChangePassword: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  lastLoginAt: null,
  ...over,
});
const users = [
  user('s1', 'student', {
    displayName: 'Học viên 1',
    lastLoginAt: new Date('2026-06-09T00:00:00.000Z'),
  }),
  user('s2', 'student'),
  user('s3', 'student', { disabledAt: new Date('2026-05-01T00:00:00.000Z') }),
  user('s4', 'student', { displayName: 'ánh' }),
  user('m1', 'manager'),
  user('a1', 'admin'),
  user('e1', 'editor'),
];
const rec = (userId: string, item: string, over: Record<string, unknown> = {}) => ({
  userId,
  targetId: item,
  skill: 'name:en',
  stage: 0,
  dueAt: new Date(NOW - 2 * DAY),
  lastAttemptAt: new Date(NOW - 3 * DAY),
  lastSessionId: 's0',
  contentVersion: itemFingerprint(names(item.replace('item-', ''))),
  selfRated: false,
  ...over,
});
const progressRows = [
  rec('s1', 'item-A'),
  rec('s1', 'item-B', { stage: 2 }),
  rec('s3', 'item-C'),
  rec('s4', 'item-A', {
    stage: 3,
    dueAt: new Date(NOW + 5 * DAY),
    lastAttemptAt: new Date(NOW - 10 * DAY),
  }),
];
const attempt = (userId: string, sessionId: string, targetId: string, at: string) => ({
  userId,
  sessionId,
  questionId: 'q' + sessionId + targetId,
  targetId,
  skill: 'name:en',
  mode: 'flashcard',
  isReview: false,
  attemptNumber: 1,
  correct: true,
  skipped: false,
  selfRated: false,
  label: 'L',
  at: new Date(at),
});
const attempts = [
  attempt('s1', 'x1', 'item-A', '2026-06-09T03:00:00.000Z'),
  attempt('s1', 'x1', 'item-B', '2026-06-09T03:01:00.000Z'),
  attempt('s4', 'y1', 'item-A', '2026-05-31T00:00:00.000Z'),
  { ...attempt('s3', 'z1', 'item-A', '2026-06-09T00:00:00.000Z'), skipped: true },
];
let queries = 0;
const inIds = (w: { userId: string | { in: string[] } }) => (p: { userId: string }) =>
  typeof w.userId === 'string' ? p.userId === w.userId : w.userId.in.includes(p.userId);
const db = {
  user: {
    findUnique: async (arg: { where: { id: string } }) =>
      users.find((u) => u.id === arg.where.id) ?? null,
    findMany: async (arg: { where: { role: string } }) => {
      queries++;
      return users.filter((u) => u.role === arg.where.role);
    },
  },
  revision: { findMany: async () => revisions },
  tradeScenario: { findMany: async () => [] },
  reviewProgress: {
    findMany: async (arg: { where: { userId: string | { in: string[] } } }) => {
      queries++;
      return progressRows.filter(inIds(arg.where));
    },
  },
  learningAttempt: {
    findMany: async (arg: { where: { userId: string | { in: string[] }; skipped?: boolean } }) => {
      queries++;
      return attempts
        .filter(inIds(arg.where))
        .filter((a) => arg.where.skipped === undefined || a.skipped === arg.where.skipped);
    },
  },
} as unknown as Db;
const svc = new ProgressService(db, catalogFake);
const controller = new ManagerController(db, svc);
controller.now = () => NOW;
const req = (role: string, userId: string | null = null) =>
  ({
    actor: { id: 'sess', role, userId, internal: false, csrf: 'c', expiresAt: new Date(NOW + DAY) },
  }) as unknown as ActorRequest;
const asManager = req('manager', 'm1');
const status = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (e) {
    return (e as HttpException).getStatus();
  }
  return 200;
};
const calls = (r: ActorRequest, id: string) => [
  () => controller.learner(r, id),
  () => controller.progress(r, id),
  () => controller.review(r, id),
  () => controller.mastery(r, id),
];

test('manager endpoints: only manager and admin pass; others 403', async () => {
  for (const r of [
    req('student', 's1'),
    req('learner'),
    req('guest'),
    req('editor', 'e1'),
    req('reviewer', 'x'),
    req('publisher', 'x'),
  ])
    for (const call of calls(r, 's1')) assert.equal(await status(call), 403, r.actor.role);
  for (const r of [asManager, req('admin', 'a1')])
    for (const call of calls(r, 's1')) assert.equal(await status(call), 200, r.actor.role);
});

test('manager endpoints: non-student ids (admin, editor, manager, the caller) are 404', async () => {
  for (const id of ['a1', 'e1', 'm1', 'missing'])
    for (const call of calls(asManager, id)) assert.equal(await status(call), 404, id);
  // The caller's own id, even when the caller is an admin.
  for (const call of calls(req('admin', 'a1'), 'a1')) assert.equal(await status(call), 404);
});

test('learner detail: safe fields only, ISO dates, disabled learners stay visible', async () => {
  assert.deepEqual(await controller.learner(asManager, 's1'), {
    id: 's1',
    username: 'name-s1',
    displayName: 'Học viên 1',
    disabled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastLoginAt: '2026-06-09T00:00:00.000Z',
  });
  const disabled = await controller.learner(asManager, 's3');
  assert.equal(disabled.disabled, true);
  assert.equal(disabled.lastLoginAt, null);
  assert.ok(!/passwordHash|secret-hash/.test(JSON.stringify(disabled)));
});

test('learner without answers: empty screens, no error', async () => {
  const p = await controller.progress(asManager, 's2');
  assert.equal(p.figures.answered, 0);
  assert.deepEqual(p.sessions, []);
  assert.deepEqual(await controller.review(asManager, 's2'), { due: [], scheduled: [] });
  const m = await controller.mastery(asManager, 's2');
  assert.ok(Object.values(m).every((e) => e.status === 'new' && e.level === 0));
});

test('per-learner progress equals /me for that learner, differs between learners, no leaks', async () => {
  const me = new MeProgressController(svc);
  const own = (id: string) =>
    ({ actor: { ...asManager.actor, role: 'student', userId: id } }) as ActorRequest;
  // /me uses the learner's own session; the manager view must match exactly. Time is whatever
  // Date.now() is for both, so compare with a pinned clock via the service for determinism.
  const meP = await me.progress(own('s1'));
  const mgP = await controller.progress(asManager, 's1');
  assert.deepEqual(mgP, meP);
  assert.deepEqual(await controller.review(asManager, 's1'), await me.review(own('s1')));
  assert.deepEqual(await controller.mastery(asManager, 's1'), await me.mastery(own('s1')));
  assert.notDeepEqual(mgP, await controller.progress(asManager, 's3'));
  assert.notDeepEqual(
    await controller.mastery(asManager, 's1'),
    await controller.mastery(asManager, 's3'),
  );
  const all = JSON.stringify([
    mgP,
    await controller.review(asManager, 's1'),
    await controller.mastery(asManager, 's1'),
  ]);
  assert.ok(!/rarity|marketPrice|hsHints|provenance|tradeRestriction|passwordHash/.test(all));
});

test('ProgressService: explicit userId reads that learner; default stays the actor', async () => {
  const manager = asManager.actor;
  assert.deepEqual((await svc.review(manager, NOW)).due, []);
  const r = await svc.review(manager, NOW, 's1');
  assert.equal(r.due.length + r.scheduled.length, 2);
  assert.equal((await svc.active(manager, 's1')).rows.length, 2);
  assert.equal((await svc.active(manager)).rows.length, 0);
  assert.equal((await svc.mastery(manager, NOW, 's1'))['item-A'].status, 'due');
  assert.equal((await svc.progress(manager, NOW, 's1')).figures.answered, 2);
});

// ---- learner table and CSV ----
const fakeRes = () => {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader: (k: string, v: string) => (headers[k] = v),
  } as unknown as Response & { headers: Record<string, string> };
};
const list = (q: Record<string, unknown> = {}, r: ActorRequest = asManager) =>
  controller.learners(r, q);
const ids = async (q: Record<string, unknown> = {}) => (await list(q)).items.map((i) => i.id);

test('learner table: figures per learner, safe fields only, disabled hidden by default', async () => {
  const t = await list();
  assert.equal(t.total, 3);
  assert.equal(t.page, 1);
  assert.equal(t.limit, 50);
  const byId = Object.fromEntries(t.items.map((i) => [i.id, i]));
  assert.deepEqual(byId.s1, {
    id: 's1',
    username: 'name-s1',
    displayName: 'Học viên 1',
    disabled: false,
    learning: 2,
    solid: 1,
    avgLevel: 2,
    lastStudyAt: '2026-06-09T03:01:00.000Z',
    overdue: 1,
    sessions7d: 1,
  });
  assert.deepEqual(byId.s2, {
    id: 's2',
    username: 'name-s2',
    displayName: null,
    disabled: false,
    learning: 0,
    solid: 0,
    avgLevel: null,
    lastStudyAt: null,
    overdue: 0,
    sessions7d: 0,
  });
  assert.equal(byId.s4.avgLevel, 4);
  assert.equal(byId.s4.sessions7d, 0);
  assert.ok(!byId.s3);
  assert.ok(!/passwordHash|secret-hash|role|createdAt/.test(JSON.stringify(t)));
  const all = await list({ includeDisabled: true });
  assert.equal(all.total, 4);
  assert.equal(all.items.find((i) => i.id === 's3')?.disabled, true);
  assert.equal((await list({ includeDisabled: 'true' })).total, 4);
});

test('learner table: default sort is lastStudyAt desc, nulls last in both directions', async () => {
  assert.deepEqual(await ids(), ['s1', 's4', 's2']);
  assert.deepEqual(await ids({ sort: 'lastStudyAt', dir: 'asc' }), ['s4', 's1', 's2']);
});

test('learner table: every sort column, both directions, ties by username, nulls last', async () => {
  const expected: Record<string, [string[], string[]]> = {
    name: [
      ['s4', 's1', 's2'],
      ['s2', 's1', 's4'],
    ],
    lastStudyAt: [
      ['s4', 's1', 's2'],
      ['s1', 's4', 's2'],
    ],
    learning: [
      ['s2', 's4', 's1'],
      ['s1', 's4', 's2'],
    ],
    solid: [
      ['s2', 's1', 's4'],
      ['s1', 's4', 's2'],
    ],
    avgLevel: [
      ['s1', 's4', 's2'],
      ['s4', 's1', 's2'],
    ],
    overdue: [
      ['s2', 's4', 's1'],
      ['s1', 's2', 's4'],
    ],
    sessions7d: [
      ['s2', 's4', 's1'],
      ['s1', 's2', 's4'],
    ],
  };
  for (const [sort, [asc, desc]] of Object.entries(expected)) {
    assert.deepEqual(await ids({ sort, dir: 'asc' }), asc, sort + ' asc');
    assert.deepEqual(await ids({ sort, dir: 'desc' }), desc, sort + ' desc');
  }
});

test('learner table: filters', async () => {
  assert.deepEqual((await ids({ filter: 'idle7d' })).sort(), ['s2', 's4']);
  assert.deepEqual((await ids({ filter: 'idle7d', includeDisabled: true })).sort(), [
    's2',
    's3',
    's4',
  ]);
  assert.deepEqual(await ids({ filter: 'overdue' }), ['s1']);
  assert.deepEqual((await ids({ filter: 'overdue', includeDisabled: true })).sort(), ['s1', 's3']);
  // the disabled filter lists locked learners even without includeDisabled
  assert.deepEqual(await ids({ filter: 'disabled' }), ['s3']);
});

test('learner table: q matches username or display name, ignores case, wildcards are literal', async () => {
  assert.deepEqual(await ids({ q: 'HỌC' }), ['s1']);
  assert.deepEqual(await ids({ q: 'name-S2' }), ['s2']);
  assert.deepEqual((await ids({ q: 'name' })).sort(), ['s1', 's2', 's4']);
  assert.deepEqual(await ids({ q: '%' }), []);
  assert.deepEqual(await ids({ q: '_' }), []);
  assert.deepEqual(await ids({ q: '  ' }), ['s1', 's4', 's2']);
});

test('learner table: pagination, limit bounds and page overflow are safe', async () => {
  const p1 = await list({ limit: 2, page: 1 });
  const p2 = await list({ limit: 2, page: 2 });
  assert.deepEqual(
    [...p1.items, ...p2.items].map((i) => i.id),
    ['s1', 's4', 's2'],
  );
  assert.equal(p2.total, 3);
  assert.equal(p2.page, 2);
  const far = await list({ limit: 2, page: 1e15 });
  assert.deepEqual(far.items, []);
  assert.equal(far.total, 3);
  assert.equal((await list({ limit: 9999 })).limit, 200);
  assert.equal((await list({ limit: 0 })).limit, 50);
  assert.equal((await list({ page: -3, limit: 'x' })).page, 1);
});

test('learner table: constant number of queries regardless of learner count', async () => {
  const b1 = queries;
  await list({ includeDisabled: true }); // 4 learners
  const b2 = queries;
  await list({ q: 'name-s1' }); // 1 learner
  const b3 = queries;
  assert.equal(b2 - b1, 3, 'student list, progress and attempt reads only');
  assert.equal(b3 - b2, 3);
});

test('learner table: only manager and admin; others 403', async () => {
  for (const r of [req('student', 's1'), req('learner'), req('guest'), req('editor', 'e1')]) {
    assert.equal(await status(() => list({}, r)), 403, r.actor.role);
    assert.equal(await status(() => controller.learnersCsv(r, {}, fakeRes())), 403, r.actor.role);
  }
  for (const r of [asManager, req('admin', 'a1')]) {
    assert.equal(await status(() => list({}, r)), 200);
    assert.equal(await status(() => controller.learnersCsv(r, {}, fakeRes())), 200);
  }
});

test('learner CSV: headers, Vietnamese status, matches table, no ids or hashes', async () => {
  const res = fakeRes();
  const csv = await controller.learnersCsv(asManager, { includeDisabled: true }, res);
  assert.equal(res.headers['Content-Type'], 'text/csv; charset=utf-8');
  assert.equal(res.headers['Content-Disposition'], 'attachment; filename="hoc-vien.csv"');
  const lines = csv.split('\r\n');
  assert.equal(
    lines[0],
    '﻿Tên đăng nhập,Tên hiển thị,Đang học,Đã vững,Mức nhớ TB,Lần học cuối,Quá hạn,Phiên 7 ngày,Trạng thái',
  );
  const table = await list({ includeDisabled: true, limit: 200 });
  assert.equal(lines.length, table.items.length + 2); // header, rows, trailing newline
  assert.equal(lines[lines.length - 1], '');
  assert.equal(lines[1], 'name-s1,Học viên 1,2,1,2,2026-06-09T03:01:00.000Z,1,1,Đang hoạt động');
  assert.ok(csv.includes('name-s3,,1,0,1,,1,0,Đã khóa')); // its only answer was skipped
  assert.ok(!/passwordHash|secret-hash|(^|,)(s1|s3)(,|\r)/m.test(csv));
  // same sort params apply, no pagination
  const desc = (
    await controller.learnersCsv(
      asManager,
      { sort: 'name', dir: 'desc', limit: 1, page: 2 },
      fakeRes(),
    )
  ).split('\r\n');
  assert.equal(desc.length, 3 + 2);
  assert.ok(desc[1].startsWith('name-s2'));
  const filtered = await controller.learnersCsv(asManager, { filter: 'disabled' }, fakeRes());
  assert.ok(filtered.includes('name-s3') && !filtered.includes('name-s1'));
});

test('learner CSV: formula-looking names are neutralised', async () => {
  users.push(user('s9', 'student', { username: '=cmd', displayName: '+1,"x"' }));
  try {
    const csv = await controller.learnersCsv(asManager, { q: 'cmd' }, fakeRes());
    assert.ok(csv.includes(`'=cmd,"'+1,""x"""`));
  } finally {
    users.pop();
  }
});
