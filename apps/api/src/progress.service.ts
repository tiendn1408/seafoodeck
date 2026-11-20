import { Injectable } from '@nestjs/common';
import type { AuthSession } from './generated/prisma/client';
import { Db } from './db';
import { Catalog } from './catalog';
import { itemFingerprint, scenarioFingerprint } from './progress-fingerprint';
import {
  activeRows,
  dueTargets,
  itemStatus,
  masteryCounts,
  masteryLevel,
  pickHaul,
  planCast,
  skillProgress,
} from './progress-derive';
import type { OverviewData, VersionOf } from './progress-derive';
import { badges, figures, recentSessions, streakDays } from './progress-achievements';
import type { LogRow } from './progress-achievements';
import { DAY, effectiveDueAt } from './progress-review';
import type { ReviewRow } from './progress-review';

/** Name kinds that make up an item's content fingerprint (same as the submit log). */
export const FINGERPRINT_KINDS = ['vi', 'en', 'ja', 'scientific'];
/** Safety bound on due rows tried when building one server-chosen review session. */
export const REVIEW_CANDIDATES = 100;
/** Item id of a target: listening targets carry a `/listening/<kind>` suffix. */
export const itemOf = (targetId: string) => targetId.split('/listening/')[0];
/** Progress rows are written only for account students. */
export const studentId = (actor: AuthSession) =>
  actor.role === 'student' && actor.userId ? actor.userId : null;

interface ProgressRecord {
  targetId: string;
  skill: string;
  stage: number;
  dueAt: Date;
  lastAttemptAt: Date;
  lastSessionId: string;
  contentVersion: string;
  selfRated: boolean;
}
const toRow = (p: ProgressRecord): ReviewRow => ({
  targetId: p.targetId,
  skill: p.skill,
  stage: p.stage,
  dueAt: p.dueAt.toISOString(),
  lastSessionId: p.lastSessionId,
  contentVersion: p.contentVersion,
  selfRated: p.selfRated,
  lastAttemptAt: p.lastAttemptAt.toISOString(),
});

export interface ProgressEntry {
  targetId: string;
  skill: string;
  stage: number;
  dueAt: string;
  level: 0 | 1 | 2 | 3 | 4;
}
interface GradedResult {
  targetId?: string;
  targetLabel?: string;
  skill?: string;
  correct?: boolean;
  skipped?: boolean;
  items?: { targetId: string; label?: string; correct?: boolean }[];
}

/** Review rows a graded result touched: none when skipped, one per pair for matching. */
export function touchedTargets(result: GradedResult): { targetId: string; skill: string }[] {
  if (result.skipped || !result.skill) return [];
  if (result.items)
    return result.items.map((i) => ({ targetId: i.targetId, skill: result.skill! }));
  return result.targetId ? [{ targetId: result.targetId, skill: result.skill }] : [];
}

/** Whole days until the row's effective due date, rounded up, never negative. */
export function nextReviewInDays(row: ReviewRow, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(effectiveDueAt(row)) - now) / DAY));
}

export interface SessionSummary {
  total: number;
  caught: number;
  entries: {
    targetId: string;
    label: string;
    correct: boolean;
    skipped: boolean;
    nextReviewInDays: number | null;
  }[];
}
/**
 * Summary of a session from its graded results (null = unanswered, left out). A matching question
 * contributes one entry per pair. `caught` counts entries that are correct and not skipped.
 * `rows` are the student's active progress rows, or null for sessions without an account.
 */
export function summarize(
  results: unknown[],
  rows: ReviewRow[] | null,
  now: number,
): SessionSummary {
  const next = (targetId: string, skill: string | undefined, skipped: boolean) => {
    if (!rows || skipped) return null;
    const row = rows.find((r) => r.targetId === targetId && r.skill === skill);
    return row ? nextReviewInDays(row, now) : null;
  };
  const entries = results.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const r = value as GradedResult;
    const skipped = r.skipped === true;
    if (r.items && !skipped)
      return r.items.map((i) => ({
        targetId: i.targetId,
        label: i.label ?? '',
        correct: i.correct === true,
        skipped: false,
        nextReviewInDays: next(i.targetId, r.skill, false),
      }));
    const targetId = r.targetId ?? '';
    return [
      {
        targetId,
        label: r.targetLabel ?? '',
        correct: !skipped && r.correct === true,
        skipped,
        nextReviewInDays: next(targetId, r.skill, skipped),
      },
    ];
  });
  return {
    total: entries.length,
    caught: entries.filter((e) => e.correct && !e.skipped).length,
    entries,
  };
}

@Injectable()
export class ProgressService {
  constructor(
    private db: Db,
    private catalog: Catalog,
  ) {}

