/** Pure per-learner figures for the manager table. Imports only other progress-* files. */
import { dayKey } from './progress-achievements';
import type { LogRow } from './progress-achievements';
import { itemStatus, masteryLevel } from './progress-derive';
import type { OverviewData } from './progress-derive';
import type { ReviewRow } from './progress-review';

export interface LearnerMetrics {
  learning: number;
  solid: number;
  avgLevel: number | null;
  lastStudyAt: string | null;
  overdue: number;
  sessions7d: number;
}
/** Only these log fields are read, so callers may load a thin projection. */
export type MetricsLog = Pick<LogRow, 'sessionId' | 'skipped' | 'at'>;

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Math.floor(Date.parse(dayKey(iso) + 'T00:00:00Z') / DAY_MS);

/** Vietnam-day number of `now`; a learner counts as active in the 7 days ending today (inclusive). */
export const vnDay = (now: number) => dayNumber(new Date(now).toISOString());
export const inLast7Days = (iso: string, now: number) => {
  const d = dayNumber(iso);
  return d >= vnDay(now) - 6 && d <= vnDay(now);
};

/**
 * `rows` must already be scoped to the current release (active rows). `solid` is masteryLevel >= 3,
 * the same rule as ProgressService.solidSpecies (cross-checked in tests).
 */
export function learnerMetrics(
  o: OverviewData,
  rows: ReviewRow[],
  log: MetricsLog[],
  now: number,
): LearnerMetrics {
  let learning = 0;
  let solid = 0;
  let overdue = 0;
  let levelSum = 0;
  for (const i of o.items) {
    const status = itemStatus(i.itemId, rows, now);
    const level = masteryLevel(rows, i.itemId);
    if (level >= 3) solid++;
    if (status === 'new') continue;
    learning++;
    levelSum += level;
    if (status === 'due') overdue++;
  }
  let last: number | null = null;
  const sessions = new Set<string>();
  for (const r of log) {
    if (r.skipped) continue;
    const t = Date.parse(r.at);
    if (!isFinite(t)) continue;
    if (last === null || t > last) last = t;
    if (inLast7Days(r.at, now)) sessions.add(r.sessionId);
  }
  return {
    learning,
    solid,
    avgLevel: learning ? Math.round((levelSum / learning) * 10) / 10 : null,
    lastStudyAt: last === null ? null : new Date(last).toISOString(),
    overdue,
    sessions7d: sessions.size,
  };
}
