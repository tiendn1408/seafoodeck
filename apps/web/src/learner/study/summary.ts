import { DAY, reviewKey } from '../../domain/review';
import type { Game } from '../../pilot/api';
import type { Ledger } from '../ledger';

/** One target of the haul: a species (or an HS case) with every skill practised this session. */
export type HaulEntry = {
  targetId: string;
  label: string;
  kind: 'species' | 'hs';
  skills: string[];
  /** Caught = every graded answer for this target was correct and none was skipped. */
  caught: boolean;
  skipped: boolean;
  /** Days until the earliest scheduled review, when the ledger has one. */
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

type Row = {
  targetId: string;
  label: string;
  kind: HaulEntry['kind'];
  skill: string;
  correct: boolean;
  skipped: boolean;
  at: string | undefined;
};

/**
 * The haul of a finished session: which species made it into the net and which slipped.
 * Pure: reads the game's results and the ledger's review states, never the clock.
 */
export function summarizeHaul(game: Game, ledger: Ledger): HaulSummary {
  const rows: Row[] = game.questions.flatMap((q) => {
    const r = q.result;
    if (!r) return [];
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
    return [
      {
        targetId: r.targetId,
        label: hs ? q.prompt.split('\n')[0] : (q.front ?? r.targetLabel ?? q.prompt.split('\n')[0]),
        kind: hs ? ('hs' as const) : ('species' as const),
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
    const wrong = group.some((g) => !g.skipped && !g.correct);
    const caught = group.every((g) => g.correct && !g.skipped);
    // Skipped answers schedule no review, so only call it skipped when nothing was wrong.
    const skipped = !wrong && group.some((g) => g.skipped);
    const skills = [...new Set(group.map((g) => g.skill))];
    const last = Math.max(...group.map((g) => (g.at ? Date.parse(g.at) : NaN)).filter(isFinite));
    const due = skills
      .map((s) => ledger.reviews[reviewKey(first.targetId, s)])
      .filter((r) => r && r.lastSessionId === game.id)
      .map((r) => Date.parse(r.dueAt));
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
      note: caught
        ? days
          ? `ôn lại sau ${days} ngày`
          : 'Đã vào lưới'
        : wrong
          ? MISSED_NOTE
          : SKIPPED_NOTE,
    };
  });
  const caught = entries.filter((e) => e.caught);
  const missed = entries.filter((e) => !e.caught);
  return {
    caught,
    missed,
    total: entries.length,
    title: `${caught.length} / ${entries.length} loài vào lưới`,
  };
}