  /** Current content fingerprints of the actor's release: items by Item id, HS by scenario id. */
  private async versions(actor: AuthSession) {
    const release = await this.catalog.current(actor);
    const revisions = await this.db.revision.findMany({
      where: { releases: { some: { releaseId: release.id } } },
      include: { names: true },
    });
    const items = new Map<string, string>();
    for (const r of revisions)
      items.set(
        r.itemId,
        itemFingerprint(
          r.names
            .filter((n) => FINGERPRINT_KINDS.includes(n.kind))
            .map((n) => ({ kind: n.kind, label: n.label })),
        ),
      );
    const scenarios = await this.db.tradeScenario.findMany({
      where: {
        revisionId: { in: revisions.map((r) => r.id) },
        ...(!release.internal ? { status: 'approved' } : {}),
      },
    });
    const cases = new Map<string, string>();
    const scenarioRevision = new Map<string, string>();
    for (const s of scenarios) {
      cases.set(s.id, scenarioFingerprint(s.data as Parameters<typeof scenarioFingerprint>[0]));
      scenarioRevision.set(s.id, s.revisionId);
    }
    const versionOf: VersionOf = (id) => items.get(itemOf(id)) ?? cases.get(id);
    return { release, versionOf, scenarioRevision };
  }

  /** The student's ReviewProgress rows scoped to the current release (empty for non-students). */
  async active(actor: AuthSession) {
    const { release, versionOf, scenarioRevision } = await this.versions(actor);
    const userId = studentId(actor);
    const all = userId
      ? (await this.db.reviewProgress.findMany({ where: { userId } })).map(toRow)
      : [];
    return { release, versionOf, scenarioRevision, all, rows: activeRows(all, versionOf) };
  }

  async context(actor: AuthSession): Promise<{
    overview: OverviewData;
    rows: ReviewRow[];
    versionOf: VersionOf;
    scenarioRevision: Map<string, string>;
    releaseId: string;
    internal: boolean;
  }> {
    const o = await this.catalog.overview(actor);
    const { rows, versionOf, scenarioRevision } = await this.active(actor);
    return {
      overview: {
        items: o.items.map((i) => ({
          revisionId: i.revisionId,
          itemId: i.itemId,
          vi: i.vi,
          scientific: i.scientific,
          taxonomicGroup: i.taxonomicGroup,
          imageId: i.imageId,
        })),
        learnable: o.learnable,
        hsCases: o.hsCases,
      },
      rows,
      versionOf,
      scenarioRevision,
      releaseId: o.releaseId,
      internal: o.internal,
    };
  }

  /** Targets due by effective due date, earliest first, at most `limit`. */
  async dueForReview(
    actor: AuthSession,
    limit: number,
    now = Date.now(),
  ): Promise<{ targetId: string; skill: string }[]> {
    if (!studentId(actor)) return [];
    const { rows } = await this.active(actor);
    return dueTargets(rows, now, limit);
  }

  /** Progress of the rows a graded result touched, read after the write (students only). */
  async afterSubmit(actor: AuthSession, result: unknown): Promise<ProgressEntry[]> {
    const touched = touchedTargets((result ?? {}) as GradedResult);
    if (!touched.length || !studentId(actor)) return [];
    const { all, rows } = await this.active(actor);
    return touched.flatMap((t) => {
      const row = all.find((r) => r.targetId === t.targetId && r.skill === t.skill);
      if (!row) return [];
      return [
        {
          targetId: row.targetId,
          skill: row.skill,
          stage: row.stage,
          dueAt: effectiveDueAt(row),
          level: masteryLevel(rows, itemOf(row.targetId)),
        },
      ];
    });
  }

  /** Active rows for a session summary; null for sessions without a student account. */
  async summaryRows(actor: AuthSession): Promise<ReviewRow[] | null> {
    if (!studentId(actor)) return null;
    return (await this.active(actor)).rows;
  }

