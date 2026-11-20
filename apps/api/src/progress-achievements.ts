/** Pure achievements, streaks and session history over rows of the learning attempt log. */

export interface LogRow {
  sessionId: string;
  targetId: string;
  skill: string;
  mode: string;
  isReview: boolean;
  attemptNumber: number;
  correct: boolean;
  skipped: boolean;
  selfRated: boolean;
  label: string;
  at: string;
}

const VN_OFFSET_MS = 7 * 3600_000; // Asia/Ho_Chi_Minh, UTC+7, no DST
const DAY_MS = 86_400_000;

/** 'YYYY-MM-DD' of an instant in Vietnam time, independent of the server timezone. */
export function dayKey(iso: string): string {
  return new Date(Date.parse(iso) + VN_OFFSET_MS).toISOString().slice(0, 10);
}

const dayNumber = (key: string) => Math.floor(Date.parse(key + 'T00:00:00Z') / DAY_MS);

/**
 * Days with at least one non-skipped row. `current` is the run ending today or yesterday
 * (Vietnam time); once a whole day has been missed it is 0, while `longest` is kept.
 */
export function streakDays(rows: LogRow[], now: number): { current: number; longest: number } {
  const days = [
    ...new Set(
      rows.filter((r) => !r.skipped && isFinite(Date.parse(r.at))).map((r) => dayKey(r.at)),
    ),
  ]
    .map(dayNumber)
    .sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i] === days[i - 1]! + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const today = dayNumber(new Date(now + VN_OFFSET_MS).toISOString().slice(0, 10));
  const last = days[days.length - 1];
  return { current: last !== undefined && last >= today - 1 ? run : 0, longest };
}

export interface SessionSummary {
  sessionId: string;
  at: string;
  mode: string;
  answered: number;
  firstTry: number;
  selfRated: number;
  percent: number | null;
}

function modeOf(rows: LogRow[]): string {
  if (rows.some((r) => r.isReview)) return 'review';
  const skill = rows[0]!.skill;
  if (skill.startsWith('name:')) return 'flashcard';
  if (skill.startsWith('match:')) return 'match';
  if (skill === 'image') return 'image';
  if (skill === 'hs') return 'hs';
  return 'listening';
}

/** Latest sessions, newest first; same split as the web Progress history. */
export function recentSessions(rows: LogRow[], limit = 5): SessionSummary[] {
  const bySession = new Map<string, LogRow[]>();
  for (const r of rows) bySession.set(r.sessionId, [...(bySession.get(r.sessionId) ?? []), r]);
  return [...bySession.entries()]
    .map(([sessionId, list]) => {
      const counted = list.filter((r) => !r.skipped);
      const graded = counted.filter((r) => !r.selfRated);
      const firstTry = graded.filter((r) => r.correct && r.attemptNumber === 1).length;
      const latest = list.reduce((a, b) => (Date.parse(b.at) > Date.parse(a.at) ? b : a));
      return {
        sessionId,
        at: latest.at,
        mode: modeOf(list),
        answered: graded.length,
        firstTry,
        selfRated: counted.length - graded.length,
        percent: graded.length ? Math.round((firstTry / graded.length) * 100) : null,
      };
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);
}

export interface Badge {
  id: string;
  label: string;
  earnedAt: string | null;
}

type Stats = {
  species: number;
  solid: number;
  reviewSessions: number;
  streak: number;
  at: string[];
  /** Latest non-skipped answer instant: dates a reached badge when `at` has no instant (e.g. HS-only). */
  lastAt?: string;
};

const BADGES: {
  id: string;
  label: string;
  need: number;
  value: (s: Stats) => number;
  nth: boolean;
}[] = [
  { id: 'first10', label: '10 loài đầu tiên', need: 10, value: (s) => s.species, nth: true },
  { id: 'streak7', label: '7 ngày liên tiếp', need: 7, value: (s) => s.streak, nth: false },
  { id: 'solid50', label: '50 loài ở bậc 2 trở lên', need: 50, value: (s) => s.solid, nth: false },
  { id: 'species100', label: '100 loài', need: 100, value: (s) => s.species, nth: true },
  { id: 'review10', label: '10 phiên ôn', need: 10, value: (s) => s.reviewSessions, nth: false },
];

/**
 * `stats.at` are the instants of the learner's progress events. Species-count badges are dated at
 * the Nth event (when the Nth species came in); the others at the latest event. Reached but undated: `stats.lastAt`. Not reached: null.
 */
export function badges(stats: Stats): Badge[] {
  const at = [...stats.at].sort((a, b) => Date.parse(a) - Date.parse(b));
  return BADGES.map((b) => ({
    id: b.id,
    label: b.label,
    earnedAt:
      b.value(stats) >= b.need
        ? ((b.nth ? at[b.need - 1] : undefined) ?? at[at.length - 1] ?? stats.lastAt ?? null)
        : null,
  }));
}

/** Answer figures, as the web Progress screen splits them: graded vs self-rated, skipped dropped. */
export function figures(rows: LogRow[]): {
  answered: number;
  firstTryPercent: number | null;
  selfRated: number;
} {
  const counted = rows.filter((r) => !r.skipped);
  const graded = counted.filter((r) => !r.selfRated);
  return {
    answered: graded.length,
    firstTryPercent: graded.length
      ? Math.round((graded.filter((r) => r.correct).length / graded.length) * 100)
      : null,
    selfRated: counted.length - graded.length,
  };
}
