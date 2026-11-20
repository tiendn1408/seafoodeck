import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  requireStudent,
  requireManager,
  requireRole,
  LoginLimiter,
  MustChangePasswordGuard,
  AdminOnlyGuard,
  passwordMinFor,
  passwordHash,
  passwordMatches,
  type Auth,
  type ActorRequest,
} from './security';
import type { Request, Response } from 'express';
import { MeController, MeProgressController } from './me.controller';
import type { ProgressService } from './progress.service';
import { AuthController } from './auth.controller';
import { UserDto } from './admin-extra.controller';
import { CatalogController } from './controllers';
import type { Db } from './db';

const req = (role: string, userId: string | null = null) =>
  ({ actor: { role, userId } }) as unknown as ActorRequest;
const status = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return {
      status: (error as HttpException).getStatus(),
      body: (error as HttpException).getResponse(),
    };
  }
  return { status: 200, body: null };
};

test('requireStudent admits only account students', () => {
  assert.equal(status(() => requireStudent(req('student', 'u1'))).status, 200);
  for (const role of ['learner', 'guest']) {
    const r = status(() => requireStudent(req(role)));
    assert.equal(r.status, 403);
    assert.equal((r.body as { message: string }).message, 'Đăng nhập tài khoản để xem tiến độ.');
  }
  for (const role of ['manager', 'admin', 'editor']) {
    const r = status(() => requireStudent(req(role, 'u1')));
    assert.equal(r.status, 403);
    assert.equal((r.body as { message: string }).message, 'Tài khoản không có quyền thao tác này.');
  }
  // A student role string without an account must not pass.
  assert.equal(status(() => requireStudent(req('student', null))).status, 403);
});

test('requireManager admits manager and admin only', () => {
  assert.equal(status(() => requireManager(req('manager', 'u1'))).status, 200);
  assert.equal(status(() => requireManager(req('admin', 'u1'))).status, 200);
  for (const role of ['student', 'learner', 'guest', 'editor', 'reviewer', 'publisher'])
    assert.equal(status(() => requireManager(req(role, 'u1'))).status, 403);
});

test('student and manager stay out of staff routes', () => {
  const ctx = (role: string) =>
    ({ switchToHttp: () => ({ getRequest: () => req(role, 'u1') }) }) as ExecutionContext;
  for (const role of ['student', 'manager'])
    assert.equal(status(() => new AdminOnlyGuard().canActivate(ctx(role))).status, 403);
  assert.equal(status(() => requireRole(req('manager', 'u1'), ['editor', 'admin'])).status, 403);
});

test('LoginLimiter blocks the 11th reservation for one username across IPs, case-insensitively', () => {
  const limiter = new LoginLimiter();
  for (let i = 0; i < 10; i++) limiter.check(`10.0.0.${i}`, i % 2 ? 'Alice' : 'alice');
  assert.equal(status(() => limiter.check('10.0.1.1', 'ALICE')).status, 429);
  assert.equal(status(() => limiter.check('10.0.1.2', 'bob')).status, 200);
});

test('LoginLimiter keeps the 20-per-IP bucket without usernames', () => {
  const limiter = new LoginLimiter();
  for (let i = 0; i < 20; i++) limiter.check('10.0.0.1');
  assert.equal(status(() => limiter.check('10.0.0.1')).status, 429);
  assert.equal(status(() => limiter.check('10.0.0.2')).status, 200);
  const mixed = new LoginLimiter();
  for (let i = 0; i < 20; i++) mixed.check('10.0.0.9', `user${i}`);
  assert.equal(status(() => mixed.check('10.0.0.9', 'fresh')).status, 429);
});

