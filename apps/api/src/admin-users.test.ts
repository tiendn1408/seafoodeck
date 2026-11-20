import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpException, ValidationPipe, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import {
  AccessGuard,
  AdminOnlyGuard,
  Auth,
  LoginLimiter,
  MustChangePasswordGuard,
  passwordHash,
  passwordMatches,
  SESSION_EXPIRED,
  type ActorRequest,
} from './security';
import { AuthController } from './auth.controller';
import {
  AdminUsersController,
  BulkCreateUsersDto,
  DeleteUserDto,
  ListUsersQuery,
  UpdateUserDto,
} from './admin-users.controller';
import { UsersService } from './users.service';
import { errorBody, errorStatus } from './main';
import type { Db } from './db';

// ---- In-memory database with snapshot transactions -------------------------------------------
type U = {
  id: string;
  username: string;
  passwordHash: string;
  role: string;
  displayName: string | null;
  disabledAt: Date | null;
  mustChangePassword: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
};
type Row = Record<string, unknown>;
type State = {
  users: Map<string, U>;
  sessions: Map<string, Row>;
  attempts: Row[];
  reviews: Row[];
  audits: Row[];
};
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const conflict = () => Object.assign(new Error('could not serialize access'), { code: 'P2034' });
const notFound = () => Object.assign(new Error('not found'), { code: 'P2025' });

/** Prisma-like `where` matching for the operators the service uses; unknown operators throw. */
function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'OR') {
      if (!(cond as Row[]).some((w) => matches(row, w))) return false;
      continue;
    }
    if (key === 'AND') {
      if (!(cond as Row[]).every((w) => matches(row, w))) return false;
      continue;
    }
    const v = row[key];
    if (cond === null) {
      if (v !== null && v !== undefined) return false;
      continue;
    }
    if (typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Row;
      for (const op of Object.keys(c))
        if (!['not', 'contains', 'equals', 'mode', 'in'].includes(op))
          throw new Error(`unsupported operator ${op}`);
      const ci = c.mode === 'insensitive';
      const norm = (s: unknown) => (ci && typeof s === 'string' ? s.toLowerCase() : s);
      if ('not' in c && (c.not === null ? v == null : v === c.not)) return false;
      if ('contains' in c && (typeof v !== 'string' || !like(v, String(c.contains), ci)))
        return false;
      if ('equals' in c && norm(v) !== norm(c.equals)) return false;
      if ('in' in c && !(c.in as unknown[]).includes(v)) return false;
      continue;
    }
    if (v !== cond) return false;
  }
  return true;
}
/**
 * What Prisma 7 sends to Postgres for `contains` (checked against the compiled query):
 * `col ILIKE ('%' || $1 || '%')` with $1 unescaped, so `%` and `_` in $1 are wildcards and `\`
 * escapes the next character. This mirrors those semantics.
 */
