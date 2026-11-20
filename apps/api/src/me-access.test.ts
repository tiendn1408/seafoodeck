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
  AccessGuard,
  Auth,
  passwordMinFor,
  passwordHash,
  passwordMatches,
  type ActorRequest,
} from './security';
import type { Request, Response } from 'express';
import { MeController, MeProgressController } from './me.controller';
import type { ProgressService } from './progress.service';
import { AuthController } from './auth.controller';
import { UserDto, AdminExtraController } from './admin-extra.controller';
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
  const find = db.user.findFirst;
  (db.user as { findFirst: unknown }).findFirst = async (a: unknown) => {
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
      return typeof result === 'function' ? (result as (a: unknown) => unknown)(args) : result;
    };
  const db = {
    user: {
      findUnique: rec('user.findUnique', () => user),
      // Mimics a case-insensitive `equals` match when the fake row has a username.
      findFirst: rec('user.findFirst', (args?: unknown) => {
        const want = (args as { where?: { username?: { equals?: string } } } | undefined)?.where
          ?.username?.equals;
        const have = user?.username;
        if (typeof want === 'string' && typeof have === 'string')
          return want.toLowerCase() === have.toLowerCase() ? user : null;
        return user;
      }),
      update: rec('user.update'),
      create: rec('user.create', (args?: unknown) => {
        if (user?.createError) throw user.createError;
        return { id: 'new-id', ...(args as { data: object }).data };
      }),
    },
    authSession: {
      deleteMany: rec('authSession.deleteMany'),
      delete: rec('authSession.delete'),
      create: rec('authSession.create', (args?: unknown) => (args as { data: object }).data),
    },
    audit: { create: rec('audit.create') },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  return { db: db as unknown as Db, calls };
};
const meCtrl = (db: Db, limiter: LoginLimiter) => new MeController(db, limiter, new Auth(db));
const noCookies = { cookie: () => undefined } as unknown as Response;
const accountReq = (userId = 'u1') =>
  ({
    actor: { id: 'current-sid', role: 'student', internal: false, userId },
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
  const me = () => meCtrl(accountDb(student).db, new LoginLimiter());
  assert.equal(
    await httpStatus(
      me().password(accountReq(), { current: 'wrong-pass', next: 'brand-new1' }, noCookies),
    ),
    400,
  );
  assert.equal(
    await httpStatus(
      me().password(accountReq(), { current: 'temp-pass', next: 'temp-pass' }, noCookies),
    ),
    400,
  );
  assert.equal(
    await httpStatus(
      me().password(accountReq(), { current: 'temp-pass', next: 'short12' }, noCookies),
    ),
    400,
  );
  assert.equal(
    await httpStatus(
      me().password(accountReq(), { current: 'temp-pass', next: 'eightch8' }, noCookies),
    ),
    200,
  );
  const manager = { ...student, role: 'manager' };
  const asManager = () => meCtrl(accountDb(manager).db, new LoginLimiter());
  assert.equal(
    await httpStatus(
      asManager().password(accountReq(), { current: 'temp-pass', next: 'x'.repeat(15) }, noCookies),
    ),
    400,
  );
  assert.equal(
    await httpStatus(
      asManager().password(accountReq(), { current: 'temp-pass', next: 'x'.repeat(16) }, noCookies),
    ),
    200,
  );
});

