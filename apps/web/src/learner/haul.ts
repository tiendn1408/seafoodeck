import type { Attempt, ReviewState } from '../domain/models';
import { DAY, INTERVAL_DAYS } from '../domain/review';
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
  const key: GroupKey = g && g !== 'none' && Object.hasOwn(TONES, g) ? (g as GroupKey) : 'none';
  return { key, label: TONES[key], css: `var(--group-${key})` };
}

const current = (o: CatalogOverview, reviews: ReviewState[]) =>
  reviews.filter((r) => r.contentVersion === o.releaseId);
const learnSkill = (s: string) => s.startsWith('name:') || s.startsWith('match:') || s === 'image';

/** Latest non-skipped attempt time per release + target + skill, built once per attempts array. */
const lastCache = new WeakMap<readonly Attempt[], Map<string, number>>();
const lastKey = (version: string, targetId: string, skill: string) =>
  `${version}\u0000${targetId}\u0000${skill}`;
function lastAttempts(attempts: readonly Attempt[]) {
  let map = lastCache.get(attempts);
  if (!map) {
    map = new Map();
    for (const a of attempts) {
      if (a.skipped) continue;
      const key = lastKey(a.contentVersion, a.targetId, a.skill);
      const t = Date.parse(a.at);
      if (isFinite(t) && t > (map.get(key) ?? -Infinity)) map.set(key, t);
    }
    lastCache.set(attempts, map);
  }
  return map;
}

/**
 * When the learner UI treats a review as due. The stored `dueAt` never moves for a correct
 * answer that cannot advance the stage (a self-rated "Đã nhớ", a practice in the same
 * release), so it can sit in the past for good. A review practised after it fell due is
 * therefore due again only one stage interval after that practice. Scheduling itself
 * (`scheduleReview`) and the stored state are unchanged.
 */
export function effectiveDueAt(review: ReviewState, attempts: readonly Attempt[]): number {
  const stored = Date.parse(review.dueAt);
  const last = lastAttempts(attempts).get(
    lastKey(review.contentVersion, review.targetId, review.skill),
  );
  if (last === undefined) return stored;
  const days = INTERVAL_DAYS[Math.min(Math.max(review.stage, 0), INTERVAL_DAYS.length - 1)];
  return Math.max(stored, last + days * DAY);
}
export function isDue(review: ReviewState, attempts: readonly Attempt[], now: number) {
  return effectiveDueAt(review, attempts) <= now;
}

/** Reviews split into due now and scheduled later, each sorted by effective due time. */
export function splitDue(reviews: ReviewState[], attempts: readonly Attempt[], now: number) {
  const rows = reviews
    .map((review) => ({ review, at: effectiveDueAt(review, attempts) }))
    .sort((a, b) => a.at - b.at);
  return { due: rows.filter((r) => r.at <= now), later: rows.filter((r) => r.at > now) };
}

function itemReviews(itemId: string, reviews: ReviewState[]) {
  return reviews.filter((r) => r.targetId === itemId && learnSkill(r.skill));
}
function statusIn(
  itemId: string,
  scoped: ReviewState[],
  attempts: readonly Attempt[],
  now: number,
): 'new' | 'due' | 'learning' {
  const rs = itemReviews(itemId, scoped);
  if (!rs.length) return 'new';
  return rs.some((r) => isDue(r, attempts, now)) ? 'due' : 'learning';
}
/** Status of an item. Pass reviews already scoped to the release (see planCast/pickHaul). */
export function itemStatus(
  itemId: string,
  reviews: ReviewState[],
  attempts: readonly Attempt[],
  now: number,
): 'new' | 'due' | 'learning' {
  return statusIn(itemId, reviews, attempts, now);
}

export function pickHaul(
  o: CatalogOverview,
  reviews: ReviewState[],
  attempts: readonly Attempt[],
  now: number,
  max = 5,
): CatalogOverview['items'] {
  const scoped = current(o, reviews);
  const due: { item: CatalogOverview['items'][number]; at: number }[] = [];
  const fresh: CatalogOverview['items'] = [];
  for (const item of o.items) {
    const s = statusIn(item.itemId, scoped, attempts, now);
    if (s === 'new') fresh.push(item);
    else if (s === 'due')
      due.push({
        item,
        at: Math.min(...itemReviews(item.itemId, scoped).map((r) => effectiveDueAt(r, attempts))),
      });
  }
  due.sort((a, b) => a.at - b.at);
  return [...due.map((d) => d.item), ...fresh].slice(0, max);
}

export type CastPlan =
  | { kind: 'review'; targets: { targetId: string; skill: string }[] }
  | { kind: 'flashcard'; revisionId: string }
  | { kind: 'done' };
export function planCast(
  o: CatalogOverview,
  reviews: ReviewState[],
  attempts: readonly Attempt[],
  now: number,
): CastPlan {
  const scoped = current(o, reviews);
  const dueRows = splitDue(scoped, attempts, now).due;
  if (dueRows.length)
    return {
      kind: 'review',
      targets: dueRows
        .slice(0, 8)
        .map(({ review: r }) => ({ targetId: r.targetId, skill: r.skill })),
    };
  const fresh = o.items.find((i) => statusIn(i.itemId, scoped, attempts, now) === 'new');
  return fresh ? { kind: 'flashcard', revisionId: fresh.revisionId } : { kind: 'done' };
}

export function skillProgress(
  o: CatalogOverview,
  reviews: ReviewState[],
): { key: 'en' | 'ja' | 'scientific' | 'hs'; label: string; done: number; total: number }[] {
  const scoped = current(o, reviews).filter((r) => r.stage >= 1);
  // Only species of this release count: stale or non-item targetIds never inflate `done`.
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
