import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import type { AuthSession } from './generated/prisma/client';
import { Db } from './db';

export const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const opaque = () => randomBytes(32).toString('base64url');
export function passwordHash(password: string) {
  const salt = opaque();
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function passwordMatches(password: string, saved: string) {
  const [salt, digest] = saved.split(':');
  if (!salt || !digest) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
/** Shortest password accepted for a role: account students 8, every staff/manager role 16. */
export const passwordMinFor = (role: string) => (role === 'student' ? 8 : 16);
// Burned on unknown usernames so a missing account costs the same scrypt work as a wrong password.
const decoyHash = passwordHash(opaque());
export function passwordCheck(password: string, saved: string | undefined) {
  return passwordMatches(password, saved ?? decoyHash) && saved !== undefined;
}
/** Deletes a user's sessions (optionally keeping one), e.g. after a password change or disable. */
export function revokeUserSessions(
  db: Pick<Db, 'authSession'>,
  userId: string,
  keepSessionId?: string,
) {
  return db.authSession.deleteMany({
    where: { userId, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) },
  });
}
export type ActorRequest = Request & { actor: AuthSession };
const cookie = 'seafoodeck_session';
/** One wording for expired, missing and locked sessions alike, so a lock is never revealed. */
export const SESSION_EXPIRED = 'Phiên hết hạn. Vui lòng nhập lại mã mời.';
const ttlMs = () => Number(process.env.AUTH_TTL_HOURS ?? 24) * 3600000;
type AccountState = { disabledAt: Date | null; mustChangePassword: boolean } | null;
const accountCache = Symbol('seafoodeck.account');
type CachedRequest = Request & {
  [accountCache]?: { userId: string; state: Promise<AccountState> };
};
/**
 * The account fields every request needs (lock and forced password change), read once per request
 * and shared by MustChangePasswordGuard and Auth.actor through a Symbol slot on the request object,
 * so it dies with the request. Callers only reach this for sessions that carry a userId.
 */
function accountState(db: Pick<Db, 'user'>, req: Request, userId: string) {
  const r = req as CachedRequest;
  const hit = r[accountCache];
  if (hit && hit.userId === userId) return hit.state;
  const state = db.user.findUnique({
    where: { id: userId },
    select: { disabledAt: true, mustChangePassword: true },
  });
  r[accountCache] = { userId, state };
  return state;
}
/** Locked or deleted account: drop the leftover session row and answer like an expired session. */
async function dropSession(db: Pick<Db, 'authSession'>, sessionId: string) {
  await db.authSession.deleteMany({ where: { id: sessionId } });
}
/** A new session's token and row data (fresh CSRF); persist `data`, then `Auth.setCookie(token)`. */
export function sessionDraft(role: string, internal: boolean, userId?: string) {
  const token = opaque();
  return {
    token,
    data: {
      id: hash(token),
      role,
      internal,
      userId,
      csrf: opaque(),
      expiresAt: new Date(Date.now() + ttlMs()),
    },
  };
}
@Injectable()
export class Auth {
  constructor(private db: Db) {}
  async actor(req: Request, res?: Response) {
    const token = req.cookies?.[cookie];
    const row = token && (await this.db.authSession.findUnique({ where: { id: hash(token) } }));
    if (row && row.expiresAt.getTime() > Date.now()) {
      // Account sessions only: invite learners and guests never cost a user lookup.
      const account = row.userId && (await accountState(this.db, req, row.userId));
      const locked = !!row.userId && (!account || !!account.disabledAt);
      if (!locked)
        return { ...row, internal: row.internal && process.env.ALLOW_INTERNAL_DEMO === 'true' };
      await dropSession(this.db, row.id);
    }
    if (!res) throw new UnauthorizedException(SESSION_EXPIRED);
    return this.create(res, 'guest', false);
  }
  async create(res: Response, role: string, internal: boolean, userId?: string) {
    const { token, data } = sessionDraft(role, internal, userId);
    const row = await this.db.authSession.create({ data });
    this.setCookie(res, token);
    return row;
  }
  setCookie(res: Response, token: string) {
    res.cookie(cookie, token, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE !== 'false',
      sameSite: 'strict',
      path: '/',
      maxAge: ttlMs(),
    });
  }
  checkWrite(req: Request, actor: AuthSession) {
    if (req.headers['x-csrf-token'] !== actor.csrf)
      throw new ForbiddenException('CSRF token không hợp lệ.');
    if (req.headers.origin && req.headers.origin !== process.env.PUBLIC_ORIGIN)
      throw new ForbiddenException('Origin không hợp lệ.');
  }
  view(actor: AuthSession) {
    return {
      role: actor.role,
      internal: actor.internal,
      csrf: actor.csrf,
      expiresAt: actor.expiresAt.toISOString(),
    };
  }
}
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private auth: Auth) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<ActorRequest>();
    req.actor = await this.auth.actor(req);
    if (req.actor.role === 'guest') throw new UnauthorizedException('Cần mã mời để mở bộ học.');
    if (!['GET', 'HEAD'].includes(req.method)) this.auth.checkWrite(req, req.actor);
    return true;
  }
}
export function requireRole(req: ActorRequest, roles: string[]) {
  if (!roles.includes(req.actor.role))
    throw new ForbiddenException('Tài khoản không có quyền thao tác này.');
}
export function requireStudent(req: ActorRequest) {
  if (req.actor.role === 'learner' || req.actor.role === 'guest')
    throw new ForbiddenException('Đăng nhập tài khoản để xem tiến độ.');
  if (req.actor.role !== 'student' || !req.actor.userId)
    throw new ForbiddenException('Tài khoản không có quyền thao tác này.');
}
export function requireManager(req: ActorRequest) {
  requireRole(req, ['manager', 'admin']);
}
/** Session belongs to a user account (not an invite-code learner or guest). */
export function requireAccount(req: ActorRequest): string {
  if (!req.actor.userId) throw new ForbiddenException('Đăng nhập tài khoản để xem hồ sơ.');
  return req.actor.userId;
}
@Injectable()
export class AdminOnlyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    requireRole(ctx.switchToHttp().getRequest<ActorRequest>(), [
      'editor',
      'reviewer',
      'publisher',
      'admin',
    ]);
    return true;
  }
}
@Injectable()
export class EditingGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    requireRole(ctx.switchToHttp().getRequest<ActorRequest>(), ['editor', 'admin']);
    return true;
  }
}
@Injectable()
export class LoginLimiter {
  private buckets = new Map<string, { count: number; until: number }>();
  private names = new Map<string, { count: number; until: number }>();
  private prune(now: number) {
    for (const [key, b] of this.buckets) if (b.until < now) this.buckets.delete(key);
    for (const [key, b] of this.names) if (b.until < now) this.names.delete(key);
  }
  private blocked = () => new HttpException('Quá nhiều lần thử. Thử lại sau 10 phút.', 429);
  /**
   * Gate AND reserve, synchronously and before any await in the login flow: throws 429 when the IP
   * (20 / 10 min) or, with a username, the lowercased name (10 / 10 min) is already full, without
   * counting further; otherwise takes one slot in each bucket. A failed login keeps its slot.
   */
  check(ip: string, username?: string) {
    const now = Date.now();
    this.prune(now);
    const name = username?.toLowerCase();
    const bucket = this.buckets.get(ip) ?? { count: 0, until: now + 600000 };
    const named = name === undefined ? undefined : this.names.get(name);
    if (bucket.count >= 20 || (named?.count ?? 0) >= 10) throw this.blocked();
    bucket.count++;
    this.buckets.set(ip, bucket);
    if (name === undefined) return;
    const next = named ?? { count: 0, until: now + 600000 };
    next.count++;
    this.names.set(name, next);
  }
  /**
   * After a successful login: refunds the IP slot taken by `check` and clears the bucket of the
   * username that just authenticated (never any other), so successes never consume the budget.
   */
  succeed(ip: string, username?: string) {
    const bucket = this.buckets.get(ip);
    if (bucket && bucket.count > 0) bucket.count--;
    if (username !== undefined) this.names.delete(username.toLowerCase());
  }
  private passwordChecks = new Map<string, { count: number; until: number }>();
  /** Current-password checks (POST /me/password): 10 / 10 min per user, apart from login buckets. */
  checkPassword(userId: string) {
    const now = Date.now();
    for (const [key, b] of this.passwordChecks) if (b.until < now) this.passwordChecks.delete(key);
    const key = `pw:${userId}`;
    const bucket = this.passwordChecks.get(key) ?? { count: 0, until: now + 600000 };
    if (++bucket.count > 10)
      throw new HttpException('Quá nhiều lần thử. Thử lại sau 10 phút.', 429);
    this.passwordChecks.set(key, bucket);
  }
}
/** Marks a handler as reachable while the account must still change its password. */
export const AllowWhilePasswordChange = () => SetMetadata('allowWhilePasswordChange', true);
/**
 * Global guard. Runs before controller guards, so it resolves the session cookie itself and
 * reads the flags fresh from the user row (never cached on the session, so clearing or locking
 * takes effect on the very next request; the row is shared with Auth.actor for this request
 * only). A locked or deleted account gets the expired-session 401 and loses the session row.
 * Invite-code learners, guests and unauthenticated requests have no userId and are untouched.
 */
@Injectable()
export class MustChangePasswordGuard implements CanActivate {
  constructor(
    private db: Db,
    private reflector: Reflector,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>('allowWhilePasswordChange', [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    )
      return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const token = req.cookies?.[cookie];
    if (!token) return true;
    const session = await this.db.authSession.findUnique({
      where: { id: hash(token) },
      select: { id: true, userId: true, expiresAt: true },
    });
    if (!session?.userId || session.expiresAt.getTime() <= Date.now()) return true;
    const user = await accountState(this.db, req, session.userId);
    if (!user || user.disabledAt) {
      await dropSession(this.db, session.id);
      throw new UnauthorizedException(SESSION_EXPIRED);
    }
    if (user.mustChangePassword)
      throw new ForbiddenException({
        message: 'Cần đổi mật khẩu trước.',
        code: 'MUST_CHANGE_PASSWORD',
      });
    return true;
  }
}
