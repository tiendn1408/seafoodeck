# Small Fixes (deferred minors) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the small items deferred by earlier reviews (combo display, web tier split docs and checks, stale docs) before phase 3 part 3.

**Architecture:** Three independent batches on one branch, one commit per batch: (1) web code and tests of the combo display, (2) documentation fixes, (3) extra assertions in `check:web-tier` and the publish test. No product behaviour change except the accessible markup of the pair combo badge and a CSS font-size tweak.

**Tech Stack:** React 19, TypeScript, Vitest 5 + jsdom (`apps/web`), Node `node:test` scripts, Markdown docs, Playwright-free shell checks.

**Spec:** Owner request of 27/11/2026 ("mấy việc nhỏ xử lí xong hết đi"); the deferred lists in `docs/handoffs/2026-11-26-phase3-brainstorm-state.md` and the earlier review reports (summarised in each task below).

## Global Constraints

- Display-only combo stays display-only: no grading, API, storage or Docker change. Sound effects stay OFF by default (`VITE_SOUND_EFFECTS=on` only).
- Exact copy stays: `Combo ×N`, `Combo cao nhất: ×N`, pair badge visible text `×N` (U+00D7) from a streak of 2.
- A small item that turns out to be a decision, not a defect, is not changed: the implementer lists it in the report with a one-line reason ("no change because ...") so the controller can tell the owner.
- Docs stay in Vietnamese; commands in English as the docs do. Never print or ask for secrets. No `down -v`.
- No two files under `apps/web/src` may differ only by case. Gates that must stay green: `npm test` (web 495, studio 136, API 435, scripts 58 before this work, plus new tests), `npm run lint` (0 warnings), `npm run format:check`, `npm run build`, `npm run check:bundle`.
- Do not touch docker or any running compose stack in Tasks 1 and 2. Task 3 may READ the running local stack (project `seafoodeck-pilot-acceptance`, learner 18089, Studio 18090) with `npm run check:web-tier`, but never start, stop, rebuild or remove anything.

## Review Focus

1. The pair badge text alternative: the button's accessible name must contain `combo N` once (not twice) and the visible `×N` must not be dropped from the DOM. Pinned in Task 1.
2. A restored session (no localStorage draft): pair badges and verdict icons are both absent, consistently. Pinned in Task 1.
3. Doc commands: every command you edit stays copy-pasteable on the VPS, uses `sudo` where the env file is root-owned, never prints secrets. Checked by the reviewer reading the diff.
4. New `check:web-tier` assertions must pass on the current local stack and fail when the behaviour they guard is broken (assert the failure message is specific). Pinned in Task 3.

---

### Task 1: Combo display minors (apps/web)

