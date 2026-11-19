import { effectiveDueAt } from './progress-review';
import type { ReviewRow } from './progress-review';

export interface OverviewItem {
  revisionId: string;
  itemId: string;
  vi: string;
  scientific: string;
  taxonomicGroup: string | null;
  imageId: string | null;
}
export interface OverviewData {
  items: OverviewItem[];
  learnable: number;
  hsCases: number;
}
/** Current content fingerprint of a target; undefined when it no longer exists. */
export type VersionOf = (targetId: string) => string | undefined;

export type CastPlan =
  | { kind: 'review'; targets: { targetId: string; skill: string }[] }
  | { kind: 'flashcard'; revisionId: string }
  | { kind: 'done' };

/** Skills that count toward "learning/solid" (listening is excluded). */
const learnSkill = (s: string) =>
  s.startsWith('name:') || s.startsWith('match:') || s === 'image' || s === 'hs';
const due = (r: ReviewRow) => Date.parse(effectiveDueAt(r));

export function activeRows(rows: ReviewRow[], versionOf: VersionOf): ReviewRow[] {
  return rows.filter((r) => {
    const v = versionOf(r.targetId);
    return v !== undefined && v === r.contentVersion;
  });
}

const itemRows = (itemId: string, rows: ReviewRow[]) =>
  rows.filter((r) => r.targetId === itemId && learnSkill(r.skill));

export function itemStatus(
  itemId: string,
  rows: ReviewRow[],
  now: number,
): 'new' | 'due' | 'learning' {
  const rs = itemRows(itemId, rows);
  if (!rs.length) return 'new';
  return rs.some((r) => due(r) <= now) ? 'due' : 'learning';
}

export function dueTargets(
  rows: ReviewRow[],
  now: number,
  limit: number,
): { targetId: string; skill: string }[] {
  return rows
    .map((r) => ({ r, at: due(r) }))
    .filter((x) => x.at <= now)
    .sort((a, b) => a.at - b.at)
    .slice(0, limit)
    .map(({ r }) => ({ targetId: r.targetId, skill: r.skill }));
}

export function pickHaul(o: OverviewData, rows: ReviewRow[], now: number, max = 5): OverviewItem[] {
  const dueItems: { item: OverviewItem; at: number }[] = [];
  const fresh: OverviewItem[] = [];
  for (const item of o.items) {
    const s = itemStatus(item.itemId, rows, now);
    if (s === 'new') fresh.push(item);
    else if (s === 'due')
      dueItems.push({ item, at: Math.min(...itemRows(item.itemId, rows).map(due)) });
  }
  dueItems.sort((a, b) => a.at - b.at);
  return [...dueItems.map((d) => d.item), ...fresh].slice(0, max);
}

export function planCast(o: OverviewData, rows: ReviewRow[], now: number): CastPlan {
  const targets = dueTargets(rows, now, 8);
  if (targets.length) return { kind: 'review', targets };
  const fresh = o.items.find((i) => itemStatus(i.itemId, rows, now) === 'new');
  return fresh ? { kind: 'flashcard', revisionId: fresh.revisionId } : { kind: 'done' };
}

export function skillProgress(
  o: OverviewData,
  rows: ReviewRow[],
): { key: 'en' | 'ja' | 'scientific' | 'hs'; label: string; done: number; total: number }[] {
  const scoped = rows.filter((r) => r.stage >= 1);
  const itemIds = new Set(o.items.map((i) => i.itemId));
  const lang = (k: 'en' | 'ja' | 'scientific', label: string) => ({
    key: k,
    label,
    done: Math.min(
      o.learnable,
      new Set(
        scoped
          .filter(
            (r) => itemIds.has(r.targetId) && (r.skill === `name:${k}` || r.skill === `match:${k}`),
          )
          .map((r) => r.targetId),
      ).size,
    ),
    total: o.learnable,
  });
  return [
    lang('en', 'Tiếng Anh'),
    lang('ja', 'Tiếng Nhật'),
    lang('scientific', 'Tên khoa học'),
    {
      key: 'hs',
      label: 'HS dạng hàng',
      done: Math.min(o.hsCases, scoped.filter((r) => r.skill === 'hs').length),
      total: o.hsCases,
    },
  ];
}

export function masteryLevel(rows: ReviewRow[], itemId: string): 0 | 1 | 2 | 3 | 4 {
  const rs = rows.filter((r) => r.targetId === itemId);
  if (!rs.length) return 0;
  return (Math.min(3, Math.max(...rs.map((r) => r.stage))) + 1) as 1 | 2 | 3 | 4;
}

export function masteryCounts(
  o: OverviewData,
  rows: ReviewRow[],
): { unlearned: number; level1: number; level2: number; level3: number; level4: number } {
  const c = [0, 0, 0, 0, 0];
  for (const item of o.items) c[masteryLevel(rows, item.itemId)]++;
  return { unlearned: c[0], level1: c[1], level2: c[2], level3: c[3], level4: c[4] };
}
