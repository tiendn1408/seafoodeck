import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Prisma } from './generated/prisma/client';
import { Db } from './db';
import {
  passwordHash,
  passwordHashAsync,
  passwordMinFor,
  revokeUserSessions,
  SESSION_EXPIRED,
} from './security';
import { findUserByUsername, generateTempPassword, normalizeUsername } from './users';
import { withSerializableRetry } from './progress-record';

export type AdminUserRow = {
  id: string;
  username: string;
  displayName: string | null;
  role: string;
  disabled: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};
export type UserListQuery = {
  role?: string;
  status?: 'active' | 'disabled';
  q?: string;
  page?: number;
  limit?: number;
};
export type BulkRowInput = {
  username: string;
  displayName?: string | null;
  password?: string | null;
};
export type BulkRowResult = {
  line: number;
  username: string;
  status: 'created' | 'duplicate' | 'invalid';
  message?: string;
  temporaryPassword?: string;
};
export type BulkResult = {
  dryRun: boolean;
  created: number;
  skipped: number;
  failed: number;
  rows: BulkRowResult[];
};
/** Same rule as POST /admin/users. */
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,50}$/;
const STUDENT = 'student';
type Tx = Prisma.TransactionClient;
/** Every column an admin row shows; passwordHash is never read for a row. */
const ROW_SELECT = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  disabledAt: true,
  mustChangePassword: true,
  createdAt: true,
  lastLoginAt: true,
} as const;
type RowSource = {
  id: string;
  username: string;
  displayName: string | null;
  role: string;
  disabledAt: Date | null;
  mustChangePassword: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
};
const toRow = (u: RowSource): AdminUserRow => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  role: u.role,
  disabled: !!u.disabledAt,
  mustChangePassword: u.mustChangePassword,
  createdAt: u.createdAt.toISOString(),
  lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
});
/**
 * Prisma's `contains` becomes `ILIKE '%' || $1 || '%'` with $1 passed through unescaped (checked
 * against the Prisma 7 query compiler), so `%` and `_` would act as wildcards. Postgres' default
 * LIKE escape character is the backslash: escape it first, then both wildcards.
 */
export const escapeLike = (text: string) => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
const missing = () => new NotFoundException('Không tìm thấy người dùng.');
const SERIALIZABLE = { isolationLevel: 'Serializable' } as const;
const TAKEN = 'Tên đăng nhập đã tồn tại.';