test('POST /me/password clears the flag, rotates this session, revokes the rest, audits no secret', async () => {
  const user = {
    id: 'u1',
    role: 'student',
    passwordHash: scrypt('temp-pass'),
    disabledAt: null,
    mustChangePassword: true,
  };
  const { db, calls } = accountDb(user);
  const body = await meCtrl(db, new LoginLimiter()).password(
    accountReq(),
    { current: 'temp-pass', next: 'my-new-secret' },
    noCookies,
  );
  const update = calls.find((c) => c.op === 'user.update')!.args as {
    where: { id: string };
    data: { passwordHash: string; mustChangePassword: boolean };
  };
  assert.equal(update.where.id, 'u1');
  assert.equal(update.data.mustChangePassword, false);
  assert.ok(passwordMatches('my-new-secret', update.data.passwordHash));
  const created = calls.find((c) => c.op === 'authSession.create')!.args as {
    data: { id: string; csrf: string };
  };
  assert.notEqual(created.data.id, 'current-sid');
  assert.deepEqual(calls.find((c) => c.op === 'authSession.deleteMany')!.args, {
    where: { userId: 'u1', id: { not: created.data.id } },
  });
  assert.equal((body as { csrf: string }).csrf, created.data.csrf);
  const audit = JSON.stringify(calls.find((c) => c.op === 'audit.create')!.args);
  assert.match(audit, /user\.password_change/);
  for (const secret of ['temp-pass', 'my-new-secret', update.data.passwordHash])
    assert.equal(audit.includes(secret), false);
  assert.equal(audit.includes(created.data.csrf), false);
  assert.equal(JSON.stringify(body).includes(update.data.passwordHash), false);
});

test('POST /me/password blocks the 11th current-password check per user', async () => {
  const user = { id: 'u1', role: 'student', passwordHash: scrypt('temp-pass'), disabledAt: null };
  const me = meCtrl(accountDb(user).db, new LoginLimiter());
  for (let i = 0; i < 10; i++)
    assert.equal(
      await httpStatus(
        me.password(accountReq(), { current: `wrong${i}`, next: 'brand-new1' }, noCookies),
      ),
      400,
    );
  assert.equal(
    await httpStatus(
      me.password(accountReq(), { current: 'temp-pass', next: 'brand-new1' }, noCookies),
    ),
    429,
  );
  const other = meCtrl(
    accountDb({ ...user, id: 'u2' }).db,
    (me as unknown as { limiter: LoginLimiter }).limiter,
  );
  assert.equal(
    await httpStatus(
      other.password(accountReq('u2'), { current: 'temp-pass', next: 'brand-new1' }, noCookies),
    ),
    200,
  );
});