  /**
   * Most recent unexpired game session of this login that still has an unanswered question.
   * Scoped to the session (`actorId`), since only the owning login can resume it.
   */
  private async resumable(actor: AuthSession, now: number): Promise<string | null> {
    const s = await this.db.gameSession.findFirst({
      where: {
        actorId: actor.id,
        expiresAt: { gt: new Date(now) },
        questions: { some: { attempt: { is: null } } },
        ...(!actor.internal ? { release: { internal: false } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return s?.id ?? null;
  }

  /** `due` counts active rows whose effective due date is at or before now. */
  async home(actor: AuthSession, now = Date.now()) {
    const c = await this.context(actor);
    return {
      releaseId: c.releaseId,
      internal: c.internal,
      learnable: c.overview.learnable,
      haul: pickHaul(c.overview, c.rows, now),
      cast: planCast(c.overview, c.rows, now),
      due: c.rows.filter((r) => Date.parse(effectiveDueAt(r)) <= now).length,
      skills: skillProgress(c.overview, c.rows),
      activeSessionId: await this.resumable(actor, now),
    };
  }

  /** Active rows split into due (effective due <= now) and scheduled, each earliest first. */
  async review(
    actor: AuthSession,
    now = Date.now(),
  ): Promise<{
    due: ReviewEntry[];
    scheduled: ReviewEntry[];
  }> {
    const c = await this.context(actor);
    const byItem = new Map(c.overview.items.map((i) => [i.itemId, i]));
    const byRevision = new Map(c.overview.items.map((i) => [i.revisionId, i]));
    const entries = c.rows
      .map((r): ReviewEntry => {
        const hs = r.skill === 'hs';
        const item = hs
          ? byRevision.get(c.scenarioRevision.get(r.targetId) ?? '')
          : byItem.get(itemOf(r.targetId));
        return {
          targetId: r.targetId,
          itemId: hs ? null : itemOf(r.targetId),
          label: item?.vi ?? (hs ? 'Hồ sơ HS' : 'Mục học'),
          skill: r.skill,
          stage: r.stage,
          dueAt: effectiveDueAt(r),
        };
      })
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
    return {
      due: entries.filter((e) => Date.parse(e.dueAt) <= now),
      scheduled: entries.filter((e) => Date.parse(e.dueAt) > now),
    };
  }

  /** The student's whole attempt log, oldest first. */
  private async log(actor: AuthSession): Promise<LogRow[]> {
    const userId = studentId(actor);
    if (!userId) return [];
    const rows = await this.db.learningAttempt.findMany({
      where: { userId },
      orderBy: { at: 'asc' },
    });
    return rows.map((r) => ({
      sessionId: r.sessionId,
      targetId: r.targetId,
      skill: r.skill,
      mode: r.mode,
      isReview: r.isReview,
      attemptNumber: r.attemptNumber,
      correct: r.correct,
      skipped: r.skipped,
      selfRated: r.selfRated,
      label: r.label,
      at: r.at.toISOString(),
    }));
  }

  async progress(actor: AuthSession, now = Date.now()) {
    const c = await this.context(actor);
    const log = await this.log(actor);
    const mastery = masteryCounts(c.overview, c.rows);
    const streak = streakDays(log, now);
    return {
      skills: skillProgress(c.overview, c.rows),
      mastery,
      sessions: recentSessions(log, 5),
      achievements: {
        streak,
        badges: badges({
          ...speciesSeen(log),
          lastAt: lastAnsweredAt(log),
          solid: solidSpecies(c.overview, c.rows),
          reviewSessions: new Set(log.filter((r) => r.isReview).map((r) => r.sessionId)).size,
          streak: streak.longest,
        }),
      },
      figures: figures(log),
    };
  }

  /** Status and mastery level of every item in the current catalog. */
  async mastery(
    actor: AuthSession,
    now = Date.now(),
  ): Promise<Record<string, { status: 'new' | 'due' | 'learning'; level: 0 | 1 | 2 | 3 | 4 }>> {
    const c = await this.context(actor);
    return Object.fromEntries(
      c.overview.items.map((i) => [
        i.itemId,
        { status: itemStatus(i.itemId, c.rows, now), level: masteryLevel(c.rows, i.itemId) },
      ]),
    );
  }
}

export interface ReviewEntry {
  targetId: string;
  /** Catalog item of an item target (listening suffix stripped); null for HS cases. */
  itemId: string | null;
  label: string;
  skill: string;
  stage: number;
  /** Effective due date (ISO). */
  dueAt: string;
}

/**
 * Distinct species answered (not skipped, HS cases excluded) and, for badge dating, one instant
 * per species: when it was first answered.
 */
export function speciesSeen(log: LogRow[]): { species: number; at: string[] } {
  const first = new Map<string, string>();
  for (const r of log) {
    if (r.skipped || r.skill === 'hs') continue;
    const id = itemOf(r.targetId);
    const seen = first.get(id);
    if (!seen || Date.parse(r.at) < Date.parse(seen)) first.set(id, r.at);
  }
  return { species: first.size, at: [...first.values()] };
}

/** Latest instant of a non-skipped log row (any skill, HS included); undefined when none. */
export function lastAnsweredAt(log: LogRow[]): string | undefined {
  let last: string | undefined;
  for (const r of log) {
    if (r.skipped) continue;
    if (!last || Date.parse(r.at) > Date.parse(last)) last = r.at;
  }
  return last;
}

/**
 * Catalog items remembered for a week or more: some active row at SRS stage >= 2 (7-day interval),
 * i.e. masteryLevel >= 3. Feeds the `solid50` badge ("50 loài ở mức nhớ ≥ 1 tuần").
 */
export function solidSpecies(o: OverviewData, rows: ReviewRow[]): number {
  return o.items.filter((i) => masteryLevel(rows, i.itemId) >= 3).length;
}
