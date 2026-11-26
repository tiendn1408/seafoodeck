import 'reflect-metadata';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  Auth,
  LoginLimiter,
  passwordHash,
  realmOf,
  originRealm,
  normalizeOrigin,
  studioOriginProblem,
} from './security';
import { createApp } from './main';
import { AuthController } from './auth.controller';
import type { Db } from './db';

const LEARNER = 'https://learn.example.test';
const STUDIO = 'https://studio.example.test';
const PASSWORD = 'correct-horse-16ch';
const saved = { ...process.env };
const split = () => {
  process.env.PUBLIC_ORIGIN = LEARNER;
  process.env.STUDIO_ORIGIN = STUDIO;
  process.env.LEARNER_INVITE_CODE = 'invite-code-1';
};
beforeEach(split);
afterEach(() => {
  for (const key of ['PUBLIC_ORIGIN', 'STUDIO_ORIGIN', 'LEARNER_INVITE_CODE'])
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
});

const ROLES = ['student', 'editor', 'reviewer', 'publisher', 'manager', 'admin'];
const hashed = passwordHash(PASSWORD);
const dbFor = (role: string) => {
  const user = { id: 'u1', role, username: 'alice', passwordHash: hashed, disabledAt: null };
  return {
    user: {
      findFirst: async () => user,
      findUnique: async () => ({ displayName: 'A', mustChangePassword: false }),
      update: async () => ({}),
    },
    authSession: { delete: async () => ({}) },
  } as unknown as Db;
};
const csrf = 'csrf-token';
const auth = new Auth({} as Db);
const realAuth = {
  actor: async () => ({ id: 'before', csrf }),
  checkWrite: (req: Request, actor: never, opts?: { skipOrigin?: boolean }) =>
    auth.checkWrite(req, actor, opts),
  create: async (_res: unknown, role: string, _i: boolean, userId?: string) => ({
    id: 'after',
    role,
    userId,
  }),
  view: (row: { role: string }) => ({ role: row.role }),
} as unknown as Auth;
const reqWith = (origin?: string) =>
  ({
    ip: '10.9.9.9',
    cookies: {},
    headers: { 'x-csrf-token': csrf, ...(origin ? { origin } : {}) },
  }) as unknown as Request;
type Outcome = { status: number; body: unknown };
const attempt = async (
  role: string,
  origin: string | undefined,
  credential = PASSWORD,
  limiter = new LoginLimiter(),
): Promise<Outcome> => {
  const ctrl = new AuthController(realAuth, dbFor(role), limiter);
  try {
    await ctrl.login({ username: 'alice', credential }, reqWith(origin), {} as Response);
    return { status: 201, body: null };
  } catch (e) {
    if (!(e as HttpException).getStatus) throw e;
    const h = e as HttpException;
    return { status: h.getStatus(), body: h.getResponse() };
  }
};
const invite = async (origin: string | undefined, limiter = new LoginLimiter()) => {
  const ctrl = new AuthController(realAuth, dbFor('student'), limiter);
  try {
    await ctrl.login(
      { username: '', credential: process.env.LEARNER_INVITE_CODE! },
      reqWith(origin),
      {} as Response,
    );
    return { status: 201, body: null } as Outcome;
  } catch (e) {
    if (!(e as HttpException).getStatus) throw e;
    const h = e as HttpException;
    return { status: h.getStatus(), body: h.getResponse() } as Outcome;
  }
};

test('realmOf and originRealm', () => {
  assert.equal(realmOf('learner'), 'learner');
  assert.equal(realmOf('student'), 'learner');
  for (const r of ['editor', 'reviewer', 'publisher', 'manager', 'admin'])
    assert.equal(realmOf(r), 'studio');
  assert.equal(originRealm(LEARNER), 'learner');
  assert.equal(originRealm(STUDIO), 'studio');
  assert.equal(originRealm('https://evil.test'), 'unknown');
  assert.equal(originRealm(undefined), 'none');
  delete process.env.STUDIO_ORIGIN;
  assert.equal(originRealm(STUDIO), 'unknown');
});

test('login role x origin matrix: only the matching realm succeeds', async () => {
  for (const role of ROLES) {
    const home = realmOf(role) === 'learner' ? LEARNER : STUDIO;
    const away = home === LEARNER ? STUDIO : LEARNER;
    assert.equal((await attempt(role, home)).status, 201, `${role} on its own origin`);
    assert.equal((await attempt(role, away)).status, 401, `${role} on the other origin`);
  }
});

test('wrong-realm login is identical to a wrong password and costs the limiter the same', async () => {
  const wrongPassword = await attempt('student', LEARNER, 'nope-nope-nope');
  assert.equal(wrongPassword.status, 401);
  for (const [role, origin] of [
    ['student', STUDIO],
    ['admin', LEARNER],
    ['editor', 'https://evil.test'],
  ] as const) {
    assert.deepEqual(await attempt(role, origin), wrongPassword);
    assert.deepEqual(await attempt(role, origin, 'nope-nope-nope'), wrongPassword);
  }
  // Ten refused logins with the right password exhaust the per-name budget exactly like wrong passwords.
  const limiter = new LoginLimiter();
  for (let i = 0; i < 10; i++)
    assert.equal((await attempt('admin', LEARNER, PASSWORD, limiter)).status, 401);
  assert.equal((await attempt('admin', STUDIO, PASSWORD, limiter)).status, 429);
});