const fakeAuth = () =>
  ({
    actor: async () => ({ id: 'before-sid' }),
    checkWrite: () => undefined,
    create: async (_res: unknown, role: string, _internal: boolean, userId?: string) => ({
      id: 'after-sid',
      role,
      userId,
    }),
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

test('login returns the same profile fields as GET /auth/me; invite login stays profile-free', async () => {
  const saved = scrypt('correct-horse-16ch');
  const user = (mustChangePassword: boolean) => ({
    id: 'u1',
    role: 'student',
    passwordHash: saved,
    disabledAt: null,
    displayName: 'An',
    mustChangePassword,
  });
  // Like Prisma, honour `select` so the response cannot leak the password hash.
  const selecting = (row: Record<string, unknown>) => {
    const { db } = accountDb(row);
    (db.user as { findUnique: unknown }).findUnique = async (a: {
      select?: Record<string, boolean>;
    }) => (a.select ? Object.fromEntries(Object.keys(a.select).map((k) => [k, row[k]])) : row);
    return db;
  };
  for (const must of [false, true]) {
    const ctrl = new AuthController(fakeAuth(), selecting(user(must)), new LoginLimiter());
    const body = await ctrl.login(
      { username: 'alice', credential: 'correct-horse-16ch' },
      loginReq,
      {} as Response,
    );
    assert.deepEqual(body, {
      role: 'student',
      userId: 'u1',
      displayName: 'An',
      mustChangePassword: must,
    });
    const meAuth = {
      ...fakeAuth(),
      actor: async () => ({ id: 'after-sid', role: 'student', userId: 'u1' }),
    };
    const me = await new AuthController(
      meAuth as unknown as Auth,
      selecting(user(must)),
      new LoginLimiter(),
    ).me(loginReq, {} as Response);
    assert.deepEqual(body, { ...me, role: 'student' });
  }
  const prev = process.env.LEARNER_INVITE_CODE;
  process.env.LEARNER_INVITE_CODE = 'invite-xyz';
  try {
    const ctrl = new AuthController(fakeAuth(), accountDb(null).db, new LoginLimiter());
    const body = await ctrl.login(
      { username: '', credential: 'invite-xyz' },
      loginReq,
      {} as Response,
    );
    assert.deepEqual(body, { role: 'learner' });
  } finally {
    if (prev === undefined) delete process.env.LEARNER_INVITE_CODE;
    else process.env.LEARNER_INVITE_CODE = prev;
  }
});

test('login matches the username case-insensitively and keeps stored case', async () => {
  const user = {
    id: 'u1',
    role: 'student',
    username: 'An',
    passwordHash: scrypt('correct-horse-16ch'),
    disabledAt: null,
  };
  const { db, calls } = accountDb(user);
  const ctrl = new AuthController(fakeAuth(), db, new LoginLimiter());
  await ctrl.login({ username: 'aN', credential: 'correct-horse-16ch' }, loginReq, {} as Response);
  assert.deepEqual(calls.find((c) => c.op === 'user.findFirst')!.args, {
    where: { username: { equals: 'aN', mode: 'insensitive' } },
  });
  assert.equal(calls.filter((c) => c.op === 'user.update').length, 1);
});

test('login limiter budget is shared between An and aN', async () => {
  const user = {
    id: 'u1',
    role: 'student',
    username: 'An',
    passwordHash: scrypt('correct-horse-16ch'),
    disabledAt: null,
  };
  const limiter = new LoginLimiter();
  const { db } = accountDb(user);
  const ctrl = new AuthController(fakeAuth(), db, limiter);
  const go = (username: string, credential: string) =>
    httpStatus(ctrl.login({ username, credential }, loginReq, {} as Response));
  for (let i = 0; i < 10; i++) assert.equal(await go(i % 2 ? 'An' : 'aN', 'wrong'), 401);
  assert.equal(await go('AN', 'correct-horse-16ch'), 429);
});

test('POST /admin/users rejects a case-insensitive duplicate with 409 and a Vietnamese message', async () => {
  const dto = { username: 'an', password: '12345678', role: 'student' } as UserDto;
  const adminReq = { actor: { role: 'admin', userId: 'admin1' } } as unknown as ActorRequest;
  const existing = { id: 'u1', username: 'An' };
  const { db, calls } = accountDb(existing);
  await assert.rejects(new AdminExtraController(db).user(adminReq, dto), (e: HttpException) => {
    assert.equal(e.getStatus(), 409);
    assert.equal((e.getResponse() as { message: string }).message, 'Tên đăng nhập đã tồn tại.');
    return true;
  });
  assert.equal(
    calls.some((c) => c.op === 'user.create'),
    false,
  );
  // Unique-index race: the DB raises P2002 after the lookup saw nothing.
  const race = accountDb(null);
  (race.db.user as { create: unknown }).create = async () => {
    throw Object.assign(new Error('unique'), { code: 'P2002' });
  };
  assert.equal(await httpStatus(new AdminExtraController(race.db).user(adminReq, dto)), 409);
  // Stored with the typed case when free.
  const free = accountDb(null);
  const made = await new AdminExtraController(free.db).user(adminReq, { ...dto, username: 'Lan' });
  assert.equal(made.username, 'Lan');
});

// ---- Locked accounts and session rotation (2.5c task 2) --------------------------------------
type Row = Record<string, unknown> & { id: string };
/** In-memory sessions + users, counting user lookups and noting writes made inside a transaction. */
const memoryDb = (users: Row[]) => {
  const sessions = new Map<string, Row>();
  const userRows = new Map(users.map((u) => [u.id, { ...u }]));
  const log = { userFinds: 0, writes: [] as { op: string; inTx: boolean }[] };
  const pick = (row: Row | undefined, select?: Record<string, boolean>) =>
    !row ? null : select ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]])) : row;
  const build = (inTx: boolean) => ({
    authSession: {
      findUnique: async (a: { where: { id: string }; select?: Record<string, boolean> }) =>
        pick(sessions.get(a.where.id), a.select),
      create: async (a: { data: Row }) => {
        log.writes.push({ op: 'authSession.create', inTx });
        sessions.set(a.data.id, { ...a.data, userId: a.data.userId ?? null });
        return sessions.get(a.data.id);
      },
      delete: async (a: { where: { id: string } }) => {
        log.writes.push({ op: 'authSession.delete', inTx });
        sessions.delete(a.where.id);
        return {};
      },
      deleteMany: async (a: { where: { id?: string | { not: string }; userId?: string } }) => {
        log.writes.push({ op: 'authSession.deleteMany', inTx });
        let count = 0;
        for (const [id, s] of sessions) {
          const w = a.where;
          if (w.userId !== undefined && s.userId !== w.userId) continue;
          if (typeof w.id === 'string' && id !== w.id) continue;
          if (typeof w.id === 'object' && id === w.id.not) continue;
          sessions.delete(id);
          count++;
        }
        return { count };
      },
    },
    user: {
      findUnique: async (a: { where: { id: string }; select?: Record<string, boolean> }) => {
        log.userFinds++;
        return pick(userRows.get(a.where.id), a.select);
      },
      update: async (a: { where: { id: string }; data: object }) => {
        log.writes.push({ op: 'user.update', inTx });
        const next = { ...userRows.get(a.where.id)!, ...a.data } as Row;
        userRows.set(a.where.id, next);
        return next;
      },
    },
    audit: {
      create: async (a: object) => {
        log.writes.push({ op: 'audit.create', inTx });
        return a;
      },
    },
  });
  const db = {
    ...build(false),
    $transaction: async (fn: (tx: unknown) => unknown) => fn(build(true)),
  };
  return { db: db as unknown as Db, sessions, userRows, log };
};
/** Minimal express Response that records the session cookie it is given. */
const cookieJar = () => {
  const jar = { token: undefined as string | undefined };
  const res = {
    cookie: (name: string, value: string) => {
      if (name === 'seafoodeck_session') jar.token = value;
    },
  } as unknown as Response;
  return { jar, res };
};
const cookieReq = (token: string | undefined, method = 'GET', csrf?: string) =>
  ({
    method,
    cookies: token ? { seafoodeck_session: token } : {},
    headers: csrf ? { 'x-csrf-token': csrf } : {},
    ip: '10.0.0.9',
  }) as unknown as ActorRequest;
