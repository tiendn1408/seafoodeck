# Image Mode Session Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A real countdown for a whole Đoán hình session (15 s per question in total): when it runs out the unanswered questions count as wrong ("Hết giờ"), with an on/off switch.

**Architecture:** The API's `grade()` learns the answer `{ timeout: true }` for image questions (graded wrong, answer revealed, no schema change). The web app keeps the clock in `Study.tsx` (a hook with persistence per game id, a toggle stored per device), posts timeout attempts for the unanswered questions with deterministic idempotency keys, and moves to the summary with a notice.

**Tech Stack:** NestJS 12 + Prisma 7 API tests (`node --test` style as in `apps/api`), React 19 + TypeScript + Vitest 5 + jsdom (fake timers) in `apps/web`.

**Spec:** `docs/superpowers/specs/2026-11-27-image-timer-design.md`

## Global Constraints

- Applies only to sessions whose game mode is the image mode (`game.mode`; read `apps/web/src/pilot/api.ts` and the API for the exact value of Đoán hình) and whose questions are `image` questions. Flashcard, Ghép tên, HS, Nghe, Ôn tập, Toàn bộ are untouched.
- Budget: `15 s × number of questions of the session` (constant `SECONDS_PER_QUESTION = 15`). A bar shows the time left, text `mm:ss`; with 10 s or less left the bar turns to a warm colour; never blinking, no sound.
- The clock starts when the first image has loaded (or has failed or the question is unavailable: it must never deadlock). Leaving the Study screen ("Tạm dừng") stops it and saves the time left per game id in `localStorage` (try/catch everywhere; works without storage); coming back, or reloading, continues from the saved time. A finished session never restarts it.
- On expiry, once: the question being shown submits the currently selected option as a normal answer if there is one, otherwise `{ timeout: true }`; every later unanswered question gets `{ timeout: true }`; then the screen goes to the summary. Timeout attempt keys are deterministic: `timeout:<game.id>:<question.id>` (max 100 characters per the DTO; check) so retries are idempotent.
- API: `grade()` in `apps/api/src/learning.ts` accepts `answer.timeout === true` only for `image` questions (other types: `BadRequestException`); result `answered: true, skipped: false, correct: false, selfRated: false`; the explanation starts with `Hết giờ, tính là chưa chính xác.`; the correct option is revealed like for any wrong answer. No schema change, no migration, no change to the OpenAPI document (`npm run contract:generate` and `git diff --exit-code -- docs/api/openapi.json` stay clean). The server does not enforce the time.
- Counts as wrong everywhere a wrong answer counts: attempt log, accuracy, review schedule, "làm lại câu sai", combo (it resets).
- Toggle: a button named `Tính giờ` with `aria-pressed`, only in image sessions, stored per device (key `seafoodeck.timer.on.v1`, default ON, invalid data falls back to ON). OFF: no bar, no expiry. Turning it ON again mid-session continues from the saved time.
- Copy (Vietnamese, exact): bar label (accessible name) `Thời gian còn lại`; summary notice `Hết giờ: các câu chưa làm tính là chưa chính xác.`; one polite status announcement at 10 s left (`Còn 10 giây`) and one at expiry (`Hết giờ`); the bar itself is not a live region.
- Reduced motion: with `prefers-reduced-motion: reduce` no transition on the bar; add the new classes to the existing reduced-motion block in `study.css`.
- No new dependency; no two files under `apps/web/src` may differ only by case. Sound effects stay OFF by default. Gates that must stay green: `npm test` (web 498, studio 136, API 435, scripts 62 before this work), `npm run lint` (0 warnings), `npm run format:check`, `npm run build`, `npm run check:bundle`, `npm run contract:generate` with `git diff --exit-code -- docs/api/openapi.json`.

## Review Focus

1. The clock must not start before the first image is ready and must start anyway when the image fails or the question is unavailable. Pinned in Task 3.
2. Expiry cases: an option selected but not submitted; some questions already answered; all answered (no expiry effect); expiry firing twice (once only); the learner pressing "Nộp câu trả lời" at the same moment (idempotent, no double scoring). Pinned in Tasks 1 and 3.
3. Resume: leave and come back keeps the time left; reload restores it; a finished session never restarts it; storage unavailable still works. Pinned in Task 2.
4. Toggle OFF mid-session removes the bar and the expiry; ON continues from the saved time. Pinned in Tasks 2 and 3.
5. A failed timeout post (network) shows the existing retry note and does not drop to the summary until every question has a result. Pinned in Task 3.
6. API: timeout only for image questions, answer revealed, attempt logged as wrong, same key returns the same result. Pinned in Task 1.
7. Accessibility: no per-second announcements, keyboard-usable toggle, reduced motion. Pinned in Task 3.