test('invite-code login: learner origin ok, studio and unknown origin get the generic invalid-code response', async () => {
  assert.equal((await invite(LEARNER)).status, 201);
  const bad = await (async () => {
    process.env.LEARNER_INVITE_CODE = 'other';
    const ctrl = new AuthController(realAuth, dbFor('student'), new LoginLimiter());
    return ctrl
      .login({ username: '', credential: 'wrong' }, reqWith(LEARNER), {} as Response)
      .catch((e: HttpException) => ({ status: e.getStatus(), body: e.getResponse() }));
  })();
  process.env.LEARNER_INVITE_CODE = 'invite-code-1';
  for (const origin of [STUDIO, 'https://evil.test']) assert.deepEqual(await invite(origin), bad);
  const limiter = new LoginLimiter();
  for (let i = 0; i < 20; i++) await invite(STUDIO, limiter);
  assert.equal((await invite(STUDIO, limiter)).status, 429);
});

test('absent Origin is accepted on login and on writes', async () => {
  assert.equal((await attempt('student', undefined)).status, 201);
  assert.equal((await attempt('admin', undefined)).status, 201);
  assert.equal((await invite(undefined)).status, 201);
  assert.doesNotThrow(() => auth.checkWrite(reqWith(undefined), { csrf } as never));
});

test('writes accept PUBLIC_ORIGIN and STUDIO_ORIGIN, refuse a third party, still need CSRF', () => {
  for (const origin of [LEARNER, STUDIO])
    assert.doesNotThrow(() => auth.checkWrite(reqWith(origin), { csrf } as never));
  assert.throws(() => auth.checkWrite(reqWith('https://evil.test'), { csrf } as never), /Origin/);
  const noCsrf = { headers: { origin: STUDIO } } as unknown as Request;
  assert.throws(() => auth.checkWrite(noCsrf, { csrf } as never), /CSRF/);
});

test('STUDIO_ORIGIN unset: exactly the old behaviour', async () => {
  delete process.env.STUDIO_ORIGIN;
  for (const role of ROLES) assert.equal((await attempt(role, LEARNER)).status, 201);
  // A foreign Origin is still refused by the write check (403), as before.
  assert.equal((await attempt('student', 'https://evil.test')).status, 403);
  assert.equal((await attempt('student', STUDIO)).status, 403);
  assert.throws(() => auth.checkWrite(reqWith(STUDIO), { csrf } as never), /Origin/);
});

test('operator origins with trailing slash, capitals or default port still match the browser Origin', async () => {
  process.env.PUBLIC_ORIGIN = 'HTTPS://Learn.Example.test:443/';
  process.env.STUDIO_ORIGIN = 'https://STUDIO.example.test:443/';
  assert.equal(normalizeOrigin(process.env.STUDIO_ORIGIN), STUDIO);
  assert.equal(originRealm(LEARNER), 'learner');
  assert.equal(originRealm(STUDIO), 'studio');
  assert.equal(originRealm('https://evil.test'), 'unknown');
  for (const origin of [LEARNER, STUDIO])
    assert.doesNotThrow(() => auth.checkWrite(reqWith(origin), { csrf } as never));
  assert.throws(() => auth.checkWrite(reqWith('https://evil.test'), { csrf } as never), /Origin/);
  assert.equal((await attempt('admin', STUDIO)).status, 201);
  assert.equal((await attempt('student', LEARNER)).status, 201);
  assert.equal((await attempt('admin', LEARNER)).status, 401);
  process.env.STUDIO_ORIGIN = 'http://localhost:80/';
  assert.equal(originRealm('http://localhost'), 'studio');
});

test('startup validation of STUDIO_ORIGIN', () => {
  const env = (studio: string | undefined, pub = LEARNER) =>
    ({ PUBLIC_ORIGIN: pub, STUDIO_ORIGIN: studio }) as NodeJS.ProcessEnv;
  assert.equal(studioOriginProblem(env(undefined)), undefined);
  assert.equal(studioOriginProblem(env(STUDIO)), undefined);
  assert.equal(studioOriginProblem(env(`${STUDIO.toUpperCase()}:443/`)), undefined);
  for (const bad of [
    'studio.example.test',
    'ftp://studio.example.test',
    'https://studio.example.test/app',
    'https://studio.example.test/?x=1',
    'https://user:pw@studio.example.test',
  ])
    assert.match(studioOriginProblem(env(bad)) ?? '', /STUDIO_ORIGIN/, bad);
  assert.match(studioOriginProblem(env(LEARNER)) ?? '', /differ/);
  assert.match(studioOriginProblem(env('HTTPS://LEARN.example.test:443/')) ?? '', /differ/);
});

test('createApp refuses to start on an invalid STUDIO_ORIGIN', async () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    await assert.rejects(
      createApp({ ...process.env, STUDIO_ORIGIN: `${LEARNER}/x` }),
      /bare http\(s\) origin/,
    );
  } finally {
    console.error = quiet;
  }
});