const httpCtx = (r: ActorRequest, handler: (...args: never[]) => unknown, cls: object) =>
  ({
    switchToHttp: () => ({ getRequest: () => r }),
    getHandler: () => handler,
    getClass: () => cls,
  }) as unknown as ExecutionContext;
/** Runs the global guard then AccessGuard on one request, like Nest does for a controller route. */
const throughGuards = async (
  db: Db,
  r: ActorRequest,
  handler: (...args: never[]) => unknown,
  cls: object,
) => {
  const auth = new Auth(db);
  const ctx = httpCtx(r, handler, cls);
  try {
    await new MustChangePasswordGuard(db, new Reflector()).canActivate(ctx);
    await new AccessGuard(auth).canActivate(ctx);
    return { status: 200, message: '' };
  } catch (e) {
    const body = (e as HttpException).getResponse() as { message: string };
    return { status: (e as HttpException).getStatus(), message: body.message };
  }
};
const signIn = async (db: Db, role: string, userId?: string) => {
  const { jar, res } = cookieJar();
  const row = await new Auth(db).create(res, role, false, userId);
  return { token: jar.token!, row };
};
const an = (extra: Record<string, unknown> = {}): Row => ({
  id: 'u1',
  username: 'An',
  role: 'student',
  displayName: 'An',
  passwordHash: scrypt('temp-pass'),
  disabledAt: null,
  mustChangePassword: false,
  ...extra,
});
const expiredMessage = 'Phiên hết hạn. Vui lòng nhập lại mã mời.';

