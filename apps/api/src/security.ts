import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
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
export type ActorRequest = Request & { actor: AuthSession };
const cookie = 'seafoodeck_session';
@Injectable()
export class Auth {
  constructor(private db: Db) {}
  async actor(req: Request, res?: Response) {
    const token = req.cookies?.[cookie];
    const row = token && (await this.db.authSession.findUnique({ where: { id: hash(token) } }));
    if (row && row.expiresAt.getTime() > Date.now())
      return { ...row, internal: row.internal && process.env.ALLOW_INTERNAL_DEMO === 'true' };
    if (!res) throw new UnauthorizedException('Phiên hết hạn. Vui lòng nhập lại mã mời.');
    return this.create(res, 'guest', false);
  }
  async create(res: Response, role: string, internal: boolean, userId?: string) {
    const token = opaque();
    const row = await this.db.authSession.create({
      data: {
        id: hash(token),
        role,
        internal,
        userId,
        csrf: opaque(),
        expiresAt: new Date(Date.now() + Number(process.env.AUTH_TTL_HOURS ?? 24) * 3600000),
      },
    });
    res.cookie(cookie, token, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE !== 'false',
      sameSite: 'strict',
      path: '/',
      maxAge: Number(process.env.AUTH_TTL_HOURS ?? 24) * 3600000,
    });
    return row;
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
  check(ip: string) {
    const now = Date.now();
    for (const [key, b] of this.buckets) if (b.until < now) this.buckets.delete(key);
    const bucket = this.buckets.get(ip) ?? { count: 0, until: now + 600000 };
    if (++bucket.count > 20)
      throw new HttpException('Quá nhiều lần thử. Thử lại sau 10 phút.', 429);
    this.buckets.set(ip, bucket);
  }
}
