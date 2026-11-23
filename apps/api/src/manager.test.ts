import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HttpException } from '@nestjs/common';
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
const progressRows = [rec('s1', 'item-A'), rec('s1', 'item-B', { stage: 2 }), rec('s3', 'item-C')];
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
];
const db = {
  user: {
    findUnique: async (arg: { where: { id: string } }) =>
      users.find((u) => u.id === arg.where.id) ?? null,
  },
  revision: { findMany: async () => revisions },
  tradeScenario: { findMany: async () => [] },
  reviewProgress: {
    findMany: async (arg: { where: { userId: string } }) =>
      progressRows.filter((p) => p.userId === arg.where.userId),
  },
  learningAttempt: {
    findMany: async (arg: { where: { userId: string } }) =>
      attempts.filter((a) => a.userId === arg.where.userId),
  },
} as unknown as Db;
const svc = new ProgressService(db, catalogFake);
const controller = new ManagerController(db, svc);
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