test('locked user: GET /catalog/overview is 401 with the expired-session message and the session row is deleted', async () => {
  const mem = memoryDb([an({ disabledAt: new Date() })]);
  const { token, row } = await signIn(mem.db, 'student', 'u1');
  const r = await throughGuards(
    mem.db,
    cookieReq(token),
    CatalogController.prototype.overview,
    CatalogController,
  );
  assert.deepEqual(r, { status: 401, message: expiredMessage });
  assert.equal(mem.sessions.has(row.id), false);
  // The same lock with the mustChangePassword flag set still answers 401, never the 403 code.
  const flagged = memoryDb([an({ disabledAt: new Date(), mustChangePassword: true })]);
  const second = await signIn(flagged.db, 'student', 'u1');
  assert.deepEqual(
    await throughGuards(
      flagged.db,
      cookieReq(second.token),
      CatalogController.prototype.overview,
      CatalogController,
    ),
    { status: 401, message: expiredMessage },
  );
  assert.equal(flagged.sessions.has(second.row.id), false);
});

test('locked user: routes allowed during a password change and Auth.actor alone also reject', async () => {
  for (const [handler, cls] of [
    [MeController.prototype.get, MeController],
    [MeController.prototype.password, MeController],
  ] as const) {
    const mem = memoryDb([an({ disabledAt: new Date() })]);
    const { token, row } = await signIn(mem.db, 'student', 'u1');
    const method = handler === MeController.prototype.password ? 'POST' : 'GET';
    assert.deepEqual(
      await throughGuards(mem.db, cookieReq(token, method, row.csrf), handler, cls),
      {
        status: 401,
        message: expiredMessage,
      },
    );
    assert.equal(mem.sessions.has(row.id), false);
  }
  // Auth.actor without the guard in front (POST /auth/logout, /auth/login): 401 and deleted.
  const mem = memoryDb([an({ disabledAt: new Date() })]);
  const { token, row } = await signIn(mem.db, 'student', 'u1');
  await assert.rejects(new Auth(mem.db).actor(cookieReq(token)), (e: HttpException) => {
    assert.equal(e.getStatus(), 401);
    assert.equal((e.getResponse() as { message: string }).message, expiredMessage);
    return true;
  });
  assert.equal(mem.sessions.has(row.id), false);
  // GET /auth/me (actor with res) treats the locked session exactly like an expired one: a fresh
  // guest session, not the account.
  const boot = memoryDb([an({ disabledAt: new Date() })]);
  const locked = await signIn(boot.db, 'student', 'u1');
  const { jar, res } = cookieJar();
  const guest = await new Auth(boot.db).actor(cookieReq(locked.token), res);
  assert.equal(guest.role, 'guest');
  assert.equal(guest.userId ?? null, null);
  assert.notEqual(jar.token, locked.token);
  assert.equal(boot.sessions.has(locked.row.id), false);
  // A session whose user row no longer exists is rejected the same way.
  const gone = memoryDb([]);
  const orphan = await signIn(gone.db, 'student', 'ghost');
  await assert.rejects(new Auth(gone.db).actor(cookieReq(orphan.token)), (e: HttpException) => {
    assert.equal(e.getStatus(), 401);
    return true;
  });
  assert.equal(gone.sessions.has(orphan.row.id), false);
});

test('MustChangePasswordGuard and Auth.actor share one user lookup per request, never across requests', async () => {
  const mem = memoryDb([an()]);
  const { token } = await signIn(mem.db, 'student', 'u1');
  const first = await throughGuards(
    mem.db,
    cookieReq(token),
    CatalogController.prototype.overview,
    CatalogController,
  );
  assert.equal(first.status, 200);
  assert.equal(mem.log.userFinds, 1);
  const second = await throughGuards(
    mem.db,
    cookieReq(token),
    CatalogController.prototype.overview,
    CatalogController,
  );
  assert.equal(second.status, 200);
  assert.equal(mem.log.userFinds, 2, 'a new request looks the user up again');
  // Allowed route: the guard skips, Auth.actor does its own single lookup.
  await throughGuards(mem.db, cookieReq(token), MeController.prototype.get, MeController);
  assert.equal(mem.log.userFinds, 3);
  // A lock applied between two requests takes effect on the next one.
  mem.userRows.set('u1', { ...mem.userRows.get('u1')!, disabledAt: new Date() });
  assert.equal(
    (
      await throughGuards(
        mem.db,
        cookieReq(token),
        CatalogController.prototype.overview,
        CatalogController,
      )
    ).status,
    401,
  );
});

