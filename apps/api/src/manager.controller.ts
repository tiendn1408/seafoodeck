import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  ApiCookieAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { Db } from './db';
import { localMinute, toCsv } from './csv';
import {
  LearnerPageResponse,
  ManagerLearnerResponse,
  MeMasteryEntryResponse,
  MeProgressResponse,
  MeReviewResponse,
} from './contract';
import { ProgressService } from './progress.service';
import type { LearnerMetrics } from './progress-manager';
import { inLast7Days } from './progress-manager';
import { AccessGuard, ActorRequest, requireManager } from './security';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const bool = ({ value }: { value: unknown }) => value === true || value === 'true';
export const LEARNER_SORTS = [
  'name',
  'lastStudyAt',
  'learning',
  'solid',
  'avgLevel',
  'overdue',
  'sessions7d',
] as const;
type LearnerSort = (typeof LEARNER_SORTS)[number];
export const LEARNER_FILTERS = ['idle7d', 'overdue', 'disabled'] as const;
export const MAX_LEARNER_LIMIT = 200;
export const DEFAULT_LEARNER_LIMIT = 50;

export class LearnersQuery {
  @ApiProperty({ required: false, enum: LEARNER_SORTS, default: 'lastStudyAt' })
  @IsOptional()
  @IsIn(LEARNER_SORTS)
  sort?: LearnerSort;
  @ApiProperty({ required: false, enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc';
  @ApiProperty({
    required: false,
    enum: LEARNER_FILTERS,
    description: 'idle7d: no answer in 7 days (never-studied included); overdue; disabled.',
  })
  @IsOptional()
  @IsIn(LEARNER_FILTERS)
  filter?: (typeof LEARNER_FILTERS)[number];
  @ApiProperty({ required: false, maxLength: 80 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
  @ApiProperty({ required: false, default: 1, minimum: 1, maximum: 1_000_000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  page?: number;
  @ApiProperty({ required: false, default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
  @ApiProperty({ required: false, default: false })
  @Transform(bool)
  @IsOptional()
  includeDisabled?: boolean;
}

interface LearnerRow extends LearnerMetrics {
  id: string;
  username: string;
  displayName: string | null;
  disabled: boolean;
}
const collator = new Intl.Collator('vi', { sensitivity: 'base' });
const lower = (s: string) => s.toLowerCase();
const sortKey = (r: LearnerRow, sort: LearnerSort): number | string | null =>
  sort === 'name'
    ? r.displayName?.trim() || r.username
    : sort === 'lastStudyAt'
      ? r.lastStudyAt === null
        ? null
        : Date.parse(r.lastStudyAt)
      : r[sort];
const posInt = (v: unknown, fallback: number, max: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, max) : fallback;
};

/**
 * Read-only per-learner views for managers and admins. Progress reuses ProgressService, so each
 * response is the same JSON `/me/*` returns for that learner. Only `student` accounts are
 * addressable (any other id, including the caller's, is 404); locked students stay visible.
 */
@ApiTags('Manager')
@ApiExtraModels(MeMasteryEntryResponse)
@UseGuards(AccessGuard)
@ApiCookieAuth('seafoodeck_session')
@Controller('manager')
export class ManagerController {
  constructor(
    private db: Db,
    private svc: ProgressService,
  ) {}
  /** Overridable clock so tests can pin time. */
  now = () => Date.now();

  /**
   * Every matching student with figures. `q`, locked state and the filters run in memory over the
   * already-loaded student set (pilot scale), so `%`/`_` in `q` are literal and nothing reaches SQL.
   * Queries: students, progress rows, non-skipped attempts (+ the fixed catalog reads), whatever
   * the learner count.
   */
  private async table(req: ActorRequest, query: LearnersQuery): Promise<LearnerRow[]> {
    requireManager(req);
    const now = this.now();
    const q = lower((query.q ?? '').trim());
    const students = (await this.db.user.findMany({ where: { role: 'student' } })).filter((u) => {
      const locked = u.disabledAt !== null;
      if (query.filter === 'disabled') {
        if (!locked) return false;
      } else if (locked && !query.includeDisabled) return false;
      return !q || lower(u.username).includes(q) || lower(u.displayName ?? '').includes(q);
    });
    const metrics = await this.svc.learnerMetricsBatch(
      req.actor,
      students.map((u) => u.id),
      now,
    );
    const rows = students.map((u): LearnerRow => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      disabled: u.disabledAt !== null,
      ...metrics.get(u.id)!,
    }));
    const kept = rows.filter((r) =>
      query.filter === 'idle7d'
        ? r.lastStudyAt === null || !inLast7Days(r.lastStudyAt, now)
        : query.filter === 'overdue'
          ? r.overdue > 0
          : true,
    );
    const sort = query.sort ?? 'lastStudyAt';
    const dir = (query.dir ?? (sort === 'name' ? 'asc' : 'desc')) === 'asc' ? 1 : -1;
    return kept.sort((a, b) => {
      const x = sortKey(a, sort);
      const y = sortKey(b, sort);
      if (x === null || y === null) {
        if (x !== y) return x === null ? 1 : -1; // nulls last in both directions
      } else if (x !== y) {
        const c =
          typeof x === 'string' ? collator.compare(x, y as string) : (x as number) - (y as number);
        if (c !== 0) return c * dir;
      }
      const ua = lower(a.username);
      const ub = lower(b.username);
      return ua < ub ? -1 : ua > ub ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  @ApiOkResponse({ type: LearnerPageResponse })
  @Get('learners')
  async learners(@Req() req: ActorRequest, @Query() query: LearnersQuery) {
    const all = await this.table(req, query);
    const limit = posInt(query.limit, DEFAULT_LEARNER_LIMIT, MAX_LEARNER_LIMIT);
    const page = posInt(query.page, 1, 1_000_000);
    return { items: all.slice((page - 1) * limit, page * limit), total: all.length, page, limit };
  }

  @ApiOkResponse({
    description: 'Same filters and sort as the table, without pagination (UTF-8 CSV with BOM).',
    content: { 'text/csv': { schema: { type: 'string' } } },
  })
  @Get('learners.csv')
  async learnersCsv(
    @Req() req: ActorRequest,
    @Query() query: LearnersQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const all = await this.table(req, query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="hoc-vien.csv"');
    return toCsv(
      [
        'Tên đăng nhập',
        'Tên hiển thị',
        'Đang học',
        'Đã vững',
        'Mức nhớ TB',
        'Lần học cuối',
        'Quá hạn',
        'Phiên 7 ngày',
        'Trạng thái',
      ],
      all.map((r) => [
        r.username,
        r.displayName,
        r.learning,
        r.solid,
        r.avgLevel,
        localMinute(r.lastStudyAt),
        r.overdue,
        r.sessions7d,
        r.disabled ? 'Đã khóa' : 'Đang hoạt động',
      ]),
    );
  }

  private async student(req: ActorRequest, id: string) {
    requireManager(req);
    const user = await this.db.user.findUnique({ where: { id } });
    if (!user || user.role !== 'student') throw new NotFoundException('Không tìm thấy học viên.');
    return user;
  }
  @ApiOkResponse({ type: ManagerLearnerResponse })
  @Get('learners/:id')
  async learner(@Req() req: ActorRequest, @Param('id') id: string) {
    const u = await this.student(req, id);
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      disabled: u.disabledAt !== null,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    };
  }
  @ApiOkResponse({ type: MeReviewResponse })
  @Get('learners/:id/review')
  async review(@Req() req: ActorRequest, @Param('id') id: string) {
    return this.svc.review(req.actor, this.now(), (await this.student(req, id)).id);
  }
  @ApiOkResponse({ type: MeProgressResponse })
  @Get('learners/:id/progress')
  async progress(@Req() req: ActorRequest, @Param('id') id: string) {
    return this.svc.progress(req.actor, this.now(), (await this.student(req, id)).id);
  }
  @ApiOkResponse({
    description: 'Status and mastery level per itemId of the current catalog.',
    schema: {
      type: 'object',
      additionalProperties: { $ref: getSchemaPath(MeMasteryEntryResponse) },
    },
  })
  @Get('learners/:id/mastery')
  async mastery(@Req() req: ActorRequest, @Param('id') id: string) {
    return this.svc.mastery(req.actor, this.now(), (await this.student(req, id)).id);
  }
}