function like(value: string, contained: string, insensitive: boolean): boolean {
  let source = '';
  for (let i = 0; i < contained.length; i++) {
    const ch = contained[i];
    if (ch === '\\') source += (contained[++i] ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else if (ch === '%') source += '.*';
    else if (ch === '_') source += '.';
    else source += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^.*${source}.*$`, insensitive ? 'is' : 's').test(value);
}
const pick = (row: Row | undefined, select?: Record<string, boolean>) =>
  !row
    ? null
    : select
      ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]]))
      : { ...row };

type Mem = ReturnType<typeof memoryDb>;
const memoryDb = (users: U[]) => {
  const mem = {
    state: {
      users: new Map(users.map((u) => [u.id, { ...u }])),
      sessions: new Map(),
      attempts: [],
      reviews: [],
      audits: [],
    } as State,
    version: 0,
    conflicts: 0,
    /** Name of an operation to fail with an error (inside or outside a transaction). */
    failOn: undefined as string | undefined,
    /** Every Serializable commit fails, to exercise the exhausted-retry path. */
    alwaysConflict: false,
    txOptions: [] as unknown[],
    writes: [] as { op: string; inTx: boolean }[],
    /** Lowercased username whose create loses a race: the unique index fires (P2002). */
    raceOn: undefined as string | undefined,
    /** Lowercased username whose create fails with an unexpected error. */
    breakOn: undefined as string | undefined,
    created: 0,
    /** The last `where` given to user.findMany. */
    lastFindManyWhere: undefined as Row | undefined,
  };
  const build = (get: () => State, inTx: boolean) => {
    const write = async (op: string) => {
      await tick();
      if (mem.failOn === op) throw new Error(`injected failure in ${op}`);
      mem.writes.push({ op, inTx });
      if (!inTx) mem.version++;
    };
    const read = async () => tick();
    return {
      user: {
        findUnique: async (a: { where: { id: string }; select?: Record<string, boolean> }) => {
          await read();
          return pick(get().users.get(a.where.id), a.select);
        },
        findFirst: async (a: { where: Row; select?: Record<string, boolean> }) => {
          await read();
          return pick(
            [...get().users.values()].find((u) => matches(u, a.where)),
            a.select,
          );
        },
        findMany: async (a: {
          where?: Row;
          select?: Record<string, boolean>;
          skip?: number;
          take?: number;
          orderBy?: unknown;
        }) => {
          await read();
          mem.lastFindManyWhere = a.where;
          const rows = [...get().users.values()]
            .filter((u) => matches(u, a.where))
            .sort(
              (x, y) => y.createdAt.getTime() - x.createdAt.getTime() || x.id.localeCompare(y.id),
            );
          const skip = a.skip ?? 0;
          return rows
            .slice(skip, a.take === undefined ? undefined : skip + a.take)
            .map((u) => pick(u, a.select));
        },
        count: async (a: { where?: Row }) => {
          await read();
          return [...get().users.values()].filter((u) => matches(u, a.where)).length;
        },
        create: async (a: { data: Partial<U>; select?: Record<string, boolean> }) => {
          await write('user.create');
          const s = get();
          const lower = String(a.data.username).toLowerCase();
          if (mem.breakOn === lower) throw new Error('connection reset');
          // The lower("username") unique index.
          if (
            mem.raceOn === lower ||
            [...s.users.values()].some((u) => u.username.toLowerCase() === lower)
          )
            throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
          const row: U = {
            id: `new-${++mem.created}`,
            username: '',
            passwordHash: '',
            role: '',
            displayName: null,
            disabledAt: null,
            mustChangePassword: false,
            createdAt: new Date(),
            lastLoginAt: null,
            ...a.data,
          };
          s.users.set(row.id, row);
          return pick(row, a.select);
        },
        update: async (a: { where: { id: string }; data: Partial<U> }) => {
          await write('user.update');
          const row = get().users.get(a.where.id);
          if (!row) throw notFound();
          Object.assign(row, a.data);
          return { ...row };
        },
        delete: async (a: { where: { id: string } }) => {
          await write('user.delete');
          const s = get();
          const row = s.users.get(a.where.id);
          if (!row) throw notFound();
          s.users.delete(a.where.id);
          // onDelete: Cascade for LearningAttempt and ReviewProgress.
          s.attempts = s.attempts.filter((r) => r.userId !== a.where.id);
          s.reviews = s.reviews.filter((r) => r.userId !== a.where.id);
          return row;
        },
      },
      authSession: {
        findUnique: async (a: { where: { id: string }; select?: Record<string, boolean> }) => {
          await read();
          return pick(get().sessions.get(a.where.id), a.select);
        },
        create: async (a: { data: Row }) => {
          await write('authSession.create');
          const row = { ...a.data, userId: a.data.userId ?? null };
          get().sessions.set(a.data.id as string, row);
          return { ...row };
        },
        delete: async (a: { where: { id: string } }) => {
          await write('authSession.delete');
          get().sessions.delete(a.where.id);
          return {};
        },
        deleteMany: async (a: { where: Row }) => {
          await write('authSession.deleteMany');
          let count = 0;
          for (const [id, s] of get().sessions)
            if (matches({ ...s, id }, a.where)) {
              get().sessions.delete(id);
              count++;
            }
          return { count };
        },
      },
      audit: {
        create: async (a: { data: Row }) => {
          await write('audit.create');
          get().audits.push(a.data);
          return a.data;
        },
      },
    };
  };
  const db = {
    ...build(() => mem.state, false),
    $transaction: async (fn: (tx: unknown) => Promise<unknown>, options?: Row) => {
      mem.txOptions.push(options);
      const started = mem.version;
      const draft = structuredClone(mem.state);
      const result = await fn(build(() => draft, true));
      await tick();
      // Optimistic stand-in for Postgres SSI: a Serializable commit fails if anything committed since it began.
      if (
        options?.isolationLevel === 'Serializable' &&
        (mem.alwaysConflict || mem.version !== started)
      ) {
        mem.conflicts++;
        throw conflict();
      }
      mem.state = draft;
      mem.version++;
      return result;
    },
  };
  return Object.assign(mem, { db: db as unknown as Db });
};

let seq = 0;
const user = (extra: Partial<U> & { id: string; username: string }): U => ({
  passwordHash: passwordHash('old-password-16chars'),
  role: 'student',
  displayName: null,
  disabledAt: null,
  mustChangePassword: false,
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, seq++)),
  lastLoginAt: null,
  ...extra,
});
const admin = (id: string, extra: Partial<U> = {}) =>
  user({ id, username: id, role: 'admin', ...extra });
const adminReq = (userId: string) =>
  ({ actor: { id: `sid-${userId}`, role: 'admin', userId } }) as unknown as ActorRequest;
const roleReq = (role: string) =>
  ({
    actor: { id: 'sid', role, userId: role === 'learner' ? null : 'someone' },
  }) as unknown as ActorRequest;
const service = (mem: Mem, waits?: number[]) => {
  const svc = new UsersService(mem.db);
  if (waits)
    svc.retryWait = async (ms) => {
      waits.push(ms);
    };
  return svc;
};
const ctrl = (mem: Mem, waits?: number[]) => new AdminUsersController(service(mem, waits));
const outcome = async (p: Promise<unknown>) =>
  p.then(
    (body) => ({ status: 200, body: body as Row, message: '' }),
    (e: unknown) =>
      e instanceof HttpException
        ? {
            status: e.getStatus(),
            body: null,
            message: (e.getResponse() as { message: string }).message,
          }
        : { status: errorStatus(e), body: null, message: errorBody(e).message },
  );
const addSession = (mem: Mem, userId: string | null, id = `s-${Math.random()}`) =>
  mem.state.sessions.set(id, {
    id,
    userId,
    role: 'x',
    csrf: 'c',
    internal: false,
    expiresAt: new Date(Date.now() + 3600000),
  });
const sessionsOf = (mem: Mem, userId: string) =>
  [...mem.state.sessions.values()].filter((s) => s.userId === userId).length;
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const validateAs = async <T>(metatype: new () => T, value: unknown, type: 'body' | 'query') =>
  pipe.transform(value, { type, metatype }).then(
    (v) => ({ ok: true as const, value: v as T }),
    (e: HttpException) => ({ ok: false as const, status: e.getStatus() }),
  );
const isVietnamese = (s: string) =>
  /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹáàãéèíìóòõúùýđ]/i.test(s);

// ---- Access ----------------------------------------------------------------------------------
test('admin users routes: guards on the class, and every non-admin role is refused by all four routes', async () => {
  const guards = Reflect.getMetadata('__guards__', AdminUsersController) as unknown[];
  assert.deepEqual(guards, [AccessGuard, AdminOnlyGuard]);
  const mem = memoryDb([admin('a1'), user({ id: 'u1', username: 'An' })]);
  const routes = (r: ActorRequest): (() => Promise<unknown>)[] => [
    () => ctrl(mem).list(r, {} as ListUsersQuery),
    () => ctrl(mem).update(r, 'u1', { disabled: true }),
    () => ctrl(mem).resetPassword(r, 'u1'),
    () => ctrl(mem).remove(r, 'u1', { confirmUsername: 'An' }),
    () => ctrl(mem).bulkCreate(r, { rows: [{ username: 'Lan' }] }),
  ];
  const guardCtx = (r: ActorRequest) =>
    ({ switchToHttp: () => ({ getRequest: () => r }) }) as ExecutionContext;
  for (const role of ['student', 'manager', 'learner', 'editor', 'reviewer', 'publisher']) {
    // Student, manager and learner already stop at AdminOnlyGuard; staff roles at requireRole.
    const guard = await outcome(
      Promise.resolve().then(() => new AdminOnlyGuard().canActivate(guardCtx(roleReq(role)))),
    );
    if (['student', 'manager', 'learner'].includes(role)) assert.equal(guard.status, 403, role);
    for (const call of routes(roleReq(role))) {
      const r = await outcome(Promise.resolve().then(() => call()));
      assert.equal(r.status, 403, role);
    }
  }
  // Guests are turned away by AccessGuard before any handler.
  const auth = new Auth(mem.db);
  const { jar, res } = cookieJar();
  await auth.create(res, 'guest', false);
  const guestReq = {
    method: 'GET',
    cookies: { seafoodeck_session: jar.token },
    headers: {},
  } as unknown as ActorRequest;
  const guest = await outcome(
    new AccessGuard(auth).canActivate(guardCtx(guestReq) as ExecutionContext),
  );
  assert.equal(guest.status, 401);
  // Nothing changed for u1, and nobody was created.
  assert.equal(mem.state.users.get('u1')!.disabledAt, null);
  assert.equal(mem.state.users.size, 2);
  assert.equal(mem.state.audits.length, 0);
});

// ---- List ------------------------------------------------------------------------------------
test('GET /admin/users filters by role, status and q (case-insensitive), pages, and never returns passwordHash', async () => {
  const mem = memoryDb([
    admin('root'),
    user({ id: 'u1', username: 'An', displayName: 'Nguyễn An' }),
    user({ id: 'u2', username: 'binh', displayName: 'Trần Bình', disabledAt: new Date() }),
    user({ id: 'u3', username: 'chi_ANh', displayName: null, role: 'manager' }),
    user({
      id: 'u4',
      username: 'dung',
      displayName: 'Lê ANH Dũng',
      lastLoginAt: new Date('2026-11-01T00:00:00Z'),
    }),
  ]);
  const list = (q: Partial<ListUsersQuery>) =>
    ctrl(mem).list(adminReq('root'), q as ListUsersQuery);
  const all = await list({});
  assert.equal(all.total, 5);
  assert.equal(all.page, 1);
  assert.equal(all.limit, 50);
  for (const row of all.items) {
    assert.deepEqual(Object.keys(row).sort(), [
      'createdAt',
      'disabled',
      'displayName',
      'id',
      'lastLoginAt',
      'mustChangePassword',
      'role',
      'username',
    ]);
    assert.equal(JSON.stringify(row).includes('passwordHash'), false);
    assert.equal(typeof row.createdAt, 'string');
  }
  assert.equal(all.items.find((r) => r.id === 'u4')!.lastLoginAt, '2026-11-01T00:00:00.000Z');
  assert.equal(all.items.find((r) => r.id === 'u2')!.disabled, true);
  assert.equal(all.items.find((r) => r.id === 'u1')!.disabled, false);
  // role
  assert.deepEqual(
    (await list({ role: 'manager' })).items.map((r) => r.id),
    ['u3'],
  );
  assert.deepEqual(
    (await list({ role: 'admin' })).items.map((r) => r.id),
    ['root'],
  );
  // status
  assert.deepEqual(
    (await list({ status: 'disabled' })).items.map((r) => r.id),
    ['u2'],
  );
  assert.equal((await list({ status: 'active' })).total, 4);
  // q matches username or displayName, ignoring case
  assert.deepEqual((await list({ q: 'anh' })).items.map((r) => r.id).sort(), ['u3', 'u4']);
  assert.deepEqual(
    (await list({ q: 'NGUYỄN' })).items.map((r) => r.id),
    ['u1'],
  );
  assert.equal((await list({ q: '%' })).total, 0);
  assert.deepEqual(
    (await list({ q: 'b', status: 'disabled', role: 'student' })).items.map((r) => r.id),
    ['u2'],
  );
  // paging
  const p1 = await list({ page: 1, limit: 2 });
  const p3 = await list({ page: 3, limit: 2 });
  assert.equal(p1.items.length, 2);
  assert.equal(p1.total, 5);
  assert.equal(p3.items.length, 1);
  assert.equal(p3.page, 3);
  assert.equal(p3.limit, 2);
  const ids = new Set(
    [...p1.items, ...(await list({ page: 2, limit: 2 })).items, ...p3.items].map((r) => r.id),
  );
  assert.equal(ids.size, 5);
});

test('GET /admin/users query validation: enums, page and limit bounds', async () => {
  const ok = await validateAs(
    ListUsersQuery,
    { role: 'admin', status: 'active', q: 'an', page: '2', limit: '200' },
    'query',
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.ok && ok.value.page, 2);
  assert.equal(ok.ok && ok.value.limit, 200);
  const top = await validateAs(ListUsersQuery, { page: '1000000', limit: '200' }, 'query');
  assert.equal(top.ok && top.value.page, 1_000_000);
  for (const role of ['student', 'manager', 'editor', 'reviewer', 'publisher', 'admin'])
    assert.equal((await validateAs(ListUsersQuery, { role }, 'query')).ok, true, role);
  for (const bad of [
    { role: 'learner' },
    { role: 'guest' },
    { status: 'locked' },
    { page: '0' },
    { page: 'x' },
    { page: '1000001' },
    { page: '1e18' },
    { limit: '201' },
    { limit: '0' },
    { q: 'x'.repeat(81) },
    { extra: '1' },
  ]) {
    const r = await validateAs(ListUsersQuery, bad, 'query');
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.equal(!r.ok && r.status, 400);
  }
});

// ---- PATCH -----------------------------------------------------------------------------------
test('PATCH lock sets disabledAt and deletes every session in one transaction; unlock clears it; audited', async () => {
  const mem = memoryDb([
    admin('root'),
    user({ id: 'u1', username: 'An' }),
    user({ id: 'u2', username: 'Binh' }),
  ]);
  addSession(mem, 'u1');
  addSession(mem, 'u1');
  addSession(mem, 'u2');
  mem.writes.length = 0;
  const row = await ctrl(mem).update(adminReq('root'), 'u1', { disabled: true });
  assert.equal(row.disabled, true);
  assert.equal('passwordHash' in row, false);
  assert.ok(mem.state.users.get('u1')!.disabledAt instanceof Date);
  assert.equal(sessionsOf(mem, 'u1'), 0);
  assert.equal(sessionsOf(mem, 'u2'), 1);
  assert.deepEqual(
    mem.writes.filter((w) => !w.inTx),
    [],
    'every write inside the transaction',
  );
  assert.ok(mem.writes.some((w) => w.op === 'authSession.deleteMany'));
  assert.deepEqual(
    mem.state.audits.map((a) => [a.action, a.actorId, a.targetId]),
    [['user.disable', 'root', 'u1']],
  );
  const unlocked = await ctrl(mem).update(adminReq('root'), 'u1', { disabled: false });
  assert.equal(unlocked.disabled, false);
  assert.equal(mem.state.users.get('u1')!.disabledAt, null);
  assert.equal(mem.state.audits.at(-1)!.action, 'user.enable');
});

test('PATCH lock: if the session delete fails nothing changes', async () => {
  const mem = memoryDb([admin('root'), user({ id: 'u1', username: 'An' })]);
  addSession(mem, 'u1');
  mem.failOn = 'authSession.deleteMany';
  const r = await outcome(ctrl(mem).update(adminReq('root'), 'u1', { disabled: true }));
  assert.equal(r.status, 500);
  assert.equal(mem.state.users.get('u1')!.disabledAt, null);
  assert.equal(sessionsOf(mem, 'u1'), 1);
  assert.equal(mem.state.audits.length, 0);
  // And the other way round: the user update failing keeps the sessions.
  mem.failOn = 'user.update';
  assert.equal(
    (await outcome(ctrl(mem).update(adminReq('root'), 'u1', { disabled: true }))).status,
    500,
  );
  assert.equal(sessionsOf(mem, 'u1'), 1);
});

test('PATCH displayName: trims, empty clears, max 80; role is not a PATCH field', async () => {
  const mem = memoryDb([admin('root'), user({ id: 'u1', username: 'An', displayName: 'An' })]);
  const named = await ctrl(mem).update(adminReq('root'), 'u1', { displayName: 'Nguyễn Văn An' });
  assert.equal(named.displayName, 'Nguyễn Văn An');
  assert.equal(mem.state.audits.at(-1)!.action, 'user.update');
  assert.equal(
    (await ctrl(mem).update(adminReq('root'), 'u1', { displayName: null })).displayName,
    null,
  );
  const trimmed = await validateAs(UpdateUserDto, { displayName: '  Lan  ' }, 'body');
  assert.equal(trimmed.ok && trimmed.value.displayName, 'Lan');
  assert.equal(
    (await validateAs(UpdateUserDto, { displayName: 'x'.repeat(81) }, 'body')).ok,
    false,
  );
  assert.equal((await validateAs(UpdateUserDto, { disabled: 'yes' }, 'body')).ok, false);
  // The global pipe forbids unknown fields, so { role } never reaches the handler...
  const withRole = await validateAs(UpdateUserDto, { role: 'admin' }, 'body');
  assert.equal(withRole.ok, false);
  assert.equal(!withRole.ok && withRole.status, 400);
  // ...and even if it did, the service never writes a role.
  await ctrl(mem).update(adminReq('root'), 'u1', {
    role: 'admin',
    displayName: 'An',
  } as UpdateUserDto);
  assert.equal(mem.state.users.get('u1')!.role, 'student');
});

test('PATCH / reset / DELETE of an unknown user is 404', async () => {
  const mem = memoryDb([admin('root')]);
  const c = ctrl(mem);
  assert.equal((await outcome(c.update(adminReq('root'), 'nope', { disabled: true }))).status, 404);
  assert.equal((await outcome(c.resetPassword(adminReq('root'), 'nope'))).status, 404);
  const del = await outcome(c.remove(adminReq('root'), 'nope', { confirmUsername: 'nope' }));
  assert.equal(del.status, 404);
  assert.ok(isVietnamese(del.message), del.message);
});

// ---- Reset password --------------------------------------------------------------------------
test('reset password: role-length temp password, forced change, old sessions gone, no secret in Audit or logs', async () => {
  const mem = memoryDb([
    admin('root'),
    user({ id: 'u1', username: 'An' }),
    user({ id: 'm1', username: 'Mai', role: 'manager' }),
  ]);
  addSession(mem, 'u1');
  addSession(mem, 'u1');
  const logged: string[] = [];
  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
  const saved = methods.map((m) => console[m]);
  for (const m of methods)
    console[m] = (...args: unknown[]) => {
      logged.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    };
  let temp = '';
  let managerTemp = '';
  let loginStatus = 0;
  let guardStatus: Row | null = null;
  try {
    mem.writes.length = 0;
    const out = await ctrl(mem).resetPassword(adminReq('root'), 'u1');
    assert.deepEqual(Object.keys(out), ['temporaryPassword']);
    temp = out.temporaryPassword;
    managerTemp = (await ctrl(mem).resetPassword(adminReq('root'), 'm1')).temporaryPassword;
    assert.deepEqual(
      mem.writes.filter((w) => !w.inTx),
      [],
      'every write inside the transaction',
    );
    // The student logs in with it and is then forced to change it.
    const auth = new Auth(mem.db);
    const guest = cookieJar();
    const before = await auth.create(guest.res, 'guest', false);
    const loginReq = {
      method: 'POST',
      ip: '10.0.0.5',
      cookies: { seafoodeck_session: guest.jar.token },
      headers: { 'x-csrf-token': before.csrf },
    } as unknown as Request;
    const jar = cookieJar();
    loginStatus = (
      await outcome(
        new AuthController(auth, mem.db, new LoginLimiter()).login(
          { username: 'an', credential: temp },
          loginReq,
          jar.res,
        ),
      )
    ).status;
    const after = {
      method: 'GET',
      cookies: { seafoodeck_session: jar.jar.token },
      headers: {},
    } as unknown as Request;
    const ctx = {
      switchToHttp: () => ({ getRequest: () => after }),
      getHandler: () => AdminUsersController.prototype.list,
      getClass: () => AdminUsersController,
    } as unknown as ExecutionContext;
    guardStatus = await new MustChangePasswordGuard(mem.db, new Reflector()).canActivate(ctx).then(
      () => ({ status: 200 }),
      (e: HttpException) => ({ status: e.getStatus(), body: e.getResponse() }),
    );
  } finally {
    methods.forEach((m, i) => (console[m] = saved[i]));
  }
  assert.equal(temp.length, 12);
  assert.equal(managerTemp.length, 20);
  const u1 = mem.state.users.get('u1')!;
  assert.equal(u1.mustChangePassword, true);
  assert.ok(passwordMatches(temp, u1.passwordHash));
  assert.equal(passwordMatches('old-password-16chars', u1.passwordHash), false);
  assert.equal(loginStatus, 200);
  assert.equal(guardStatus!.status, 403);
  assert.equal((guardStatus!.body as Row).code as string, 'MUST_CHANGE_PASSWORD');
  // Only the session created by the login is left; the two old ones were revoked.
  assert.equal(sessionsOf(mem, 'u1'), 1);
  const resets = mem.state.audits.filter((a) => a.action === 'user.reset-password');
  assert.deepEqual(
    resets.map((a) => a.targetId),
    ['u1', 'm1'],
  );
  const audits = JSON.stringify(mem.state.audits);
  for (const secret of [temp, managerTemp]) {
    assert.equal(audits.includes(secret), false, 'no secret in Audit');
    assert.equal(
      logged.some((l) => l.includes(secret)),
      false,
      'no secret in logs',
    );
  }
});

// ---- Delete ----------------------------------------------------------------------------------
test('DELETE: wrong confirmUsername is 400 and deletes nothing; right one (any case) removes user, logs, progress, sessions; old Audit stays', async () => {
  const mem = memoryDb([
    admin('root'),
    user({ id: 'u1', username: 'An' }),
    user({ id: 'u2', username: 'Binh' }),
  ]);
  addSession(mem, 'u1');
  addSession(mem, 'u2');
  mem.state.attempts.push({ id: 'a1', userId: 'u1' }, { id: 'a2', userId: 'u2' });
  mem.state.reviews.push({ userId: 'u1', targetId: 't' }, { userId: 'u2', targetId: 't' });
  mem.state.audits.push({ actorId: 'root', action: 'user.create', targetId: 'u1', detail: {} });
  const wrong = await outcome(
    ctrl(mem).remove(adminReq('root'), 'u1', { confirmUsername: 'Binh' }),
  );
  assert.equal(wrong.status, 400);
  assert.ok(isVietnamese(wrong.message), wrong.message);
  assert.ok(mem.state.users.has('u1'));
  assert.equal(sessionsOf(mem, 'u1'), 1);
  mem.writes.length = 0;
  const done = await ctrl(mem).remove(adminReq('root'), 'u1', { confirmUsername: ' aN ' });
  assert.deepEqual(done, { deleted: true });
  assert.deepEqual(
    mem.writes.filter((w) => !w.inTx),
    [],
    'every write inside the transaction',
  );
  assert.equal(mem.state.users.has('u1'), false);
  assert.equal(sessionsOf(mem, 'u1'), 0);
  assert.deepEqual(
    mem.state.attempts.map((a) => a.id),
    ['a2'],
  );
  assert.deepEqual(
    mem.state.reviews.map((r) => r.userId),
    ['u2'],
  );
  assert.equal(sessionsOf(mem, 'u2'), 1);
  assert.deepEqual(
    mem.state.audits.map((a) => [a.action, a.targetId, a.detail]),
    [
      ['user.create', 'u1', {}],
      ['user.delete', 'u1', { username: 'An', role: 'student' }],
    ],
  );
  assert.equal((await validateAs(DeleteUserDto, {}, 'body')).ok, false);
});

// ---- Safety (Review Focus 2) -----------------------------------------------------------------
test('an admin cannot lock or delete themselves', async () => {
  const mem = memoryDb([admin('a1'), admin('a2')]);
  const lock = await outcome(ctrl(mem).update(adminReq('a1'), 'a1', { disabled: true }));
  const del = await outcome(ctrl(mem).remove(adminReq('a1'), 'a1', { confirmUsername: 'a1' }));
  for (const r of [lock, del]) {
    assert.equal(r.status, 400);
    assert.ok(isVietnamese(r.message), r.message);
  }
  assert.equal(mem.state.users.get('a1')!.disabledAt, null);
  assert.ok(mem.state.users.has('a1'));
});

test('the last active admin can be neither locked nor deleted, by anyone', async () => {
  // a1 is the only active admin; a2 is a locked admin whose request was already in flight.
  const mem = memoryDb([admin('a1'), admin('a2', { disabledAt: new Date() })]);
  for (const call of [
    () => ctrl(mem).update(adminReq('a1'), 'a1', { disabled: true }),
    () => ctrl(mem).remove(adminReq('a1'), 'a1', { confirmUsername: 'a1' }),
  ]) {
    const r = await outcome(call());
    assert.equal(r.status, 400);
    assert.ok(isVietnamese(r.message), r.message);
  }
  // The locked a2 is stopped even earlier: its own row is re-checked inside the transaction.
  for (const call of [
    () => ctrl(mem).update(adminReq('a2'), 'a1', { disabled: true }),
    () => ctrl(mem).remove(adminReq('a2'), 'a1', { confirmUsername: 'a1' }),
  ]) {
    const r = await outcome(call());
    assert.equal(r.status, 401);
    assert.equal(r.message, SESSION_EXPIRED);
  }
  assert.equal(mem.state.users.get('a1')!.disabledAt, null);
  assert.ok(mem.state.users.has('a1'));
  // The check runs in a Serializable transaction.
  assert.ok(mem.txOptions.some((o) => (o as Row | undefined)?.isolationLevel === 'Serializable'));
  // A locked admin may still be deleted while one active admin remains.
  assert.deepEqual(await ctrl(mem).remove(adminReq('a1'), 'a2', { confirmUsername: 'A2' }), {
    deleted: true,
  });
});

test('with two active admins one may lock, unlock and delete the other; audited', async () => {
  const mem = memoryDb([admin('a1'), admin('a2'), admin('a3', { disabledAt: new Date() })]);
  addSession(mem, 'a2');
  assert.equal((await ctrl(mem).update(adminReq('a1'), 'a2', { disabled: true })).disabled, true);
  assert.equal(sessionsOf(mem, 'a2'), 0);
  // Now a1 is the last active admin: a2 (locked) can be unlocked again.
  assert.equal((await ctrl(mem).update(adminReq('a1'), 'a2', { disabled: false })).disabled, false);
  assert.deepEqual(await ctrl(mem).remove(adminReq('a1'), 'a2', { confirmUsername: 'a2' }), {
    deleted: true,
  });
  assert.deepEqual(
    mem.state.audits.map((a) => [a.action, a.actorId, a.targetId]),
    [
      ['user.disable', 'a1', 'a2'],
      ['user.enable', 'a1', 'a2'],
      ['user.delete', 'a1', 'a2'],
    ],
  );
  assert.deepEqual(mem.state.audits.at(-1)!.detail, { username: 'a2', role: 'admin' });
});

test('two admins locking each other at the same time leave exactly one active admin', async () => {
  for (const kind of ['lock', 'delete', 'mixed'] as const) {
    const mem = memoryDb([admin('a1'), admin('a2')]);
    const first =
      kind === 'delete'
        ? ctrl(mem).remove(adminReq('a1'), 'a2', { confirmUsername: 'a2' })
        : ctrl(mem).update(adminReq('a1'), 'a2', { disabled: true });
    const second =
      kind === 'lock'
        ? ctrl(mem).update(adminReq('a2'), 'a1', { disabled: true })
        : ctrl(mem).remove(adminReq('a2'), 'a1', { confirmUsername: 'a1' });
    const results = await Promise.all([outcome(first), outcome(second)]);
    const active = [...mem.state.users.values()].filter((u) => u.role === 'admin' && !u.disabledAt);
    assert.equal(active.length, 1, kind);
    // The loser retries, finds itself locked or deleted, and is refused like an expired session.
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 401], kind);
    assert.ok(mem.conflicts >= 1, `${kind}: the transactions really overlapped`);
  }
});

test('serialization conflicts that never clear end as 409 BUSY and change nothing', async () => {
  const mem = memoryDb([admin('a1'), admin('a2')]);
  mem.alwaysConflict = true;
  const waits: number[] = [];
  const started = Date.now();
  const r = await outcome(ctrl(mem, waits).update(adminReq('a1'), 'a2', { disabled: true }));
  assert.equal(r.status, 409);
  assert.equal(r.message, 'Hệ thống đang bận, vui lòng thử lại.');
  assert.equal(mem.conflicts, 7, 'first try plus 6 retries');
  assert.equal(waits.length, 6, 'the injected wait replaced every real pause');
  assert.ok(Date.now() - started < 200, 'no real sleeping');
  assert.equal(mem.state.users.get('a2')!.disabledAt, null);
});

// ---- Review hardening -----------------------------------------------------------------------
test('q is literal: _ and % and backslash are escaped before reaching Prisma contains', async () => {
  const mem = memoryDb([
    admin('root'),
    user({ id: 'u1', username: 'An', displayName: '50% off' }),
    user({ id: 'u2', username: 'chi_anh' }),
    user({ id: 'u3', username: 'binh', displayName: 'a\\b' }),
  ]);
  const list = (q: string) => ctrl(mem).list(adminReq('root'), { q } as ListUsersQuery);
  assert.deepEqual(
    (await list('_')).items.map((r) => r.id),
    ['u2'],
  );
  const where = mem.lastFindManyWhere as { OR: { username?: Row; displayName?: Row }[] };
  assert.deepEqual(where.OR[0].username, { contains: '\\_', mode: 'insensitive' });
  assert.deepEqual(where.OR[1].displayName, { contains: '\\_', mode: 'insensitive' });
  assert.deepEqual(
    (await list('%')).items.map((r) => r.id),
    ['u1'],
  );
  assert.deepEqual(
    (await list('\\')).items.map((r) => r.id),
    ['u3'],
  );
  assert.equal((await list('a\\b')).total, 1);
  assert.equal((await list('i_a')).total, 1);
  assert.equal((await list('h_a')).total, 0);
});

test('lock and delete re-check the actor inside the transaction: a locked or deleted admin gets the expired-session 401', async () => {
  const mem = memoryDb([
    admin('a1'),
    admin('a2'),
    admin('gone'),
    user({ id: 'u1', username: 'An' }),
  ]);
  mem.state.users.get('a2')!.disabledAt = new Date();
  mem.state.users.delete('gone');
  addSession(mem, 'u1');
  for (const actor of ['a2', 'gone'])
    for (const call of [
      () => ctrl(mem).update(adminReq(actor), 'u1', { disabled: true }),
      () => ctrl(mem).remove(adminReq(actor), 'u1', { confirmUsername: 'An' }),
    ]) {
      const r = await outcome(call());
      assert.equal(r.status, 401, actor);
      assert.equal(r.message, SESSION_EXPIRED);
    }
  assert.equal(mem.state.users.get('u1')!.disabledAt, null);
  assert.ok(mem.state.users.has('u1'));
  assert.equal(sessionsOf(mem, 'u1'), 1);
  assert.equal(mem.state.audits.length, 0);
  // The check reads the actor in the same transaction as the write.
  mem.writes.length = 0;
  assert.equal((await ctrl(mem).update(adminReq('a1'), 'u1', { disabled: true })).disabled, true);
});

test('an admin resetting their own password keeps the current session and loses the others', async () => {
  const mem = memoryDb([admin('root'), admin('a2'), user({ id: 'u1', username: 'An' })]);
  addSession(mem, 'root', 'sid-root');
  addSession(mem, 'root', 'root-laptop');
  addSession(mem, 'a2', 'sid-a2');
  const own = await ctrl(mem).resetPassword(adminReq('root'), 'root');
  assert.equal(own.temporaryPassword.length, 20);
  assert.deepEqual([...mem.state.sessions.keys()].sort(), ['sid-a2', 'sid-root']);
  assert.equal(mem.state.users.get('root')!.mustChangePassword, true);
  // Resetting someone else still revokes all of their sessions, including one sharing an id prefix.
  await ctrl(mem).resetPassword(adminReq('root'), 'a2');
  assert.deepEqual([...mem.state.sessions.keys()], ['sid-root']);
});

test('re-locking a locked user keeps the original disabledAt, revokes sessions again, and writes no second Audit', async () => {
  const lockedAt = new Date('2026-10-01T00:00:00Z');
  const mem = memoryDb([admin('root'), user({ id: 'u1', username: 'An', disabledAt: lockedAt })]);
  addSession(mem, 'u1');
  const row = await ctrl(mem).update(adminReq('root'), 'u1', { disabled: true });
  assert.equal(row.disabled, true);
  assert.equal(mem.state.users.get('u1')!.disabledAt!.getTime(), lockedAt.getTime());
  assert.equal(sessionsOf(mem, 'u1'), 0);
  assert.equal(mem.state.audits.length, 0);
  // A rename alongside a re-lock is audited as the rename only.
  await ctrl(mem).update(adminReq('root'), 'u1', { disabled: true, displayName: 'An' });
  assert.deepEqual(
    mem.state.audits.map((a) => a.action),
    ['user.update'],
  );
});

test('PATCH displayName "" is stored as null; DELETE without confirmUsername is a 400 from the pipe', async () => {
  const mem = memoryDb([admin('root'), user({ id: 'u1', username: 'An', displayName: 'An' })]);
  const row = await ctrl(mem).update(adminReq('root'), 'u1', { displayName: '' });
  assert.equal(row.displayName, null);
  assert.equal(mem.state.users.get('u1')!.displayName, null);
  const blank = await validateAs(UpdateUserDto, { displayName: '   ' }, 'body');
  assert.ok(blank.ok);
  assert.equal((await ctrl(mem).update(adminReq('root'), 'u1', blank.value)).displayName, null);
  for (const body of [{}, { confirmUsername: 5 }, { confirmUsername: null }]) {
    const r = await validateAs(DeleteUserDto, body, 'body');
    assert.equal(r.ok, false, JSON.stringify(body));
    assert.equal(!r.ok && r.status, 400);
  }
  assert.ok(mem.state.users.has('u1'));
});

// ---- Bulk create (Review Focus 3) -----------------------------------------------------------
const BULK_ROWS = [
  { username: 'Binh' },
  { username: 'binh', password: 'another-pass-1' },
  { username: 'lAN' },
  { username: 'x' },
  { username: 'Chi', password: 'short' },
  { username: 'Dung', displayName: '  Lê Dũng ', password: 'given-password-1' },
  { username: 'Hoa', password: '' },
];
/** Captures console output while fn runs. */
async function captureLogs<T>(fn: () => Promise<T>): Promise<{ result: T; logged: string[] }> {
  const logged: string[] = [];
  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
  const saved = methods.map((m) => console[m]);
  for (const m of methods)
    console[m] = (...args: unknown[]) => {
      logged.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    };
  try {
    return { result: await fn(), logged };
  } finally {
    methods.forEach((m, i) => (console[m] = saved[i]));
  }
}

test('bulk create: duplicates (case-insensitive, in batch and in DB), invalid rows do not block the rest, generated passwords returned once', async () => {
  const mem = memoryDb([admin('root'), user({ id: 'u1', username: 'Lan' })]);
  const { result: out, logged } = await captureLogs(() =>
    ctrl(mem).bulkCreate(adminReq('root'), { rows: BULK_ROWS.map((r) => ({ ...r })) }),
  );
  assert.equal(out.dryRun, false);
  assert.deepEqual(
    out.rows.map((r) => [r.line, r.username, r.status]),
    [
      [1, 'Binh', 'created'],
      [2, 'binh', 'duplicate'],
      [3, 'lAN', 'duplicate'],
      [4, 'x', 'invalid'],
      [5, 'Chi', 'invalid'],
      [6, 'Dung', 'created'],
      [7, 'Hoa', 'created'],
    ],
  );
  assert.deepEqual([out.created, out.skipped, out.failed], [3, 2, 2]);
  // In-batch duplicate names the line of the first occurrence; every message is Vietnamese.
  assert.match(out.rows[1].message!, /dòng 1\b/);
  for (const r of out.rows.filter((x) => x.status !== 'created'))
    assert.ok(isVietnamese(r.message!), r.message!);
  // Generated passwords for blank rows only; a typed password is never echoed back.
  const byName = (n: string) => out.rows.find((r) => r.username === n)!;
  for (const r of out.rows)
    assert.equal('temporaryPassword' in r, ['Binh', 'Hoa'].includes(r.username), r.username);
  assert.equal(JSON.stringify(out).includes('given-password-1'), false);
  assert.equal(JSON.stringify(out).includes('another-pass-1'), false);
  const stored = (n: string) => [...mem.state.users.values()].find((u) => u.username === n)!;
  for (const n of ['Binh', 'Hoa']) {
    const temp = byName(n).temporaryPassword!;
    assert.equal(temp.length, 12);
    assert.ok(passwordMatches(temp, stored(n).passwordHash));
    assert.equal(stored(n).mustChangePassword, true);
  }
  assert.ok(passwordMatches('given-password-1', stored('Dung').passwordHash));
  assert.equal(stored('Dung').mustChangePassword, false);
  assert.equal(stored('Dung').displayName, 'Lê Dũng');
  for (const n of ['Binh', 'Dung', 'Hoa']) assert.equal(stored(n).role, 'student');
  assert.equal(stored('Lan').id, 'u1', 'the existing user is untouched');
  assert.equal(mem.state.users.size, 5);
  // Audit: one summary (counts only) plus one user.create per created user; no secrets anywhere.
  const summary = mem.state.audits.filter((a) => a.action === 'user.bulk-create');
  assert.equal(summary.length, 1);
  assert.equal(summary[0].actorId, 'root');
  assert.deepEqual(summary[0].detail, { created: 3, skipped: 2, failed: 2 });
  const creates = mem.state.audits.filter((a) => a.action === 'user.create');
  assert.deepEqual(
    creates.map((a) => a.targetId),
    ['Binh', 'Dung', 'Hoa'].map((n) => stored(n).id),
  );
  for (const a of creates) assert.deepEqual(a.detail, { role: 'student', bulk: true });
  const audits = JSON.stringify(mem.state.audits);
  const secrets = [
    'given-password-1',
    'another-pass-1',
    'short',
    byName('Binh').temporaryPassword!,
  ];
  for (const secret of [...secrets, byName('Hoa').temporaryPassword!]) {
    assert.equal(audits.includes(secret), false, 'no secret in Audit');
    assert.equal(
      logged.some((l) => l.includes(secret)),
      false,
      'no secret in logs',
    );
  }
});

test('bulk create: each row is its own transaction', async () => {
  const mem = memoryDb([admin('root')]);
  mem.writes.length = 0;
  const out = await ctrl(mem).bulkCreate(adminReq('root'), {
    rows: [{ username: 'Lan' }, { username: 'Minh' }],
  });
  assert.equal(out.created, 2);
  // Two user transactions, then the summary Audit.
  assert.equal(mem.txOptions.length, 2);
  assert.deepEqual(
    mem.writes.map((w) => [w.op, w.inTx]),
    [
      ['user.create', true],
      ['audit.create', true],
      ['user.create', true],
      ['audit.create', true],
      ['audit.create', false],
    ],
  );
});

test('bulk create dryRun: same verdicts, writes nothing, returns no password', async () => {
  const mem = memoryDb([admin('root'), user({ id: 'u1', username: 'Lan' })]);
  mem.writes.length = 0;
  const out = await ctrl(mem).bulkCreate(adminReq('root'), {
    rows: BULK_ROWS.map((r) => ({ ...r })),
    dryRun: true,
  });
  assert.equal(out.dryRun, true);
  assert.deepEqual(
    out.rows.map((r) => r.status),
    ['created', 'duplicate', 'duplicate', 'invalid', 'invalid', 'created', 'created'],
  );
  assert.deepEqual([out.created, out.skipped, out.failed], [3, 2, 2]);
  assert.equal(JSON.stringify(out).includes('temporaryPassword'), false);
  assert.equal(JSON.stringify(out).includes('given-password-1'), false);
  assert.deepEqual(mem.writes, []);
  assert.equal(mem.txOptions.length, 0);
  assert.equal(mem.state.users.size, 2);
  assert.equal(mem.state.audits.length, 0);
});

test('bulk create: a lost unique-index race is that row duplicate, an unexpected row error is that row invalid; the batch goes on', async () => {
  const mem = memoryDb([admin('root')]);
  mem.raceOn = 'giang';
  mem.breakOn = 'khoa';
  const out = await ctrl(mem).bulkCreate(adminReq('root'), {
    rows: [{ username: 'Giang' }, { username: 'Khoa' }, { username: 'Lan' }],
  });
  assert.deepEqual(
    out.rows.map((r) => [r.username, r.status, 'temporaryPassword' in r]),
    [
      ['Giang', 'duplicate', false],
      ['Khoa', 'invalid', false],
      ['Lan', 'created', true],
    ],
  );
  assert.deepEqual([out.created, out.skipped, out.failed], [1, 1, 1]);
  assert.equal(out.rows[1].message!.includes('connection reset'), false);
  assert.deepEqual(
    [...mem.state.users.values()].map((u) => u.username),
    ['root', 'Lan'],
  );
  assert.deepEqual(
    mem.state.audits.map((a) => a.action),
    ['user.create', 'user.bulk-create'],
  );
});

test('bulk create validation: 1 to 500 rows, typed and length-limited fields, nothing unknown', async () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ username: `hs_${i}` }));
  const ok = await validateAs(BulkCreateUsersDto, { rows: rows(500), dryRun: true }, 'body');
  assert.equal(ok.ok, true);
  const trimmed = await validateAs(
    BulkCreateUsersDto,
    { rows: [{ username: ' An ', displayName: ' Lan ', password: ' p a s s word ' }] },
    'body',
  );
  assert.ok(trimmed.ok);
  assert.deepEqual(
    { ...trimmed.value.rows[0] },
    {
      username: 'An',
      displayName: 'Lan',
      password: ' p a s s word ',
    },
  );
  for (const bad of [
    { rows: rows(501) },
    { rows: [] },
    {},
    { rows: 'Lan' },
    { rows: ['Lan'] },
    { rows: [{}] },
    { rows: [{ username: 5 }] },
    { rows: [{ username: 'x'.repeat(51) }] },
    { rows: [{ username: 'Lan', displayName: 'x'.repeat(81) }] },
    { rows: [{ username: 'Lan', password: 'x'.repeat(151) }] },
    { rows: [{ username: 'Lan', role: 'admin' }] },
    { rows: [{ username: 'Lan' }], dryRun: 'yes' },
    { rows: [{ username: 'Lan' }], role: 'admin' },
  ]) {
    const r = await validateAs(BulkCreateUsersDto, bad, 'body');
    assert.equal(r.ok, false, JSON.stringify(bad).slice(0, 80));
    assert.equal(!r.ok && r.status, 400);
  }
});

/** Minimal express Response that records the session cookie it is given. */
function cookieJar() {
  const jar = { token: undefined as string | undefined };
  const res = {
    cookie: (name: string, value: string) => {
      if (name === 'seafoodeck_session') jar.token = value;
    },
  } as unknown as Response;
  return { jar, res };
}
