import type { Prisma } from './generated/prisma/client';
import type { Db } from './db';
import { scheduleReview } from './progress-review';
import type { ReviewRow } from './progress-review';

export interface SubmitContext {
  userId: string;
  sessionId: string;
  questionId: string;
  mode: string;
  releaseId: string;
  reviewOfId: string | null;
  at: string;
}
export interface LogDraft {
  targetId: string;
  skill: string;
  correct: boolean;
  skipped: boolean;
  selfRated: boolean;
  label: string;
  contentVersion: string;
}
type LogRowDraft = LogDraft & { attemptNumber: number; isReview: boolean };

/** Pure: turns a graded result into durable log rows. attemptNumber/isReview come from the server context. */
export function buildLogRows(
  ctx: SubmitContext,
  result: {
    skill: string;
    skipped: boolean;
    correct: boolean;
    selfRated: boolean;
    targetId: string;
    targetLabel?: string;
    items?: { targetId: string; correct: boolean; label?: string }[];
  },
  versionOf: (targetId: string) => string | undefined,
): LogRowDraft[] {
  const attemptNumber = ctx.reviewOfId != null ? 2 : 1;
  const isReview = ctx.mode === 'review';
  const parts = result.items
    ? result.items.map((i) => ({ targetId: i.targetId, correct: i.correct, label: i.label }))
    : [{ targetId: result.targetId, correct: result.correct, label: result.targetLabel }];
  return parts.flatMap((p) => {
    const contentVersion = versionOf(p.targetId);
    if (contentVersion === undefined) return [];
    return [
      {
        targetId: p.targetId,
        skill: result.skill,
        correct: result.skipped ? false : p.correct,
        skipped: result.skipped,
        selfRated: result.selfRated,
        label: p.label ?? '',
        contentVersion,
        attemptNumber,
        isReview,
      },
    ];
  });
}

type ProgressRecord = {
  targetId: string;
  skill: string;
  stage: number;
  dueAt: Date;
  lastAttemptAt: Date;
  lastSessionId: string;
  contentVersion: string;
  selfRated: boolean;
};
const toReviewRow = (p: ProgressRecord): ReviewRow => ({
  targetId: p.targetId,
  skill: p.skill,
  stage: p.stage,
  dueAt: p.dueAt.toISOString(),
  lastSessionId: p.lastSessionId,
  contentVersion: p.contentVersion,
  selfRated: p.selfRated,
  lastAttemptAt: p.lastAttemptAt.toISOString(),
});
const toRecord = (userId: string, r: ReviewRow) => ({
  userId,
  targetId: r.targetId,
  skill: r.skill,
  stage: r.stage,
  dueAt: new Date(r.dueAt),
  lastAttemptAt: new Date(r.lastAttemptAt),
  lastSessionId: r.lastSessionId,
  contentVersion: r.contentVersion,
  selfRated: r.selfRated,
});

/**
 * Writes LearningAttempt rows (a duplicate (questionId, targetId) is skipped silently) and folds
 * each newly inserted, non-skipped row into ReviewProgress with scheduleReview. Must run inside the
 * same Serializable transaction as the grading Attempt. Returns the updated progress rows.
 */
export async function recordAttempt(
  tx: Prisma.TransactionClient,
  ctx: SubmitContext,
  rows: LogRowDraft[],
): Promise<ReviewRow[]> {
  const updated: ReviewRow[] = [];
  const at = new Date(ctx.at);
  for (const row of rows) {
    const { count } = await tx.learningAttempt.createMany({
      data: [
        {
          userId: ctx.userId,
          sessionId: ctx.sessionId,
          questionId: ctx.questionId,
          mode: ctx.mode,
          releaseId: ctx.releaseId,
          at,
          ...row,
        },
      ],
      skipDuplicates: true,
    });
    if (count === 0 || row.skipped) continue;
    const where = {
      userId_targetId_skill: { userId: ctx.userId, targetId: row.targetId, skill: row.skill },
    };
    const previous = await tx.reviewProgress.findUnique({ where });
    const next = scheduleReview(previous ? toReviewRow(previous) : undefined, {
      sessionId: ctx.sessionId,
      targetId: row.targetId,
      skill: row.skill,
      contentVersion: row.contentVersion,
      attemptNumber: row.attemptNumber,
      correct: row.correct,
      selfRated: row.selfRated,
      isReview: row.isReview,
      at: ctx.at,
    });
    const record = toRecord(ctx.userId, next);
    await tx.reviewProgress.upsert({ where, create: record, update: record });
    updated.push(next);
  }
  return updated;
}

