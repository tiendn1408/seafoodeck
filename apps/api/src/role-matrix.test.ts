/**
 * Role × route matrix. The route inventory comes from the Nest metadata of every controller
 * reachable from AppModule (no hand-written route list), so a route added later without an entry
 * in EXPECTED fails here with its name. For each protected route and each role the test runs the
 * real gate: the controller's class guards then its method guards (via canActivate on a fake HTTP
 * context), then the handler itself on a controller whose dependencies are inert proxies. The
 * first call into any dependency (db, services, response) throws a sentinel, so reaching it means
 * the request got past every role check of the handler; a 401/403 before that means it was
 * refused. Session lookup is faked (Auth.actor returns the role's session, CSRF is not checked
 * here: me-access.test.ts covers it), everything role-related is the production code.
 */
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Controller,
  Get,
  HttpException,
  Module,
  forwardRef,
  Req,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
  type Type,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common/enums/request-method.enum';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { AppModule } from './main';
import {
  AccessGuard,
  AdminOnlyGuard,
  EditingGuard,
  MustChangePasswordGuard,
  requireRole,
  type ActorRequest,
  type Auth,
} from './security';
import type { Db } from './db';

const ROLES = [
  'guest',
  'learner',
  'student',
  'manager',
  'editor',
  'reviewer',
  'publisher',
  'admin',
] as const;
type Role = (typeof ROLES)[number];
const STAFF: Role[] = ['editor', 'reviewer', 'publisher', 'admin'];
const EDIT: Role[] = ['editor', 'admin'];
const REVIEW: Role[] = ['reviewer', 'admin'];
const PUBLISH: Role[] = ['publisher', 'admin'];
const ADMIN: Role[] = ['admin'];
const MANAGER: Role[] = ['manager', 'admin'];
const STUDENT: Role[] = ['student'];
/** Any session backed by a user account (not an invite-code learner, not a guest). */
const ACCOUNT: Role[] = ['student', 'manager', ...STAFF];
/** Any signed-in session, invite-code learners included. */
const SIGNED_IN: Role[] = ['learner', ...ACCOUNT];

/**
 * The expected gate of every route (paths without the `api/v1` prefix). `public` routes run no
 * role gate at all; they are exactly the health probe and the session endpoints that a guest must
 * reach to obtain or end a session.
 */
const EXPECTED: Record<string, Role[] | 'public'> = {
  'GET /health': 'public',
  'GET /auth/me': 'public',
  'POST /auth/login': 'public',
  'POST /auth/logout': 'public',

  'GET /me': ACCOUNT,
  'PATCH /me': ACCOUNT,
  'POST /me/password': ACCOUNT,
  'GET /me/home': STUDENT,
  'GET /me/review': STUDENT,
  'GET /me/progress': STUDENT,
  'GET /me/mastery': STUDENT,

  'GET /catalog/items': SIGNED_IN,
  'GET /catalog/overview': SIGNED_IN,
  'GET /catalog/items/:revisionId': SIGNED_IN,
  'GET /media/:id/url': SIGNED_IN,
  'POST /learning/sessions': SIGNED_IN,
  'GET /learning/sessions/:id': SIGNED_IN,
  'GET /learning/sessions/:id/summary': SIGNED_IN,
  'POST /learning/sessions/:id/questions/:qid/reveal': SIGNED_IN,
  'POST /learning/sessions/:id/questions/:qid/attempts': SIGNED_IN,

  'GET /manager/learners': MANAGER,
  'GET /manager/learners.csv': MANAGER,
  'GET /manager/learners/:id': MANAGER,
  'GET /manager/learners/:id/review': MANAGER,
  'GET /manager/learners/:id/progress': MANAGER,
  'GET /manager/learners/:id/mastery': MANAGER,

  'GET /admin/overview': STAFF,
  'GET /admin/csv-template': EDIT,
  'POST /admin/import/preview': EDIT,
  'POST /admin/import': EDIT,
  'POST /admin/items': EDIT,
  'POST /admin/revisions/:id/submit': EDIT,
  'POST /admin/revisions/:id/approve': REVIEW,
  'POST /admin/releases': PUBLISH,
  'POST /admin/releases/:id/rollback': PUBLISH,
  'POST /admin/revisions/:id/media': EDIT,
  'POST /admin/media/:id/approve': REVIEW,
  'POST /admin/media/:id/revoke': REVIEW,
  'POST /admin/scenarios': EDIT,
  'POST /admin/scenarios/:id/approve': REVIEW,
  'POST /admin/maintenance/orphans': ADMIN,
  'GET /admin/items/by-external/:externalId': STAFF,
  'GET /admin/tariffs': STAFF,
  'POST /admin/tariffs': EDIT,
  'POST /admin/tariffs/:id/approve': REVIEW,
  'POST /admin/revisions/:id/clone': EDIT,
  'POST /admin/users': ADMIN,
  'GET /admin/users': ADMIN,
  'POST /admin/users/bulk': ADMIN,
  'PATCH /admin/users/:id': ADMIN,
  'POST /admin/users/:id/reset-password': ADMIN,
  'DELETE /admin/users/:id': ADMIN,
};

