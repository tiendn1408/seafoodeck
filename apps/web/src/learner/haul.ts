import type { ReviewState } from '../domain/models';
import type { CatalogOverview } from '../pilot/api';

export type GroupKey = 'fish' | 'crustacean' | 'mollusc' | 'other' | 'none';
const TONES: Record<GroupKey, string> = {
  fish: 'Cá',
  crustacean: 'Giáp xác',
  mollusc: 'Nhuyễn thể',
  other: 'Khác',
  none: 'Chưa phân nhóm',
};
export function groupTone(g: string | null | undefined): {
  key: GroupKey;
  label: string;
  css: string;
} {
  const key: GroupKey = g && g in TONES && g !== 'none' ? (g as GroupKey) : 'none';
  return { key, label: TONES[key], css: `var(--group-${key})` };
}

const current = (o: CatalogOverview, reviews: ReviewState[]) =>
  reviews.filter((r) => r.contentVersion === o.releaseId);
const learnSkill = (s: string) => s.startsWith('name:') || s.startsWith('match:') || s === 'image';
const dueTime = (r: ReviewState) => Date.parse(r.dueAt);

function itemReviews(itemId: string, reviews: ReviewState[]) {
  return reviews.filter((r) => r.targetId === itemId && learnSkill(r.skill));
}
function statusIn(itemId: string, scoped: ReviewState[], now: number): 'new' | 'due' | 'learning' {
  const rs = itemReviews(itemId, scoped);
  if (!rs.length) return 'new';
  return rs.some((r) => dueTime(r) <= now) ? 'due' : 'learning';
}
/** Status of an item. Pass reviews already scoped to the release (see planCast/pickHaul). */
export function itemStatus(
  itemId: string,
  reviews: ReviewState[],
  now: number,
): 'new' | 'due' | 'learning' {
  return statusIn(itemId, reviews, now);
}

export function pickHaul(
  o: CatalogOverview,
  reviews: ReviewState[],
  now: number,
  max = 5,
): CatalogOverview['items'] {
  const scoped = current(o, reviews);
  const due: { item: CatalogOverview['items'][number]; at: number }[] = [];
  const fresh: CatalogOverview['items'] = [];
  for (const item of o.items) {
    const s = statusIn(item.itemId, scoped, now);
    if (s === 'new') fresh.push(item);
    else if (s === 'due')
      due.push({
        item,
        at: Math.min(...itemReviews(item.itemId, scoped).map(dueTime)),
      });
  }
  due.sort((a, b) => a.at - b.at);
  return [...due.map((d) => d.item), ...fresh].slice(0, max);
}

export type CastPlan =
  | { kind: 'review'; targets: { targetId: string; skill: string }[] }
  | { kind: 'flashcard'; revisionId: string }
  | { kind: 'done' };
export function planCast(o: CatalogOverview, reviews: ReviewState[], now: number): CastPlan {
  const scoped = current(o, reviews);
  const dueRows = scoped.filter((r) => dueTime(r) <= now).sort((a, b) => dueTime(a) - dueTime(b));
  if (dueRows.length)
    return {
      kind: 'review',
      targets: dueRows.slice(0, 8).map((r) => ({ targetId: r.targetId, skill: r.skill })),
    };
  const fresh = o.items.find((i) => statusIn(i.itemId, scoped, now) === 'new');
  return fresh ? { kind: 'flashcard', revisionId: fresh.revisionId } : { kind: 'done' };
}

export function skillProgress(
  o: CatalogOverview,
  reviews: ReviewState[],
): { key: 'en' | 'ja' | 'scientific' | 'hs'; label: string; done: number; total: number }[] {
  const scoped = current(o, reviews).filter((r) => r.stage >= 1);
  const lang = (k: 'en' | 'ja' | 'scientific', label: string) => ({
    key: k,
    label,
    done: new Set(
      scoped
        .filter((r) => r.skill === `name:${k}` || r.skill === `match:${k}`)
        .map((r) => r.targetId),
    ).size,
    total: o.learnable,
  });
  return [
    lang('en', 'Tiếng Anh'),
    lang('ja', 'Tiếng Nhật'),
    lang('scientific', 'Tên khoa học'),
    {
      key: 'hs',
      label: 'HS dạng hàng',
      done: scoped.filter((r) => r.skill === 'hs').length,
      total: o.hsCases,
    },
  ];
}

export function masteryLevel(reviews: ReviewState[], itemId: string): 0 | 1 | 2 | 3 | 4 {
  const rs = reviews.filter((r) => r.targetId === itemId);
  if (!rs.length) return 0;
  return (Math.min(3, Math.max(...rs.map((r) => r.stage))) + 1) as 1 | 2 | 3 | 4;
}

/** How many species of the release sit at each mastery level: index 0 (not studied) to 4. */
export function masteryCounts(o: CatalogOverview, reviews: ReviewState[]): number[] {
  const scoped = current(o, reviews);
  const counts = [0, 0, 0, 0, 0];
  for (const item of o.items) counts[masteryLevel(scoped, item.itemId)]++;
  return counts;
}
