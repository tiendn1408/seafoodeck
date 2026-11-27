import type { ApiQuestion } from '../../pilot/api';

export type ComboState = { current: number; best: number };

/**
 * The run of correct auto-graded answers in a session, read from the results the questions
 * already hold (in question order), so a restored session shows the same combo. Questions
 * without a result, skipped questions and self-rated cards neither extend nor break the run;
 * a graded wrong answer ends it. Display only.
 */
export function sessionCombo(questions: ApiQuestion[]): ComboState {
  let current = 0;
  let best = 0;
  for (const q of questions) {
    const r = q.result;
    if (!r || r.skipped || r.selfRated) continue;
    current = r.correct ? current + 1 : 0;
    if (current > best) best = current;
  }
  return { current, best };
}

/** The running streak at each position of a pair list: `[true, true, false, true]` gives `[1, 2, 0, 1]`. */
export function pairCombo(verdicts: boolean[]): number[] {
  let run = 0;
  return verdicts.map((ok) => (run = ok ? run + 1 : 0));
}