async function rebuildIn(
  tx: Prisma.TransactionClient,
  userId?: string,
): Promise<{ users: number; rows: number }> {
  const logs = await tx.learningAttempt.findMany({
    where: { ...(userId !== undefined ? { userId } : {}), skipped: false },
    orderBy: [{ at: 'asc' }, { id: 'asc' }],
  });
  const state = new Map<string, { userId: string; row: ReviewRow }>();
  for (const log of logs) {
    const key = JSON.stringify([log.userId, log.targetId, log.skill]);
    const next = scheduleReview(state.get(key)?.row, {
      sessionId: log.sessionId,
      targetId: log.targetId,
      skill: log.skill,
      contentVersion: log.contentVersion,
      attemptNumber: log.attemptNumber,
      correct: log.correct,
      selfRated: log.selfRated,
      isReview: log.isReview,
      at: log.at.toISOString(),
    });
    state.set(key, { userId: log.userId, row: next });
  }
  await tx.reviewProgress.deleteMany({ where: userId !== undefined ? { userId } : {} });
  const data = [...state.values()].map((s) => toRecord(s.userId, s.row));
  if (data.length) await tx.reviewProgress.createMany({ data });
  return { users: new Set(data.map((d) => d.userId)).size, rows: data.length };
}

/** Rebuilds ReviewProgress from the LearningAttempt log in chronological order. */
export async function rebuildProgress(
  db: Db | Prisma.TransactionClient,
  userId?: string,
): Promise<{ users: number; rows: number }> {
  if ('$transaction' in db)
    return db.$transaction((tx) => rebuildIn(tx, userId), {
      isolationLevel: 'Serializable',
      timeout: 120_000,
    });
  return rebuildIn(db, userId);
}

const RETRIES = 6;
type Cause = { kind?: unknown; originalCode?: unknown; cause?: unknown } | null | undefined;
const writeConflict = (cause: Cause) =>
  !!cause && (cause.kind === 'TransactionWriteConflict' || cause.originalCode === '40001');
/**
 * Serialization conflicts: Prisma P2034 (statement time), or a pg adapter DriverAdapterError
 * raised at COMMIT, which has no `code` and carries TransactionWriteConflict / 40001 in `cause`.
 */
export function isSerializationConflict(e: unknown): boolean {
  const error = e as { code?: unknown; cause?: Cause } | null | undefined;
  if (!error || typeof error !== 'object') return false;
  if (error.code === 'P2034') return true;
  return writeConflict(error.cause) || writeConflict(error.cause?.cause as Cause);
}
/** Pause before retry n (0-based): random in a doubling window, 5-25 ms up to 100-200 ms. */
export function retryDelay(n: number, random: () => number = Math.random): number {
  const low = Math.min(5 * 2 ** n, 100);
  const high = Math.min(25 * 2 ** n, 200);
  return low + Math.floor(random() * (high - low + 1));
}
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** Runs fn, retrying up to 6 times on a serialization conflict with a growing jittered pause. */
export async function withSerializableRetry<T>(
  fn: () => Promise<T>,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isSerializationConflict(e) || attempt >= RETRIES) throw e;
      await wait(retryDelay(attempt));
    }
  }
}

/*
 * In-process keyed mutex: one student's grading transactions run one after another, so a double
 * tap does not make their Serializable transactions conflict with each other. It only covers this
 * API process; the pilot runs a single API container, so cross-instance locking is out of scope
 * (the Serializable retry above stays as the safety net).
 */
const userQueues = new Map<string, Promise<void>>();
export async function serializeByKey<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = userQueues.get(key) ?? Promise.resolve();
  const run = previous.then(fn);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  userQueues.set(key, tail);
  try {
    return await run;
  } finally {
    if (userQueues.get(key) === tail) userQueues.delete(key);
  }
}
/** Number of keys with queued or running work (for tests). */
export function pendingUserLocks(): number {
  return userQueues.size;
}