**Files:**
- Modify: `apps/web/src/learner/study/QuestionView.tsx` (badge markup), `apps/web/src/learner/study/study.css` (visually-hidden helper if none exists in this app's CSS, chip font size), `apps/web/src/learner/study/ComboChip.test.tsx`, `apps/web/src/learner/study/QuestionView.test.tsx`, `apps/web/src/learner/study/Study.test.tsx`

**Interfaces:** none new; `pairCombo`, `sessionCombo`, `ComboChip` unchanged.

- [ ] **Step 1: Write failing tests**: (a) the pair badge has visible text exactly `×2` and the button's accessible name contains `combo 2` exactly once (use `getByRole('button', { name: /combo 2/ })` count, or compute the name with `dom-accessibility-api` only if already a dependency; otherwise assert the DOM: a visually hidden span with the text ` combo 2` and no `aria-label` on a `role="img"` wrapper); (b) a matching result whose draft is missing from localStorage (restored session) renders no badge and no `is-right`/`is-wrong` class, and renders the correct-pairs list from the result; (c) a `Study` with a skipped graded question in the middle of correct answers keeps the chip count (skipped neither extends nor breaks); (d) a live `Study` interaction: answering graded questions correctly shows the chip at `Combo ×2`, then a wrong answer removes it (use the existing helpers and mocks in `Study.test.tsx`; if the file only supports static games, build the smallest harness that re-renders `Study` with an updated `game` as `onChange` is called); (e) `ComboChip.test.tsx` uses the shared `mount`/`unmountAll` helpers from `apps/web/src/learner/testDom.ts` instead of repeating host/root code; the loop that mounts several `Summary` components in `Study.test.tsx` unmounts them explicitly or per case; the matching tests derive the draft storage key from the helper that builds it instead of the hard-coded `g-fc`.
- [ ] **Step 2: Run** `cd apps/web && npx vitest run src/learner/study`; confirm the new tests FAIL (items a, c, d may already pass: say so in the report).
- [ ] **Step 3: Implement**: replace the badge's `role="img"` + `aria-label` with `×N` plus a visually hidden ` combo N` text inside the badge (reuse an existing visually-hidden class in `apps/web/src/learner/*.css` if one exists, else add `.study-visually-hidden` in `study.css`); make the chip font size follow `.study-mode` on phones (same step-down as `.study-count` under 600 px). Record in the report, without changing code, a one-line decision on: chatty double live region (chip `role="status"` and feedback `role="status"` update together), the chip being hidden on the short-phone flashcard layout (flashcards never change the combo), and the speech/clip `cancelSpeech` on mount in `MachineVoice` (a sibling's speech can be cut on label change): "no change because ..." or a fix if trivial.
- [ ] **Step 4: Run** the focused tests (PASS), then the full web suite once and from the repo root `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:bundle`.
- [ ] **Step 5: Commit** `chore(web): combo accessibility text, test hygiene and restored-draft coverage`.

### Task 2: Documentation minors

**Files:**
- Modify: `docs/DEPLOY_STUDIO_HOST.md`, `docs/DELIVERY_25E.md`, `docs/DELIVERY_25D.md`, `docs/DEPLOY_VPS.md`, `docs/DELIVERY_25C.md`, `docs/Seafood_Deck_PRD.md`, `docs/handoffs/2026-11-20-phase25a-followups.md`, `docs/DEPLOY_FRESH_INSTALL_0.6.md`

**Interfaces:** none.

- [ ] **Step 1: `docs/DEPLOY_STUDIO_HOST.md`.** (a) Line ~103 (section 3.3): the `grep` of `API_IMAGE_REF`/`WEB_IMAGE_REF` must use `sudo grep` like section 6 does (the env file may be root-owned after `sudo -e`). (b) Section 3.4's "record the catalogue numbers" step (a `#` comment that only points forward): turn it into explicit commands the owner can paste at that point (the two read-only `psql` count commands from section 4, or a clear instruction to run them now), and state that `dc` and `P` are defined in section 3.6 (or define them where first needed). (c) Section 5: the per-app rollback bullet ("Chỉ một app web hỏng") must name the command `sudo -e .local/pilot.env` to restore the old `LEARNER_IMAGE_REF`/`STUDIO_IMAGE_REF`, and say it applies only from the second split release (the first release has no earlier digest). (d) Section 5, rollback block: the `STUDIO_ORIGIN` instruction appears both in the `sudo -e` comment and in a trailing paragraph; keep it in the command block comment and delete the duplicate paragraph text, keeping every other fact. (e) After the `dc pull` line in the rollback block add one sentence: if `dc pull` fails, the new web tier is still running; fix the cause (GHCR login or network) and run `dc pull` again before removing anything.
- [ ] **Step 2: other docs.** (a) `docs/DELIVERY_25E.md`: where the evidence still lists the old rehearsed rollback order (about line 54), add one sentence pointing to the reordered rollback in `DEPLOY_STUDIO_HOST.md` section 5 and saying the new order was reasoned, not re-rehearsed (the file already carries the caveat nearby: reuse its wording, do not contradict it). (b) `docs/DELIVERY_25D.md` line ~35 names `deploy/Caddyfile.pilot`: append "(từ phần tách tầng web là `deploy/edge/Caddyfile`)". (c) `docs/DEPLOY_VPS.md`: add a one-line banner at the top, "Tài liệu 0.5 (legacy): `docker build .` giờ tạo ảnh `edge` không chứa app; dùng `DEPLOY_STUDIO_HOST.md` cho stack hiện tại" (keep the body). (d) `docs/DELIVERY_25C.md`: the "Câu hỏi mở" about the manager Account screen: add one line "Đã giải ở 2.5d" (verify against `docs/DELIVERY_25D.md` before writing it; if 25D does not say so, write only what it does say). (e) `docs/Seafood_Deck_PRD.md` lines ~44 and ~46 point to `src/data/customer.ts`, `src/data/demo.ts`: add "(nay ở `test-fixtures/legacy-web/data/`; dữ liệu chạy thật ở API và DB)" after each path, verifying the paths exist with `ls`. (f) `docs/handoffs/2026-11-20-phase25a-followups.md`: add a dated banner at the top, "Cập nhật 27/11/2026: phần lớn các mục dưới đây đã làm (xem `git log` các commit `20ae6d1`, `05c43c7`, `a15f61c` và báo cáo rà soát); danh sách giữ để tham khảo, các ô chưa tick không còn phản ánh trạng thái": verify each of those three commits exists with `git show --stat` and that their subjects relate to the listed items before citing them; cite only commits that do. (g) `docs/DEPLOY_FRESH_INSTALL_0.6.md` body section 4 shows only two digests: leave the historical body untouched (the top banner already covers it) and report "no change because it is a historical record under a banner".
- [ ] **Step 3: Check** every edited fenced command block still renders (no broken fences) and `npm run format:check` passes (docs are not covered by prettier; say so). Commit `docs: runbook and stale-doc fixes from the review backlog`.