/** Routes a session that must still change its password may reach (MustChangePasswordGuard). */
const ALLOWED_WHILE_PASSWORD_CHANGE = [
  'GET /auth/me',
  'POST /auth/logout',
  'GET /me',
  'POST /me/password',
];

type Handler = (...args: unknown[]) => unknown;
interface Route {
  key: string;
  verb: string;
  controller: Type<unknown>;
  method: string;
  handler: Handler;
  guards: unknown[];
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v : [v ?? '/']).map(String);
const joinPath = (...parts: string[]) =>
  '/' +
  parts
    .join('/')
    .split('/')
    .filter((p) => p !== '')
    .join('/');

/**
 * True for a class (a static @Module). A DynamicModule ({ module, ... }) or forwardRef
 * ({ forwardRef }) is an object, and its controllers/providers would not be read below.
 * (`@Module({})` with no keys defines no metadata, so metadata presence is not required.)
 */
const isModuleClass = (m: unknown): m is Type<unknown> => typeof m === 'function';

/** Every module reachable from a module through its imports (AppModule = the running app). */
function modulesOf(root: Type<unknown>): Type<unknown>[] {
  const seen = new Set<Type<unknown>>();
  const walk = (mod: unknown, from: string) => {
    // A DynamicModule, forwardRef or anything else this walk cannot read would hide its
    // controllers and guards from the matrix: fail loudly so the walk gets taught about it.
    assert.ok(
      isModuleClass(mod),
      `${from} imports ${String((mod as { name?: string })?.name ?? mod)} which is not a plain @Module class (DynamicModule/forwardRef?); teach role-matrix.test.ts to read it`,
    );
    if (seen.has(mod)) return;
    seen.add(mod);
    for (const m of Reflect.getMetadata(MODULE_METADATA.IMPORTS, mod) ?? []) walk(m, mod.name);
  };
  walk(root, 'the root');
  return [...seen];
}

/** Every controller reachable from a module through its imports. */
function controllersOf(root: Type<unknown>): Type<unknown>[] {
  const found = new Set<Type<unknown>>();
  for (const mod of modulesOf(root))
    for (const c of Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, mod) ?? []) found.add(c);
  return [...found];
}

/** The classes registered as global guards (APP_GUARD providers) by the reachable modules. */
function globalGuardsOf(root: Type<unknown>): unknown[] {
  const guards: unknown[] = [];
  for (const mod of modulesOf(root))
    for (const p of Reflect.getMetadata(MODULE_METADATA.PROVIDERS, mod) ?? []) {
      if (typeof p !== 'object' || p === null || (p as { provide?: unknown }).provide !== APP_GUARD)
        continue;
      const { useClass } = p as { useClass?: unknown };
      assert.ok(
        typeof useClass === 'function',
        `${mod.name} registers an APP_GUARD without useClass; model it in role-matrix.test.ts`,
      );
      guards.push(useClass);
    }
  return guards;
}

/** Every route handler of the given controllers, read from Nest's route and guard metadata. */
function routesOf(controllers: Type<unknown>[]): Route[] {
  const routes: Route[] = [];
  for (const controller of controllers) {
    const proto = controller.prototype as Record<string, Handler>;
    const classGuards = Reflect.getMetadata(GUARDS_METADATA, controller) ?? [];
    for (const method of Object.getOwnPropertyNames(proto)) {
      if (method === 'constructor') continue;
      const handler = Object.getOwnPropertyDescriptor(proto, method)?.value;
      if (typeof handler !== 'function') continue;
      const verbId = Reflect.getMetadata(METHOD_METADATA, handler);
      if (verbId === undefined) continue;
      const verb = RequestMethod[verbId as RequestMethod];
      const guards = [...classGuards, ...(Reflect.getMetadata(GUARDS_METADATA, handler) ?? [])];
      for (const base of asList(Reflect.getMetadata(PATH_METADATA, controller)))
        for (const path of asList(Reflect.getMetadata(PATH_METADATA, handler)))
          routes.push({
            key: `${verb} ${joinPath(base, path)}`,
            verb,
            controller,
            method,
            handler,
            guards,
          });
    }
  }
  return routes;
}

