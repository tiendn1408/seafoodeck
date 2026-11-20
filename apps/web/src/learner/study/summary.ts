import { DAY } from '../../domain/review';
import type { Game, ProgressEntry, SessionSummaryResponse } from '../../pilot/api';

/** One target of the haul: a species (or an HS case) with every skill practised this session. */
export type HaulEntry = {
  targetId: string;
  label: string;
  /** `matching`: a skipped name-matching question, shown as one neutral line. */
  kind: 'species' | 'hs' | 'matching';
  skills: string[];
  /** Caught = every graded answer for this target was correct and none was skipped. */
  caught: boolean;
  skipped: boolean;
  /** Days until the earliest scheduled review, when the server reported one. */
  days: number | null;
  note: string;
};
export type HaulSummary = {
  caught: HaulEntry[];
  missed: HaulEntry[];
  total: number;
  title: string;
};

export const MISSED_NOTE = 'Sổng lưới · ôn lại ngày mai';
export const SKIPPED_NOTE = 'Bỏ qua · không lên lịch ôn';
export const SKIPPED_MATCH_LABEL = 'Ghép tên · bỏ qua';
/** The target id the server gives a skipped matching question (it has no per-pair items). */
const MATCHING = 'matching';

type Row = {
  targetId: string;
  label: string;
  kind: HaulEntry['kind'];
  skill: string;
  correct: boolean;
  skipped: boolean;
  at: string | undefined;
};

/** "hồ sơ" for an HS-only haul, "mục" for a mixed one, "loài" otherwise. */
function noun(entries: HaulEntry[]) {
  const hs = entries.filter((e) => e.kind === 'hs').length;
  return hs && hs === entries.length ? 'hồ sơ' : hs ? 'mục' : 'loài';
}
const caughtNote = (days: number | null) => (days ? `ôn lại sau ${days} ngày` : 'Đã vào lưới');

/**
 * The haul of a finished session: which species made it into the net and which slipped.
 * Pure: reads the game's results and the `progress` rows the server returned with them
 * (none for trial learners), never the clock or browser storage.
 */
export function summarizeHaul(game: Game, progress: ProgressEntry[]): HaulSummary {
  // A provisional self-rating has no real target id yet; when another card of the same species
  // already has one, count it under that target so the species is not listed twice.
  const realByFront = new Map<string, string>();
  for (const q of game.questions)
    if (q.front && q.result && !q.result.provisional) realByFront.set(q.front, q.result.targetId);
  const rows: Row[] = game.questions.flatMap((q) => {
    const stored = q.result;
    if (!stored) return [];
    const real = stored.provisional && q.front ? realByFront.get(q.front) : undefined;
    const r = real ? { ...stored, targetId: real } : stored;
    if (r.items?.length)
      return r.items.map((i) => ({
        targetId: i.targetId,
        label: i.label ?? 'Mục học',
        kind: 'species' as const,
        skill: r.skill,
        correct: i.correct,
        skipped: r.skipped,
        at: r.at,
      }));
    const hs = r.skill === 'hs';
    const matching = r.targetId === MATCHING;
    return [
      {
        targetId: r.targetId,
        label: matching
          ? SKIPPED_MATCH_LABEL
          : hs
            ? q.prompt.split('\n')[0]
            : (q.front ?? r.targetLabel ?? q.prompt.split('\n')[0]),
        kind: matching ? ('matching' as const) : hs ? ('hs' as const) : ('species' as const),
        skill: r.skill,
        correct: r.correct,
        skipped: r.skipped,
        at: r.at,
      },
    ];
  });
  const byTarget = new Map<string, Row[]>();
  for (const row of rows) byTarget.set(row.targetId, [...(byTarget.get(row.targetId) ?? []), row]);
  const entries: HaulEntry[] = [...byTarget.values()].map((group) => {
    const first = group[0];
    if (first.kind === 'matching')
      return {
        targetId: first.targetId,
        label: first.label,
        kind: 'matching',
        skills: [first.skill],
        caught: false,
        skipped: true,
        days: null,
        note: '',
      };
    const wrong = group.some((g) => !g.skipped && !g.correct);
    const caught = group.every((g) => g.correct && !g.skipped);
    // Skipped answers schedule no review, so only call it skipped when nothing was wrong.
    const skipped = !wrong && group.some((g) => g.skipped);
    const skills = [...new Set(group.map((g) => g.skill))];
    const last = Math.max(...group.map((g) => (g.at ? Date.parse(g.at) : NaN)).filter(isFinite));
    const due = progress
      .filter((p) => p.targetId === first.targetId && skills.includes(p.skill))
      .map((p) => Date.parse(p.dueAt))
      .filter(isFinite);
    const days =
      due.length && isFinite(last)
        ? Math.max(1, Math.round((Math.min(...due) - last) / DAY))
        : null;
    return {
      targetId: first.targetId,
      label: first.label,
      kind: first.kind,
      skills,
      caught,
      skipped,
      days,
      note: caught ? caughtNote(days) : wrong ? MISSED_NOTE : SKIPPED_NOTE,
    };
  });
  // A skipped matching question is listed, but it is not a species: it never counts.
  const counted = entries.filter((e) => e.kind !== 'matching');
  const caught = entries.filter((e) => e.caught);
  const missed = entries.filter((e) => !e.caught);
  return {
    caught,
    missed,
    total: counted.length,
    title: `${caught.length} / ${counted.length} ${noun(counted)} vào lưới`,
  };
}

/**
 * Fills the days of caught entries the session could not date itself (results restored after
 * a reload carry no `progress`) from `GET /learning/sessions/:id/summary`. Days already known
 * are kept.
 */
export function withServerDays(
  haul: HaulSummary,
  server: SessionSummaryResponse | null,
): HaulSummary {
  if (!server) return haul;
  const fill = (e: HaulEntry): HaulEntry => {
    if (!e.caught || e.days !== null) return e;
    const known = server.entries
      .filter((s) => s.targetId === e.targetId && s.nextReviewInDays !== null)
      .map((s) => s.nextReviewInDays!);
    if (!known.length) return e;
    const days = Math.max(1, Math.round(Math.min(...known)));
    return { ...e, days, note: caughtNote(days) };
  };
  return { ...haul, caught: haul.caught.map(fill), missed: haul.missed };
}
