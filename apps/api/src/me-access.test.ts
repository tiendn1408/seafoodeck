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
  type ActorRequest,
} from './security';
import { MeController } from './me.controller';
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

test('LoginLimiter blocks the 11th attempt for one username across IPs', () => {
  const limiter = new LoginLimiter();
  for (let i = 0; i < 10; i++) limiter.check(`10.0.0.${i}`, 'Alice');
  const r = status(() => limiter.check('10.0.1.1', 'alice'));
  assert.equal(r.status, 429);
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