---

### Task 1: API accepts the timeout answer

**Files:**
- Modify: `apps/api/src/learning.ts` (`grade()` and the explanation built where the score is assembled, around the lines that build `explanation` for graded and skipped results)
- Test: the existing API test file for grading and attempts (find it with `grep -rln "grade(" apps/api/src/*.test.ts`; add to it or create `apps/api/src/learning-timeout.test.ts` following its harness)

**Interfaces:**
- Produces (Task 3 relies on): `POST /api/v1/learning/sessions/:id/questions/:qid/attempts` with body `{ key, answer: { timeout: true } }` on an image question returns the usual score with `correct: false`, `skipped: false`, `answered: true`, `explanation` beginning `Hết giờ, tính là chưa chính xác.` and `correctOption` set.

- [ ] **Step 1: Write failing tests**: `grade(imageQuestion, { timeout: true })` returns `{ answered: true, skipped: false, correct: false, selfRated: false }`; `grade(matchQuestion|hsQuestion|listeningQuestion|flashcardQuestion, { timeout: true })` throws a `BadRequestException`; an attempt with `{ timeout: true }` on an image question through the real attempt path (use the existing harness) is stored as a wrong attempt (`correct: false, skipped: false`), reveals `correctOption`, has the explanation prefix `Hết giờ, tính là chưa chính xác.`, and creates the same review-progress effect as a wrong option; sending the same key twice returns the same result and logs one attempt (idempotency); `{ timeout: true, optionId: <correct id> }` is treated as a timeout (wrong), not as the correct answer.
- [ ] **Step 2: Run** the new tests (`cd apps/api && node --test <file>` or the repo's API test command; check `apps/api/package.json`) and confirm FAIL.
- [ ] **Step 3: Implement** the `timeout` branch in `grade()` (after the `skip` branch, before type handling) and the explanation prefix where scores are assembled; keep every other path byte-for-byte.
- [ ] **Step 4: Run** the focused tests (PASS), then `npm test --workspace @seafoodeck/api` (435 plus new), `npm run contract:generate` and `git diff --exit-code -- docs/api/openapi.json`, `npm run lint`, `npm run format:check`, `npm run build`.
- [ ] **Step 5: Commit** `feat(api): image questions accept a timeout answer graded wrong`.

### Task 2: Timer logic and settings (web, no UI)

**Files:**
- Create: `apps/web/src/learner/study/sessionTimer.ts`, `apps/web/src/learner/study/sessionTimer.test.ts`, `apps/web/src/learner/study/timerSetting.ts`, `apps/web/src/learner/study/timerSetting.test.ts`

**Interfaces:**
- Produces (Task 3 relies on exactly these):
  - `sessionTimer.ts`: `export const SECONDS_PER_QUESTION = 15`; `export function timerBudgetMs(questionCount: number): number`; `export function loadRemainingMs(gameId: string, fallbackMs: number): number` and `export function saveRemainingMs(gameId: string, ms: number): void` (key `seafoodeck.timer.v1:<gameId>`, clamped to `[0, fallback]`, try/catch, invalid data falls back); `export function useSessionTimer(opts: { gameId: string; totalMs: number; enabled: boolean; running: boolean; onExpire: () => void }): { remainingMs: number; expired: boolean }` (counts down by wall-clock deltas, so background tabs stay accurate; persists the remaining time about once per second, when `running` or `enabled` turns false, and on unmount; calls `onExpire` at most once per mount and never when it restored an already-expired state of a session that already ran `onExpire` before: expose that by persisting `0` and returning `expired: true` without calling `onExpire` again).
  - `timerSetting.ts`: `export function getTimerOn(): boolean`, `export function setTimerOn(on: boolean): void`, `export function useTimerOn(): boolean` (shared store with `useSyncExternalStore`, stable snapshot; key `seafoodeck.timer.on.v1`; default `true`; any value other than the strings `true`/`false` falls back to `true`; storage errors fall back to `true`), `export function resetTimerSettingForTests(): void`.

- [ ] **Step 1: Write failing tests** with `vi.useFakeTimers()` (mock `Date.now` and `performance.now` together with the fake clock): budget `timerBudgetMs(3) === 45000`; countdown from 45000 to 0 fires `onExpire` exactly once and then `expired` is true; `running: false` freezes the time; pausing then resuming continues from the frozen value; unmount saves the remaining time and a new mount with the same `gameId` continues from it; a saved value larger than the budget or negative or non-numeric is clamped or ignored; `enabled: false` neither counts nor expires; with storage throwing the hook still works; a restored `0` returns `expired: true` and does not call `onExpire` again; `setTimerOn(false)` is read back by `getTimerOn()` and re-renders two mounted `useTimerOn()` components; invalid stored strings give `true`; remount after "enabled" goes false then true continues from the saved time (Review Focus 3, 4).
- [ ] **Step 2: Run** `cd apps/web && npx vitest run src/learner/study/sessionTimer.test.ts src/learner/study/timerSetting.test.ts`; confirm FAIL (module not found).
- [ ] **Step 3: Implement** both modules with the signatures above.
- [ ] **Step 4: Run** the focused tests (PASS), the full web suite once, and from the repo root `npm run lint` and `npm run format:check`.
- [ ] **Step 5: Commit** `feat(web): session timer hook and timer setting`.

### Task 3: Bar, toggle, expiry flow, summary notice, README

**Files:**
- Create: `apps/web/src/learner/study/TimerBar.tsx`, `apps/web/src/learner/study/TimerBar.test.tsx`
- Modify: `apps/web/src/learner/study/Study.tsx`, `apps/web/src/learner/study/QuestionView.tsx` (report "image ready" up; submit selected-or-timeout when told the time is up), `apps/web/src/learner/study/HaulSummary.tsx` (notice), `apps/web/src/learner/study/study.css`, `README.md`
- Test: `apps/web/src/learner/study/Study.test.tsx` (or a new `studyTimer.test.tsx` beside it), `QuestionView.test.tsx`

**Interfaces:**
- Consumes: everything produced by Tasks 1 and 2; `api` from `apps/web/src/pilot/api.ts`; `SignedImage` from `apps/web/src/pilot/Media.tsx` (check how it reports load or error; add an `onSettled` style callback if it has none, without changing its other behaviour).
- Produces: `TimerBar({ remainingMs, totalMs }: { remainingMs: number; totalMs: number }): JSX.Element` (accessible name `Thời gian còn lại`, visible `mm:ss`, class for the warm state at 10 s or less).

- [ ] **Step 1: Write failing tests** (fake timers; mock `api`): `TimerBar` shows `00:45` for 45000 ms, `00:09` for 9000 ms with the warm class, `00:00` for 0, has the accessible name `Thời gian còn lại` and is not a live region; in an image `Study` the clock does not run until the first image reports it has loaded or failed, then counts down (assert the displayed time after advancing 5 s); a non-image game shows no bar and no toggle; the `Tính giờ` button toggles `aria-pressed` and hides the bar; leaving (unmount) and remounting continues the time; at expiry with an option selected the selected option is submitted and the rest get `{ timeout: true }` through the attempts endpoint with the keys `timeout:<game.id>:<question.id>`; with nothing selected the current question gets `{ timeout: true }` too; questions that already have a result are not posted; expiry fires only once; after every question has a result the screen shows the summary with the notice `Hết giờ: các câu chưa làm tính là chưa chính xác.`; a failing timeout post shows the existing error note with a retry and stays off the summary until every question has a result (retry then continues); the polite announcements `Còn 10 giây` and `Hết giờ` appear once each; combo (`sessionCombo`) resets for a timed-out question (a result with `correct: false`, not skipped, not self-rated).
- [ ] **Step 2: Run** `cd apps/web && npx vitest run src/learner/study`; confirm the new tests FAIL.
- [ ] **Step 3: Implement** `TimerBar`, the toggle (in the study bar, image sessions only, hidden when the timer is switched off at the Study level only as the spec says: the toggle itself stays visible so it can be switched on again), the `Study.tsx` wiring (`useSessionTimer` with `enabled = imageSession && timerOn && !finished`, `running = firstImageSettled && !finished`, the expiry orchestration, the move to the summary), the `QuestionView.tsx` hooks, the `HaulSummary.tsx` notice (shown when the timer expired in this page load or any result's explanation starts with `Hết giờ`), the CSS (tokens, warm state, `prefers-reduced-motion` entries) and keep the study bar layout intact at 320 and 360 px (the controller checks in real Chromium and WebKit).
- [ ] **Step 4: Run** the focused tests (PASS), then from the repo root `npm test`, `npm run build`, `npm run check:bundle`, `npm run lint`, `npm run format:check`.
- [ ] **Step 5: README.** Add a short Vietnamese section "Tính giờ Đoán hình": 15 giây mỗi câu tính cho cả phiên, thanh đếm ngược, hết giờ thì câu đang làm dở nộp lựa chọn đang chọn (không chọn thì sai) và các câu còn lại tính sai, công tắc "Tính giờ" lưu theo máy (mặc định bật), tạm dừng giữ thời gian còn lại, chỉ áp cho Đoán hình, server không tự ép giờ.
- [ ] **Step 6: Commit** `feat(web): session timer for the image mode`.
