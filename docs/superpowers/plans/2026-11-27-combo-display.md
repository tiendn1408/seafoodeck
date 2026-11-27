# Combo Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a display-only combo: "Combo ×N" for consecutive correct graded answers in a session (study bar and summary), and ×2, ×3 badges on consecutive correct pairs of a submitted Ghép tên set.

**Architecture:** Two pure functions (`sessionCombo`, `pairCombo`) in `combo.ts`, computed in the browser from results already in `game.questions[i].result`; a `ComboChip` component for the study bar; wiring into `Study.tsx` (chip and summary line) and the matching block of `QuestionView.tsx` (pair badges). No API, DB, scoring, storage or Docker change.

**Tech Stack:** React 19, TypeScript, Vitest 5 + jsdom (`vitest run` in `apps/web`), CSS in `apps/web/src/learner/study/study.css`.

**Spec:** `docs/superpowers/specs/2026-11-27-combo-display-design.md`

## Global Constraints

- Display only: no change to grading, stored score, review schedule, progress, API calls, DB or Docker. No state is stored: combo is recomputed from `game.questions[i].result`, so a restored session shows the same combo.
- `sessionCombo(questions)`: walk the questions in index order; only questions with a `result` count; a result with `skipped` or `selfRated` is ignored (neither increases nor resets); a graded correct answer increments `current` and updates `best`; a graded wrong answer sets `current` to 0. Returns `{ current, best }` where `current` is the streak after the last counted answer.
- `pairCombo(verdicts: boolean[])`: running streak per position: `true` after `n` consecutive `true` gives `n`, `false` gives 0 (`[true,true,false,true]` -> `[1,2,0,1]`).
- Copy (Vietnamese, exact): chip `Combo ×N` shown only when `current >= 2`; pair badge `×N` shown only when the running streak is `>= 2`; summary line `Combo cao nhất: ×N` shown only when `best >= 2`. The `×` is U+00D7.
- Never punitive: no text, colour or sound for a broken combo; when the streak ends the chip simply disappears.
- Pair badges appear only after the set has a result (never before submit, so no answer leaks) and never for a skipped set.
- Accessibility: the chip has `role="status"`; pair badges have a text alternative such as `combo 2` (visually hidden or `aria-label`) so a screen reader can tell them from the pair labels.
- Motion: a short pop animation (under 0.5 s, existing tokens) for the chip and a staggered reveal for pair badges; with `prefers-reduced-motion: reduce` there is no animation (the badge is just there). Add the new classes to the existing reduced-motion block in `study.css`.
- Layout: the chip must fit the study bar at 320 px and 360 px width without overflow, next to the pause link (the sound control is hidden by default; keep room if it is on).
- No new dependency; no two files under `apps/web/src` may differ only by case. Gates that must stay green: `npm test` (web 463, studio 136, API 435, scripts 58 before this work), `npm run lint` (0 warnings), `npm run format:check`, `npm run build`, `npm run check:bundle`.

## Review Focus

1. Skipped and self-rated answers neither extend nor break the streak; a question without a result is ignored; the order is by question index, not by answer time. Pinned in Task 1.
2. Restore: the same `questions` array (for example rebuilt from the server after a reload) gives the same combo; the chip works for a student session and a trial session. Pinned in Task 1.
3. A broken streak shows nothing negative (chip gone, no message). Pinned in Task 1.
4. Matching: badges never appear before the result exists, never on a skipped set, follow the displayed order of the Vietnamese names, and never mislabel a wrong pair. Pinned in Task 2.
5. Narrow screens and reduced motion: the chip fits the bar at 320 px; reduced motion removes the animation. Pinned in Task 1 (CSS present in the reduced-motion list) and checked by the controller in a real browser.

---

### Task 1: Combo logic, chip, study bar and summary

**Files:**
- Create: `apps/web/src/learner/study/combo.ts`, `apps/web/src/learner/study/combo.test.ts`, `apps/web/src/learner/study/ComboChip.tsx`, `apps/web/src/learner/study/ComboChip.test.tsx`
- Modify: `apps/web/src/learner/study/Study.tsx` (compute `sessionCombo(game.questions)`, render the chip in `.study-bar`, pass `bestCombo` to `Summary`), `apps/web/src/learner/study/HaulSummary.tsx` (`Summary` accepts `bestCombo: number` and shows the line), `apps/web/src/learner/study/study.css`
- Test: add cases to `apps/web/src/learner/study/Study.test.tsx` (or the existing test file that covers the study bar) and to the existing Summary test file

**Interfaces:**
- Produces (Task 2 relies on exactly these):
  - `combo.ts`: `export type ComboState = { current: number; best: number }`, `export function sessionCombo(questions: ApiQuestion[]): ComboState`, `export function pairCombo(verdicts: boolean[]): number[]`.
  - `ComboChip.tsx`: `export function ComboChip({ current }: { current: number }): JSX.Element | null` (null when `current < 2`).