test('invite learner and guest sessions trigger no user lookup', async () => {
  for (const role of ['learner', 'guest']) {
    const mem = memoryDb([an()]);
    const { token } = await signIn(mem.db, role);
    const r = await throughGuards(
      mem.db,
      cookieReq(token),
      CatalogController.prototype.overview,
      CatalogController,
    );
    assert.equal(r.status, role === 'learner' ? 200 : 401);
    await new Auth(mem.db).actor(cookieReq(token));
    assert.equal(mem.log.userFinds, 0, role);
  }
});

test('POST /me/password rotates token and CSRF, kills the old cookie and every other session, in one transaction', async () => {
  const mem = memoryDb([an({ mustChangePassword: true }), { ...an(), id: 'u2', username: 'Binh' }]);
  const current = await signIn(mem.db, 'student', 'u1');
  const otherDevice = await signIn(mem.db, 'student', 'u1');
  const someoneElse = await signIn(mem.db, 'student', 'u2');
  const auth = new Auth(mem.db);
  const r = cookieReq(current.token, 'POST', current.row.csrf);
  r.actor = await auth.actor(r);
  mem.log.writes.length = 0;
  const { jar, res } = cookieJar();
  const body = (await new MeController(mem.db, new LoginLimiter(), auth).password(
    r,
    { current: 'temp-pass', next: 'my-new-secret' },
    res,
  )) as Record<string, unknown>;
  assert.ok(jar.token, 'a new cookie is set');
  assert.notEqual(jar.token, current.token);
  assert.notEqual(body.csrf, current.row.csrf);
  assert.equal(body.role, 'student');
  assert.equal(body.internal, false);
  assert.equal(body.userId, 'u1');
  assert.equal(body.displayName, 'An');
  assert.equal(body.mustChangePassword, false);
  assert.equal(body.changed, true);
  assert.equal(typeof body.expiresAt, 'string');
  assert.equal('passwordHash' in body, false);
  // New session is live and carries the returned CSRF; old and other sessions are gone.
  const fresh = await auth.actor(cookieReq(jar.token));
  assert.equal(fresh.csrf, body.csrf);
  assert.equal(fresh.userId, 'u1');
  assert.equal(fresh.role, 'student');
  await assert.rejects(auth.actor(cookieReq(current.token)), (e: HttpException) => {
    assert.equal(e.getStatus(), 401);
    return true;
  });
  assert.equal(mem.sessions.has(current.row.id), false);
  assert.equal(mem.sessions.has(otherDevice.row.id), false);
  assert.equal(mem.sessions.has(someoneElse.row.id), true);
  assert.equal(mem.sessions.size, 2);
  // Every write sits inside the transaction.
  const ops = mem.log.writes.map((w) => w.op);
  for (const op of ['user.update', 'authSession.create', 'authSession.deleteMany', 'audit.create'])
    assert.ok(ops.includes(op), op);
  assert.deepEqual(
    mem.log.writes.filter((w) => !w.inTx),
    [],
  );
  assert.equal(mem.userRows.get('u1')!.mustChangePassword, false);
  assert.ok(passwordMatches('my-new-secret', mem.userRows.get('u1')!.passwordHash as string));
});

test('POST /me/password failure keeps the current session and sets no cookie', async () => {
  const mem = memoryDb([an()]);
  const current = await signIn(mem.db, 'student', 'u1');
  const auth = new Auth(mem.db);
  const r = cookieReq(current.token, 'POST', current.row.csrf);
  r.actor = await auth.actor(r);
  const { jar, res } = cookieJar();
  assert.equal(
    await httpStatus(
      new MeController(mem.db, new LoginLimiter(), auth).password(
        r,
        { current: 'wrong-pass', next: 'my-new-secret' },
        res,
      ),
    ),
    400,
  );
  assert.equal(jar.token, undefined);
  assert.equal(mem.sessions.has(current.row.id), true);
});