test('LoginLimiter: a blocked check does not count; succeed refunds the IP and clears only that name', () => {
  const limiter = new LoginLimiter();
  for (let i = 0; i < 25; i++) {
    limiter.check('10.0.0.1', 'alice');
    limiter.succeed('10.0.0.1', 'alice');
  }
  for (let i = 0; i < 10; i++) limiter.check('10.0.0.2', 'alice');
  limiter.check('10.0.0.2', 'bob');
  for (let i = 0; i < 5; i++)
    assert.equal(status(() => limiter.check('10.0.0.3', 'alice')).status, 429);
  limiter.succeed('10.0.0.3', 'bob');
  assert.equal(
    status(() => limiter.check('10.0.0.3', 'alice')).status,
    429,
    'bob success keeps alice',
  );
  limiter.succeed('10.0.0.2', 'alice');
  assert.equal(status(() => limiter.check('10.0.0.3', 'alice')).status, 200);
  // Refund never goes below zero.
  const fresh = new LoginLimiter();
  for (let i = 0; i < 5; i++) fresh.succeed('1.1.1.1', 'x');
  for (let i = 0; i < 20; i++) fresh.check('1.1.1.1');
  assert.equal(status(() => fresh.check('1.1.1.1')).status, 429);
});

const slowLogin = (user: Record<string, unknown> | null, limiter: LoginLimiter) => {
  const { db } = accountDb(user);
  const find = db.user.findUnique;
  (db.user as { findUnique: unknown }).findUnique = async (a: unknown) => {
    await new Promise((r) => setImmediate(r));
    return find(a as never);
  };
  return async (username: string, credential: string) => {
    const ctrl = new AuthController(fakeAuth(), db, limiter);
    try {
      await ctrl.login({ username, credential }, loginReq, {} as Response);
      return 200;
    } catch (e) {
      return (e as HttpException).getStatus();
    }
  };
};
const tally = (codes: number[]) => {
  const t: Record<number, number> = {};
  for (const c of codes) t[c] = (t[c] ?? 0) + 1;
  return t;
};

test('login: 30 concurrent wrong guesses for one username verify exactly 10, the rest get 429', async () => {
  const user = {
    id: 'u1',
    role: 'student',
    passwordHash: scrypt('correct-horse-16ch'),
    disabledAt: null,
  };
  const login = slowLogin(user, new LoginLimiter());
  const codes = await Promise.all(Array.from({ length: 30 }, () => login('carol', 'wrong')));
  assert.deepEqual(tally(codes), { 401: 10, 429: 20 });
});

test('login: concurrent and sequential correct logins never consume the budget', async () => {
  const user = {
    id: 'u1',
    role: 'student',
    passwordHash: scrypt('correct-horse-16ch'),
    disabledAt: null,
  };
  const limiter = new LoginLimiter();
  const login = slowLogin(user, limiter);
  assert.deepEqual(
    tally(
      await Promise.all(
        Array.from({ length: 20 }, (_, i) => login(`alice${i}`, 'correct-horse-16ch')),
      ),
    ),
    { 200: 20 },
  );
  for (let i = 0; i < 25; i++) assert.equal(await login('alice', 'correct-horse-16ch'), 200);
  // IP bucket is back to 0: a full 20 reservations still fit.
  for (let i = 0; i < 20; i++) assert.equal(status(() => limiter.check(loginReq.ip!)).status, 200);
});

test('login: 11th failure blocks even a right password; others unaffected; invite path is IP-only', async () => {
  const user = {
    id: 'u1',
    role: 'student',
    passwordHash: scrypt('correct-horse-16ch'),
    disabledAt: null,
  };
  const limiter = new LoginLimiter();
  const login = slowLogin(user, limiter);
  for (let i = 0; i < 10; i++) assert.equal(await login('carol', 'wrong'), 401);
  assert.equal(await login('carol', 'correct-horse-16ch'), 429);
  assert.equal(await login('dave', 'correct-horse-16ch'), 200);
  const invite = new LoginLimiter();
  const ctrl = new AuthController(fakeAuth(), accountDb(null).db, invite);
  const tryInvite = () =>
    ctrl.login({ username: '', credential: 'bad' }, loginReq, {} as Response).then(
      () => 200,
      (e: HttpException) => e.getStatus(),
    );
  const codes: number[] = [];
  for (let i = 0; i < 21; i++) codes.push(await tryInvite());
  assert.deepEqual(tally(codes), { 401: 20, 429: 1 });
});