### Task 3: Extra `check:web-tier` and publish-script assertions

**Files:**
- Modify: `scripts/web-tier-check.mjs`, `scripts/web-tier-headers.mjs` (only if needed), `scripts/compose-web-tier.test.mjs`, `package.json` only if a script entry is needed
- Test: `scripts/web-tier-headers.test.mjs`, `scripts/compose-web-tier.test.mjs`

**Interfaces:**
- Consumes: `capture(baseUrls)`, `diff(expected, actual)` and `MATRIX` from `scripts/web-tier-headers.mjs`.

- [ ] **Step 1: Write failing tests** (pure, no network): a unit test for a new pure helper `viaProblems(rows)` in `web-tier-headers.mjs` that, given captured rows, returns messages when an app-served row (not `/api/*` and not the S3 bucket path) has a `via` header, or when an `/api/*` or S3 row lacks `via: 1.1 Caddy`; and an assertion in `compose-web-tier.test.mjs` that `scripts/publish-pilot.sh` keeps its amd64 check (`Architecture` compared to `amd64`) and its tag validation (`case "$tag" in` with the invalid-tag exit) — read the real file.
- [ ] **Step 2: Run** `node --test scripts/web-tier-headers.test.mjs scripts/compose-web-tier.test.mjs`; confirm FAIL.
- [ ] **Step 3: Implement** `viaProblems`, add `via` to the captured headers only for this check (do not rewrite the recorded baseline JSON: the baseline compares the existing header set; capture `via` separately or extend `HEADERS` and re-record ONLY if the old baseline already contained the value; otherwise keep the baseline file byte-identical and add `via` capture on the side), and add two live checks to `scripts/web-tier-check.mjs`: (e) `via` rules via `viaProblems` on the learner and Studio hosts; (f) `GET /api/v1/admin/users` on the learner host is 404 and, with a client-sent `X-Edge: learner`, on the Studio host is 401 (read-only requests). Each failing check prints a specific message.
- [ ] **Step 4: Run** the unit tests (PASS) and `npm run check:web-tier` against the running local stack (all checks pass; print the output in the report); run `node --test "scripts/*.test.mjs"` and `npm run lint`, `npm run format:check`.
- [ ] **Step 5: Commit** `test(deploy): check:web-tier asserts Via handling and the staff-path boundary; publish script guards`.