/** Thrown by any use of a faked dependency: the handler got past its role checks. */
class Reached extends Error {}
/**
 * A stand-in for every dependency, body, response or upload: property reads return more
 * stand-ins (so `this.svc.review` may be read while arguments are evaluated), calling one or
 * converting it to a primitive throws Reached. Not thenable, so awaiting one does not hang.
 */
const inert = (): unknown =>
  new Proxy(function stub() {}, {
    get: (_t, key) =>
      key === 'then'
        ? undefined
        : key === Symbol.toPrimitive
          ? () => {
              throw new Reached();
            }
          : inert(),
    apply: () => {
      throw new Reached();
    },
    construct: () => {
      throw new Reached();
    },
  });

const ACTOR = Symbol('actor');
const session = (role: Role) => ({
  id: 'session-' + role,
  role,
  internal: false,
  // Invite-code learners and guests have no account; every other role signs in with one.
  userId: role === 'guest' || role === 'learner' ? null : 'user-' + role,
  csrf: 'csrf',
  expiresAt: new Date(Date.now() + 3600000),
  createdAt: new Date(),
});
/** Session lookup only; everything that decides on the role is production code. */
const fakeAuth = {
  actor: async (req: ActorRequest & { [ACTOR]: unknown }) => req[ACTOR],
  checkWrite: () => undefined,
} as unknown as Auth;
const guardInstances = new Map<unknown, CanActivate>([
  [AccessGuard, new AccessGuard(fakeAuth)],
  [AdminOnlyGuard, new AdminOnlyGuard()],
  [EditingGuard, new EditingGuard()],
]);

/** Handler arguments as Nest would bind them: the request, string params, stand-ins otherwise. */
function argsFor(route: Route, req: unknown): unknown[] {
  const meta: Record<string, { index: number; data?: unknown }> =
    Reflect.getMetadata(ROUTE_ARGS_METADATA, route.controller, route.method) ?? {};
  const args: unknown[] = [];
  for (const [key, { index, data }] of Object.entries(meta)) {
    const type = Number(key.split(':')[0]);
    args[index] =
      type === RouteParamtypes.REQUEST
        ? req
        : type === RouteParamtypes.PARAM && typeof data === 'string'
          ? 'param-' + data
          : type === RouteParamtypes.QUERY && typeof data === 'string'
            ? undefined // the handler's default applies
            : inert();
  }
  return args;
}

type Outcome = 'reached' | 401 | 403 | `unexpected: ${string}`;
/** Runs class + method guards, then the handler up to its first dependency use. */
async function gate(route: Route, role: Role): Promise<Outcome> {
  const req = { method: route.verb, headers: {}, cookies: {}, [ACTOR]: session(role) };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => inert() }),
    getHandler: () => route.handler,
    getClass: () => route.controller,
    getType: () => 'http',
  } as unknown as ExecutionContext;
  try {
    for (const guard of route.guards) {
      const instance = guardInstances.get(guard);
      if (!instance) return `unexpected: guard ${String(guard)} is not modelled in this test`;
      if (!(await instance.canActivate(ctx))) return 403; // Nest answers false with 403
    }
    const deps = (Reflect.getMetadata('design:paramtypes', route.controller) ?? []).map(inert);
    const controller = new route.controller(...deps) as Record<string, Handler>;
    await controller[route.method](...argsFor(route, req));
    return 'reached';
  } catch (e) {
    if (e instanceof Reached) return 'reached';
    if (e instanceof HttpException && (e.getStatus() === 401 || e.getStatus() === 403))
      return e.getStatus() as 401 | 403;
    // Anything else past the guards (a TypeError on a stand-in, a 400 on junk input) means the
    // role checks let the request through; a refused role must never get here.
    return e instanceof HttpException ? 'reached' : `unexpected: ${(e as Error).message}`;
  }
}

const ROUTES = routesOf(controllersOf(AppModule));
const PROTECTED = ROUTES.filter((r) => EXPECTED[r.key] !== 'public' && EXPECTED[r.key]);

test('every route of the app has an entry in the role table (and no entry is stale)', () => {
  const keys = ROUTES.map((r) => r.key);
  const unknown = keys.filter((k) => !(k in EXPECTED));
  assert.deepEqual(
    unknown,
    [],
    `Routes without an entry in EXPECTED (role-matrix.test.ts); add each with its allowed roles: ${unknown.join(', ')}`,
  );
  const stale = Object.keys(EXPECTED).filter((k) => !keys.includes(k));
  assert.deepEqual(stale, [], `Entries in EXPECTED that match no route: ${stale.join(', ')}`);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  assert.deepEqual(dupes, [], `Routes declared twice: ${dupes.join(', ')}`);
});