const fakeDb = (session: object | null, user: object | null) =>
  ({
    authSession: { findUnique: async () => session },
    user: { findUnique: async () => user },
  }) as unknown as Db;
const guardCtx = (handler: (...args: never[]) => unknown, cls: object) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ cookies: { seafoodeck_session: 'tok' } }) }),
    getHandler: () => handler,
    getClass: () => cls,
  }) as unknown as ExecutionContext;
const live = { id: 'sid', userId: 'u1', role: 'student', expiresAt: new Date(Date.now() + 60000) };

test('MustChangePasswordGuard blocks other routes until the password is changed', async () => {
  const guard = new MustChangePasswordGuard(
    fakeDb(live, { mustChangePassword: true }),
    new Reflector(),
  );
  await assert.rejects(
    guard.canActivate(guardCtx(CatalogController.prototype.overview, CatalogController)),
    (error: HttpException) =>
      error.getStatus() === 403 &&
      (error.getResponse() as { code: string }).code === 'MUST_CHANGE_PASSWORD' &&
      (error.getResponse() as { message: string }).message === 'Cần đổi mật khẩu trước.',
  );
  await assert.rejects(guard.canActivate(guardCtx(MeController.prototype.update, MeController)));
  for (const [handler, cls] of [
    [MeController.prototype.password, MeController],
    [MeController.prototype.get, MeController],
    [AuthController.prototype.me, AuthController],
    [AuthController.prototype.logout, AuthController],
  ] as const)
    assert.equal(await guard.canActivate(guardCtx(handler, cls)), true);
});

test('MustChangePasswordGuard ignores learners, guests and cleared flags', async () => {
  const handler = CatalogController.prototype.overview;
  const learner = new MustChangePasswordGuard(
    fakeDb({ ...live, userId: null, role: 'learner' }, null),
    new Reflector(),
  );
  assert.equal(await learner.canActivate(guardCtx(handler, CatalogController)), true);
  const anonymous = new MustChangePasswordGuard(fakeDb(null, null), new Reflector());
  assert.equal(await anonymous.canActivate(guardCtx(handler, CatalogController)), true);
  const cleared = new MustChangePasswordGuard(
    fakeDb(live, { mustChangePassword: false }),
    new Reflector(),
  );
  assert.equal(await cleared.canActivate(guardCtx(handler, CatalogController)), true);
});

const userErrors = async (body: object) =>
  (await validate(plainToInstance(UserDto, body), { whitelist: true, forbidNonWhitelisted: true }))
    .length;

test('POST /admin/users password length depends on role', async () => {
  const base = { username: 'student_01' };
  assert.notEqual(await userErrors({ ...base, role: 'student', password: '1234567' }), 0);
  assert.equal(await userErrors({ ...base, role: 'student', password: '12345678' }), 0);
  assert.equal(
    await userErrors({
      ...base,
      role: 'student',
      password: '12345678',
      mustChangePassword: true,
      displayName: 'Lan',
    }),
    0,
  );
  for (const role of ['manager', 'editor', 'reviewer', 'publisher']) {
    assert.notEqual(await userErrors({ ...base, role, password: 'x'.repeat(15) }), 0);
    assert.equal(await userErrors({ ...base, role, password: 'x'.repeat(16) }), 0);
  }
  assert.notEqual(await userErrors({ ...base, role: 'admin', password: 'x'.repeat(20) }), 0);
  assert.equal(passwordMinFor('student'), 8);
  assert.equal(passwordMinFor('manager'), 16);
});