- Consumes: `ApiQuestion` and `Score` types from `apps/web/src/pilot/api.ts` (`result.skipped`, `result.selfRated`, `result.correct`).

- [ ] **Step 1: Write failing tests for `combo.ts`**: `sessionCombo([])` is `{current:0,best:0}`; correct, correct, correct gives `{3,3}`; correct, correct, wrong gives `{0,2}`; correct, wrong, correct, correct gives `{2,2}`; correct, correct, wrong, correct gives `{1,2}`; skipped and self-rated results in between do not change `current` or `best`; questions without `result` are ignored (including after the last answered one); a provisional correct result counts like a confirmed one; `pairCombo([true,true,false,true])` equals `[1,2,0,1]`, `pairCombo([])` equals `[]`, `pairCombo([false,false])` equals `[0,0]`; the same input array gives the same output twice (pure, no hidden state; Review Focus 1, 2).
- [ ] **Step 2: Run** `cd apps/web && npx vitest run src/learner/study/combo.test.ts`; confirm FAIL (module not found).
- [ ] **Step 3: Implement `combo.ts`** with the signatures above.
- [ ] **Step 4: Run** the same command; PASS.
- [ ] **Step 5: Write failing tests** for `ComboChip` (null for 0 and 1; for 2 renders text `Combo ×2` with `role="status"`; for 5 `Combo ×5`; re-render from 3 to 0 removes it and renders no other text, Review Focus 3), for the study bar (a `Study` with three answered correct graded questions shows `Combo ×3` in `.study-bar`; after a wrong graded answer it is gone; a self-rated flashcard in the middle keeps it; a trial session and a student session both show it) and for `Summary` (`bestCombo` 3 shows `Combo cao nhất: ×3`; 1 or 0 shows no such line).
- [ ] **Step 6: Run** `npx vitest run src/learner/study`; confirm the new tests FAIL.
- [ ] **Step 7: Implement `ComboChip.tsx`**, the `Study.tsx` wiring (compute once per render from `game.questions`, render the chip inside `.study-bar` near the count, pass `bestCombo={sessionCombo(game.questions).best}` to `Summary`), the `Summary` line, and the CSS (chip style from existing tokens, pop animation under 0.5 s, fits 320 px, the new classes added to the existing `prefers-reduced-motion` block).
- [ ] **Step 8: Run** the focused tests (PASS), then the full web suite once (`cd apps/web && npx vitest run`) and from the repo root `npm run lint` and `npm run format:check`.
- [ ] **Step 9: Commit** `feat(web): session combo chip and best combo in the summary`.

### Task 2: Pair combo badges in Ghép tên, README

**Files:**
- Modify: `apps/web/src/learner/study/QuestionView.tsx` (matching block, the left-hand pair buttons that already get the `is-right` / `is-wrong` verdict), `apps/web/src/learner/study/study.css`, `README.md` (short Vietnamese section "Combo")
- Test: `apps/web/src/learner/study/QuestionView.test.tsx` (or the existing test file covering the matching result view)

**Interfaces:**
- Consumes (Task 1): `pairCombo(verdicts: boolean[]): number[]`.
- The verdicts come from the existing per-pair rule: for each left option in displayed order, a pair is right when `result.correctPairs[o.id] === draft.pairs[o.id]`; an unpaired option counts as wrong.

- [ ] **Step 1: Write failing tests** with a matching question that has a result: all three right shows badges `×2` and `×3` on the second and third pairs and none on the first; right, wrong, right shows no badge; right, right, wrong shows `×2` on the second only; wrong, right, right shows `×2` on the third; before the result exists (no `result`) no badge is rendered; a skipped result (`skipped: true`) renders no badge; each badge has a text alternative containing `combo` and the number (Review Focus 4); the badge order follows the displayed order of the left options (shuffle the `left` array in the fixture to prove it).
- [ ] **Step 2: Run** `cd apps/web && npx vitest run src/learner/study/QuestionView.test.tsx`; confirm the new tests FAIL.
- [ ] **Step 3: Implement** the badges in the matching block: compute `pairCombo` over the left options in displayed order only when `result` exists and is not skipped, render a badge with text `×N` when the streak is at least 2, with a staggered reveal through a CSS custom property per pair (index times about 140 ms), and the reduced-motion rule from the Global Constraints.
- [ ] **Step 4: Run** the focused tests (PASS), then from the repo root `npm test` (web 463 + new, studio 136, API 435, scripts 58), `npm run build`, `npm run check:bundle`, `npm run lint`, `npm run format:check`.
- [ ] **Step 5: README.** Add a short Vietnamese section "Combo": what the chip, the pair badges and the summary line show, that it is display only (no effect on scores or review), the rules (skipped and self-rated answers neither add nor break the streak; shown from ×2; nothing is shown when the streak ends), and that Ghép tên has one set of three pairs per session so the session combo shows in modes with many questions.
- [ ] **Step 6: Commit** `feat(web): pair combo badges in matching and README`.