test('the global guards are exactly the ones this matrix models', () => {
  // A new APP_GUARD changes what every route admits; extend `gate` (and this list) for it.
  assert.deepEqual(globalGuardsOf(AppModule), [MustChangePasswordGuard]);
});

test('public routes are exactly the documented ones and carry no guards', () => {
  const pub = ROUTES.filter((r) => EXPECTED[r.key] === 'public');
  assert.deepEqual(pub.map((r) => r.key).sort(), [
    'GET /auth/me',
    'GET /health',
    'POST /auth/login',
    'POST /auth/logout',
  ]);
  for (const r of pub) assert.deepEqual(r.guards, [], `${r.key} is public but declares guards`);
});

test('every protected route admits exactly its roles; guests get 401, other roles 403', async () => {
  const wrong: string[] = [];
  for (const route of PROTECTED) {
    const allowed = EXPECTED[route.key] as Role[];
    for (const role of ROLES) {
      const want: Outcome = allowed.includes(role) ? 'reached' : role === 'guest' ? 401 : 403;
      const got = await gate(route, role);
      if (got !== want) wrong.push(`${route.key} as ${role}: expected ${want}, got ${got}`);
    }
  }
  assert.ok(PROTECTED.length >= 40, `only ${PROTECTED.length} protected routes found`);
  assert.deepEqual(wrong, []);
});

test('learner, trial and guest sessions never reach /admin/* or /manager/* data', async () => {
  const gated = PROTECTED.filter((r) => /^\w+ \/(admin|manager)\//.test(r.key));
  assert.ok(gated.length >= 30);
  for (const route of gated)
    for (const role of ['guest', 'learner', 'student'] as const)
      assert.notEqual(await gate(route, role), 'reached', `${route.key} as ${role}`);
});

test('MustChangePasswordGuard blocks every route except password change, logout and me', async () => {
  const live = { id: 'sid', userId: 'u1', expiresAt: new Date(Date.now() + 60000) };
  const db = {
    authSession: { findUnique: async () => live },
    user: { findUnique: async () => ({ disabledAt: null, mustChangePassword: true }) },
  } as unknown as Db;
  const open: string[] = [];
  for (const route of ROUTES) {
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ cookies: { seafoodeck_session: 'tok' } }) }),
      getHandler: () => route.handler,
      getClass: () => route.controller,
    } as unknown as ExecutionContext;
    try {
      await new MustChangePasswordGuard(db, new Reflector()).canActivate(ctx);
      open.push(route.key);
    } catch (e) {
      const body = (e as HttpException).getResponse() as { code?: string };
      assert.equal((e as HttpException).getStatus(), 403, route.key);
      assert.equal(body.code, 'MUST_CHANGE_PASSWORD', route.key);
    }
  }
  assert.deepEqual(open.sort(), [...ALLOWED_WHILE_PASSWORD_CHANGE].sort());
});

// The harness itself: it must see a route without a role check, and one that touches a
// dependency before checking, as reachable; otherwise the matrix above would prove nothing.
@UseGuards(AccessGuard)
@Controller('probe')
class ProbeController {
  constructor(private db: Db) {}
  @Get('loose') loose() {
    return this.db.user.findMany();
  }
  @Get('late') async late(@Req() req: ActorRequest) {
    await this.db.user.findMany();
    requireRole(req, ['admin']);
  }
  @Get('checked') async checked(@Req() req: ActorRequest) {
    requireRole(req, ['admin']);
    await this.db.user.findMany();
  }
}

test('the harness detects a missing or late role check', async () => {
  const probe = Object.fromEntries(routesOf([ProbeController]).map((r) => [r.key, r]));
  assert.equal(await gate(probe['GET /probe/loose'], 'learner'), 'reached');
  assert.equal(await gate(probe['GET /probe/late'], 'learner'), 'reached');
  assert.equal(await gate(probe['GET /probe/checked'], 'learner'), 403);
  assert.equal(await gate(probe['GET /probe/checked'], 'guest'), 401);
  assert.equal(await gate(probe['GET /probe/checked'], 'admin'), 'reached');
});

test('the module walk refuses imports it cannot read', () => {
  @Module({})
  class Plain {}
  @Module({ imports: [{ module: Plain, controllers: [ProbeController] }] })
  class WithDynamic {}
  @Module({ imports: [forwardRef(() => Plain)] })
  class WithForwardRef {}
  assert.throws(() => controllersOf(WithDynamic), /not a plain @Module class/);
  assert.throws(() => controllersOf(WithForwardRef), /not a plain @Module class/);
  @Module({ imports: [Plain], providers: [{ provide: APP_GUARD, useExisting: AccessGuard }] })
  class WithAliasGuard {}
  assert.throws(() => globalGuardsOf(WithAliasGuard), /APP_GUARD without useClass/);
});