const scrypt = (s: string) => passwordHash(s);
type Call = { op: string; args: Record<string, unknown> };
const accountDb = (user: Record<string, unknown> | null) => {
  const calls: Call[] = [];
  const rec =
    (op: string, result: unknown = {}) =>
    async (args: Record<string, unknown>) => {
      calls.push({ op, args });
      return typeof result === 'function' ? (result as () => unknown)() : result;
    };
  const db = {
    user: { findUnique: rec('user.findUnique', () => user), update: rec('user.update') },
    authSession: { deleteMany: rec('authSession.deleteMany'), delete: rec('authSession.delete') },
    audit: { create: rec('audit.create') },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  return { db: db as unknown as Db, calls };
};
const accountReq = (userId = 'u1') =>
  ({
    actor: { id: 'current-sid', role: 'student', userId },
    ip: '10.0.0.1',
  }) as unknown as ActorRequest;
const httpStatus = async (p: Promise<unknown>) =>
  p.then(
    () => 200,
    (e: HttpException) => e.getStatus(),
  );

test('POST /me/password verifies current, enforces role minimum and rejects unchanged', async () => {
  const student = {
    id: 'u1',
    role: 'student',
    passwordHash: scrypt('temp-pass'),
    disabledAt: null,
  };
  const me = () => new MeController(accountDb(student).db, new LoginLimiter());
  assert.equal(
    await httpStatus(me().password(accountReq(), { current: 'wrong-pass', next: 'brand-new1' })),
    400,
  );
  assert.equal(
    await httpStatus(me().password(accountReq(), { current: 'temp-pass', next: 'temp-pass' })),
    400,
  );
  assert.equal(
    await httpStatus(me().password(accountReq(), { current: 'temp-pass', next: 'short12' })),
    400,
  );
  assert.equal(
    await httpStatus(me().password(accountReq(), { current: 'temp-pass', next: 'eightch8' })),
    200,
  );
  const manager = { ...student, role: 'manager' };
  const asManager = () => new MeController(accountDb(manager).db, new LoginLimiter());
  assert.equal(
    await httpStatus(
      asManager().password(accountReq(), { current: 'temp-pass', next: 'x'.repeat(15) }),
    ),
    400,
  );
  assert.equal(
    await httpStatus(
      asManager().password(accountReq(), { current: 'temp-pass', next: 'x'.repeat(16) }),
    ),
    200,
  );
});

test('POST /me/password clears the flag, keeps this session, revokes others, audits no secret', async () => {
  const user = {
    id: 'u1',
    role: 'student',
    passwordHash: scrypt('temp-pass'),
    disabledAt: null,
    mustChangePassword: true,
  };
  const { db, calls } = accountDb(user);
  await new MeController(db, new LoginLimiter()).password(accountReq(), {
    current: 'temp-pass',
    next: 'my-new-secret',
  });
  const update = calls.find((c) => c.op === 'user.update')!.args as {
    where: { id: string };
    data: { passwordHash: string; mustChangePassword: boolean };
  };
  assert.equal(update.where.id, 'u1');
  assert.equal(update.data.mustChangePassword, false);
  assert.ok(passwordMatches('my-new-secret', update.data.passwordHash));
  assert.deepEqual(calls.find((c) => c.op === 'authSession.deleteMany')!.args, {
    where: { userId: 'u1', id: { not: 'current-sid' } },
  });
  const audit = JSON.stringify(calls.find((c) => c.op === 'audit.create')!.args);
  assert.match(audit, /user\.password_change/);
  for (const secret of ['temp-pass', 'my-new-secret', update.data.passwordHash])
    assert.equal(audit.includes(secret), false);
});

test('POST /me/password blocks the 11th current-password check per user', async () => {
  const user = { id: 'u1', role: 'student', passwordHash: scrypt('temp-pass'), disabledAt: null };
  const me = new MeController(accountDb(user).db, new LoginLimiter());
  for (let i = 0; i < 10; i++)
    assert.equal(
      await httpStatus(me.password(accountReq(), { current: `wrong${i}`, next: 'brand-new1' })),
      400,
    );
  assert.equal(
    await httpStatus(me.password(accountReq(), { current: 'temp-pass', next: 'brand-new1' })),
    429,
  );
  const other = new MeController(
    accountDb({ ...user, id: 'u2' }).db,
    (me as unknown as { limiter: LoginLimiter }).limiter,
  );
  assert.equal(
    await httpStatus(
      other.password(accountReq('u2'), { current: 'temp-pass', next: 'brand-new1' }),
    ),
    200,
  );
});

const fakeAuth = () =>
  ({
    actor: async () => ({ id: 'before-sid' }),
    checkWrite: () => undefined,
    create: async (_res: unknown, role: string) => ({ id: 'after-sid', role }),
    view: (row: { role: string }) => ({ role: row.role }),
  }) as unknown as Auth;
const loginReq = { ip: '10.0.0.7', headers: {}, cookies: {} } as unknown as Request;

test('login: disabled account gets the wrong-password 401; lastLoginAt only on success', async () => {
  const saved = scrypt('correct-horse-16ch');
  const attempt = async (user: Record<string, unknown> | null, credential: string) => {
    const { db, calls } = accountDb(user);
    const ctrl = new AuthController(fakeAuth(), db, new LoginLimiter());
    try {
      await ctrl.login({ username: 'alice', credential }, loginReq, {} as Response);
      return { status: 200, body: null, calls };
    } catch (e) {
      return {
        status: (e as HttpException).getStatus(),
        body: (e as HttpException).getResponse(),
        calls,
      };
    }
  };
  const wrong = await attempt(
    { id: 'u1', role: 'student', passwordHash: saved, disabledAt: null },
    'nope',
  );
  const disabled = await attempt(
    { id: 'u1', role: 'student', passwordHash: saved, disabledAt: new Date() },
    'correct-horse-16ch',
  );
  const unknown = await attempt(null, 'correct-horse-16ch');
  for (const r of [wrong, disabled, unknown]) {
    assert.equal(r.status, 401);
    assert.deepEqual(r.body, wrong.body);
    assert.equal(
      r.calls.some((c) => c.op === 'user.update'),
      false,
    );
  }
  const ok = await attempt(
    { id: 'u1', role: 'student', passwordHash: saved, disabledAt: null },
    'correct-horse-16ch',
  );
  assert.equal(ok.status, 200);
  const update = ok.calls.find((c) => c.op === 'user.update')!.args as {
    where: { id: string };
    data: { lastLoginAt: Date };
  };
  assert.equal(update.where.id, 'u1');
  assert.ok(update.data.lastLoginAt instanceof Date);
});

test('/me home, review, progress and mastery admit only account students', async () => {
  const called: string[] = [];
  const svc = Object.fromEntries(
    ['home', 'review', 'progress', 'mastery'].map((m) => [
      m,
      async (actor: { userId: string }) => (called.push(`${m}:${actor.userId}`), { ok: m }),
    ]),
  ) as unknown as ProgressService;
  const ctrl = new MeProgressController(svc);
  const routes = ['home', 'review', 'progress', 'mastery'] as const;
  const outcome = async (r: ActorRequest, route: (typeof routes)[number]) =>
    ctrl[route](r).then(
      () => ({ status: 200, message: '' }),
      (e: HttpException) => ({
        status: e.getStatus(),
        message: (e.getResponse() as { message: string }).message,
      }),
    );
  for (const route of routes) {
    assert.deepEqual(await outcome(req('learner'), route), {
      status: 403,
      message: 'Đăng nhập tài khoản để xem tiến độ.',
    });
    assert.equal((await outcome(req('guest'), route)).status, 403);
    assert.equal((await outcome(req('manager', 'm1'), route)).status, 403);
    assert.equal((await outcome(req('student', null), route)).status, 403);
  }
  assert.deepEqual(called, []);
  for (const route of routes)
    assert.equal((await outcome(req('student', 'u7'), route)).status, 200);
  assert.deepEqual(called, ['home:u7', 'review:u7', 'progress:u7', 'mastery:u7']);
});