/**
 * Admin user management. Lock and delete run in a Serializable transaction (retried on
 * serialization conflicts; exhausted retries surface as the global 409 BUSY) so the
 * "at least one active admin" rule holds even when two admins act on each other at once.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  /** Pause between Serializable retries; undefined uses the real jittered sleep (tests inject one). */
  retryWait?: (ms: number) => Promise<void>;
  constructor(private db: Db) {}

  async list(query: UserListQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const q = query.q?.trim() ? escapeLike(query.q.trim()) : undefined;
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status === 'active' ? { disabledAt: null } : {}),
      ...(query.status === 'disabled' ? { disabledAt: { not: null } } : {}),
      ...(q
        ? {
            OR: [
              { username: { contains: q, mode: 'insensitive' } },
              { displayName: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.user.findMany({
        where,
        select: ROW_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.user.count({ where }),
    ]);
    return { items: rows.map(toRow), total, page, limit };
  }

  /** PATCH: displayName and/or lock state. A lock also revokes every session, atomically. */
  async update(
    actorId: string,
    id: string,
    dto: { displayName?: string | null; disabled?: boolean },
  ): Promise<AdminUserRow> {
    if (dto.disabled === true && id === actorId)
      throw new BadRequestException('Không thể tự khóa tài khoản của chính mình.');
    return withSerializableRetry(
      () =>
        this.db.$transaction(async (tx) => {
          await this.requireActiveActor(tx, actorId);
          const user = await tx.user.findUnique({ where: { id }, select: ROW_SELECT });
          if (!user) throw missing();
          const data: Prisma.UserUpdateInput = {};
          const audits: { action: string; detail: Prisma.InputJsonObject }[] = [];
          if (dto.displayName !== undefined) {
            data.displayName = dto.displayName || null;
            audits.push({ action: 'user.update', detail: { fields: ['displayName'] } });
          }
          if (dto.disabled === true) {
            await this.keepAnActiveAdmin(tx, user, 'khóa');
            // Re-locking keeps the original lock time and is not audited a second time.
            if (!user.disabledAt) {
              data.disabledAt = new Date();
              audits.push({ action: 'user.disable', detail: {} });
            }
          } else if (dto.disabled === false) {
            data.disabledAt = null;
            audits.push({ action: 'user.enable', detail: {} });
          }
          const updated = Object.keys(data).length
            ? await tx.user.update({ where: { id }, data, select: ROW_SELECT })
            : user;
          // Every lock request revokes sessions, a repeated one too.
          if (dto.disabled === true) await revokeUserSessions(tx, id);
          for (const a of audits)
            await tx.audit.create({
              data: { actorId, action: a.action, targetId: id, detail: a.detail },
            });
          return toRow(updated);
        }, SERIALIZABLE),
      this.retryWait,
    );
  }

  /**
   * New temporary password (length by role), forced change on next login, every session revoked.
   * An admin resetting their own password keeps the session making the request
   * (`actorSessionId`), so this response arrives and the forced-change flow starts there.
   * The response is the only place the secret appears: never in Audit, logs or errors.
   */
  async resetPassword(
    actorId: string,
    id: string,
    actorSessionId?: string,
  ): Promise<{ temporaryPassword: string }> {
    return this.db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id }, select: { id: true, role: true } });
      if (!user) throw missing();
      const temporaryPassword = generateTempPassword(user.role);
      await tx.user.update({
        where: { id },
        data: { passwordHash: passwordHash(temporaryPassword), mustChangePassword: true },
      });
      await revokeUserSessions(tx, id, id === actorId ? actorSessionId : undefined);
      await tx.audit.create({
        data: { actorId, action: 'user.reset-password', targetId: id, detail: {} },
      });
      return { temporaryPassword };
    });
  }

  /** Hard delete: sessions first, then the user (attempts and progress cascade). Audit survives. */
  async remove(actorId: string, id: string, confirmUsername: string): Promise<{ deleted: true }> {
    if (id === actorId) throw new BadRequestException('Không thể tự xóa tài khoản của chính mình.');
    return withSerializableRetry(
      () =>
        this.db.$transaction(async (tx) => {
          await this.requireActiveActor(tx, actorId);
          const user = await tx.user.findUnique({ where: { id }, select: ROW_SELECT });
          if (!user) throw missing();
          if (normalizeUsername(confirmUsername ?? '') !== normalizeUsername(user.username))
            throw new BadRequestException('Tên đăng nhập xác nhận không khớp.');
          await this.keepAnActiveAdmin(tx, user, 'xóa');
          await revokeUserSessions(tx, id);
          await tx.user.delete({ where: { id } });
          await tx.audit.create({
            data: {
              actorId,
              action: 'user.delete',
              targetId: id,
              detail: { username: user.username, role: user.role },
            },
          });
          return { deleted: true as const };
        }, SERIALIZABLE),
      this.retryWait,
    );
  }

  /**
   * Bulk student creation. Rows are checked in input order (`line` is 1-based): username format,
   * then a case-insensitive duplicate of an earlier line (the first occurrence wins), then the
   * password rule, then an existing account. Each row that passes is created in its own
   * transaction, so one failing row never undoes the others. `dryRun` reports the same verdicts
   * and writes nothing. A blank password gets a generated one (forced change on first login)
   * that appears only in this response; a typed password is never echoed back. Hashes are
   * computed one after another with async scrypt (about 18 ms each, so a 500-row batch takes
   * roughly 9 s) off the event loop, so other requests keep being served meanwhile.
   */
  async bulkCreate(actorId: string, rows: BulkRowInput[], dryRun = false): Promise<BulkResult> {
    const firstLine = new Map<string, number>();
    const results: BulkRowResult[] = [];
    for (const [index, row] of rows.entries()) {
      const line = index + 1;
      const username = row.username.trim();
      const verdict = (status: BulkRowResult['status'], message?: string) =>
        results.push({ line, username, status, ...(message ? { message } : {}) });
      if (!USERNAME_PATTERN.test(username)) {
        verdict('invalid', 'Tên đăng nhập phải có 3–50 ký tự: chữ, số, dấu _ hoặc -.');
        continue;
      }
      const key = normalizeUsername(username);
      const earlier = firstLine.get(key);
      if (earlier !== undefined) {
        verdict('duplicate', `Trùng tên đăng nhập với dòng ${earlier}.`);
        continue;
      }
      firstLine.set(key, line);
      const typed = row.password && row.password.trim() ? row.password : undefined;
      if (typed !== undefined && typed.length < passwordMinFor(STUDENT)) {
        verdict('invalid', `Mật khẩu phải có ít nhất ${passwordMinFor(STUDENT)} ký tự.`);
        continue;
      }
      if (dryRun) {
        if (await findUserByUsername(this.db, username)) verdict('duplicate', TAKEN);
        else verdict('created');
        continue;
      }
      const temporaryPassword = typed === undefined ? generateTempPassword(STUDENT) : undefined;
      const outcome = await this.createStudent(actorId, {
        username,
        displayName: row.displayName?.trim() || null,
        passwordHash: await passwordHashAsync(typed ?? temporaryPassword!),
        mustChangePassword: temporaryPassword !== undefined,
      });
      if (outcome === 'created')
        results.push({
          line,
          username,
          status: 'created',
          ...(temporaryPassword ? { temporaryPassword } : {}),
        });
      else if (outcome === 'duplicate') verdict('duplicate', TAKEN);
      else verdict('invalid', 'Không tạo được tài khoản này, vui lòng thử lại.');
    }
    const count = (status: BulkRowResult['status']) =>
      results.filter((r) => r.status === status).length;
    const summary = {
      created: count('created'),
      skipped: count('duplicate'),
      failed: count('invalid'),
    };
    if (!dryRun)
      await this.db.audit.create({
        data: { actorId, action: 'user.bulk-create', targetId: 'users', detail: summary },
      });
    return { dryRun, ...summary, rows: results };
  }

  /** One row of a bulk create, in its own transaction; a lost unique-index race is a duplicate. */
  private async createStudent(
    actorId: string,
    data: {
      username: string;
      displayName: string | null;
      passwordHash: string;
      mustChangePassword: boolean;
    },
  ): Promise<'created' | 'duplicate' | 'failed'> {
    try {
      return await this.db.$transaction(async (tx) => {
        if (await findUserByUsername(tx, data.username)) return 'duplicate' as const;
        const row = await tx.user.create({
          data: { ...data, role: STUDENT },
          select: { id: true },
        });
        await tx.audit.create({
          data: {
            actorId,
            action: 'user.create',
            targetId: row.id,
            detail: { role: STUDENT, bulk: true },
          },
        });
        return 'created' as const;
      });
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      if (code === 'P2002') return 'duplicate';
      // Only the error code: messages from the driver may echo the row's values.
      this.logger.error(
        `bulk create: a row failed (${typeof code === 'string' ? code : 'no code'})`,
      );
      return 'failed';
    }
  }

  /**
   * The acting admin may have been locked or deleted after its request passed the guards: read its
   * row inside the same Serializable transaction (so a concurrent lock of the actor conflicts) and
   * answer like an expired session, exactly as the guards do.
   */
  private async requireActiveActor(tx: Tx, actorId: string) {
    const actor = await tx.user.findUnique({
      where: { id: actorId },
      select: { id: true, disabledAt: true },
    });
    if (!actor || actor.disabledAt) throw new UnauthorizedException(SESSION_EXPIRED);
  }

  /**
   * Refuses a change that would leave no active admin (counted inside the caller's transaction).
   *
   * WARNING: the last-admin guarantee holds only because every write that can remove an active
   * admin runs in a Serializable transaction that calls this check with that same `tx`. Every
   * future writer of `role` or `disabledAt` (role change, bulk lock, import, maintenance script)
   * MUST do the same: a plain update, a separate transaction or a weaker isolation level silently
   * breaks the guarantee under concurrency.
   */
  private async keepAnActiveAdmin(
    tx: Tx,
    user: { id: string; role: string; disabledAt: Date | null },
    verb: string,
  ) {
    if (user.role !== 'admin' || user.disabledAt) return;
    const others = await tx.user.count({
      where: { role: 'admin', disabledAt: null, id: { not: user.id } },
    });
    if (others < 1)
      throw new BadRequestException(`Không thể ${verb} quản trị viên đang hoạt động cuối cùng.`);
  }
}
