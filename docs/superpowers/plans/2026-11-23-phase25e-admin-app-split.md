# Admin app on its own host — Implementation Plan (phase 2.5e)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every admin/manager/staff screen into a separate app (`apps/admin`) served on its own host `seafoodeckadmin.tiendn.io.vn`, so the learner app/host carries no trace of an admin area.

**Architecture:** Two Vite apps, one API, one DB, one web image holding both builds, one Caddy with two sites. `apps/admin` imports reusable learner modules from `apps/web/src` through a one-way `@web/*` alias (never the reverse; lint + CI enforced). The API adds `ADMIN_ORIGIN` to the accepted write origins and refuses wrong-realm logins with the generic wrong-password response. Learner host answers 404 for `/api/v1/admin*`, `/api/v1/manager*`, docs/openapi.

**Tech Stack:** React 19, Vite 8, TypeScript, NestJS, Caddy 2, Playwright, npm workspaces.

**Spec:** `docs/superpowers/specs/2026-11-25-admin-app-split-design.md` (incl. its Clarifications 1–8 — binding).

## Global Constraints
- Hosts/env: learner `SITE_ADDRESS`/`PUBLIC_ORIGIN` = `seafoodeck.tiendn.io.vn`; admin `ADMIN_SITE_ADDRESS`/`ADMIN_ORIGIN` = `seafoodeckadmin.tiendn.io.vn`. Locally two distinct hosts (cookies ignore ports): learner `http://127.0.0.1:18089`, admin `http://localhost:18090` (`ADMIN_WEB_PORT`, default 18090). DNS and certificates for the admin host are the owner's job.
- Learner app/host must contain no admin trace: no word, route, link, file/chunk name, endpoint string or error message hinting an admin area exists. Plain TypeScript types are erased and don't count; runtime strings do (marker list: endpoint paths `/admin`, `/manager`; screen/component names; tab labels "Quản trị", "Người dùng", admin "Học viên"; `admin`/`manager` route names; chunk names).
- Realms: learner|student ↔ `PUBLIC_ORIGIN`; editor|reviewer|publisher|manager|admin ↔ `ADMIN_ORIGIN`. Wrong-realm login = same status/body/limiter cost as a wrong password. Unknown login Origin = same generic response. Absent Origin accepted on login and writes (scripts; CSRF still required) and tests assert it deliberately. `ADMIN_ORIGIN` unset ⇒ today's single-origin behaviour for all roles.
- Not a hardened boundary: no TOTP, no IP allow-list, no wildcard cert, no authenticated-only admin bundle. Server role checks (role × route matrix test) remain the boundary.
- Staff "Study" is not in the admin app. Staff train with a personal student account on the learner host.
- Vietnamese UI copy; no new runtime dependencies beyond workspace wiring; Vitest/jsdom without @testing-library/react (`learner/testDom.ts`).
- Never touch other projects' containers; no `down`/volume removal; use this repo's local stack only (compose project `seafoodeck-pilot-acceptance`).

## Review Focus
1. Wrong-realm login (both directions), unknown Origin and absent Origin behave as specified; response bytes/status identical to wrong-password (T1).
2. After extraction the learner `dist` contains zero markers and the admin `dist` contains them; the marker script fails when a marker is planted in learner code (T3).
3. Reverse import `apps/web → apps/admin` fails lint and CI (T3).
4. Learner host `/api/v1/admin/users` answers exactly like an unknown path (same status and body shape) (T4/T5).
5. Admin app keeps forced password change, 401→login, CSRF rotation, leave guard + one-time-password panel, media preview/upload via S3 from the admin host (T2/T4/T5).

## File structure (target)
- `apps/admin/` — `package.json` (`@seafoodeck/admin`), `index.html`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `src/main.tsx`, `src/AdminApp.tsx` (shell), `src/screens/` (Admin, HsAdmin, UsersAdmin, BulkUsers, AdminTabs, Dialog, ManagerLearners, ManagerLearnerDetail + css + tests), `src/api.ts` (admin/manager types: AdminUserRow, AdminUserPage, LearnerRow, LearnerPage, LearnerSummary, itemExtras helpers).
- `apps/web/src/pilot/api.ts` keeps learner endpoints/types only; `role.ts` kinds = guest|trial|student; no `lazyScreen`/`roleChunks` unless still used for learner code.
- `scripts/check-bundles.mjs` (root) replaces `apps/web/scripts/check-bundle-split.mjs`.

### Task 1: API — `ADMIN_ORIGIN`, write allow-list, realm-checked login
**Files:** Modify `apps/api/src/security.ts` (`Auth.checkWrite`, realm helpers), `apps/api/src/auth.controller.ts` (password + invite login), env: `deploy/pilot.env.example`, `deploy/env.example`, `deploy/ghcr.env.example`, `scripts/init-pilot.mjs`, `compose.yaml`, `deploy/compose.pilot.ghcr.yaml`, `deploy/compose.ghcr.yaml` (S3 `-s3.allowedOrigins` lists both origins if the flag accepts a comma list; else document), `README.md`; Test: `apps/api/src/realm.test.ts` (+ extend existing auth/security tests); `scripts/local-origin.test.mjs` only if needed (`localhost` is already loopback).
**Interfaces:**
- Produces: `realmOf(role: string): 'learner' | 'admin'`; `originRealm(origin: string | undefined): 'learner' | 'admin' | 'unknown' | 'none'` (`none` = header absent); `ADMIN_ORIGIN` env. `checkWrite`: CSRF as today; Origin present ⇒ must equal `PUBLIC_ORIGIN` or `ADMIN_ORIGIN` else 403 `Origin không hợp lệ.` (no realm match required on writes — spec decision; cookies are per host).
- Login: if Origin present and `ADMIN_ORIGIN` set, `originRealm(origin)` must equal `realmOf(account.role)` else respond exactly as a wrong password (same status/body, count against the login limiter). Unknown Origin on login ⇒ same generic response. Absent Origin ⇒ unchanged. `ADMIN_ORIGIN` unset ⇒ unchanged for everyone.
- [ ] Step 1: tests (red) in `realm.test.ts`: role × origin login matrix (student/learner on admin origin refused; editor/reviewer/publisher/manager/admin on learner origin refused; correct pairs succeed); refused response deep-equals the wrong-password response and increments the limiter; unknown Origin on login generic; absent Origin accepted for login and write; write with `ADMIN_ORIGIN` accepted, third-party Origin 403; `ADMIN_ORIGIN` unset behaves as before; existing auth/security/me tests and `role-matrix.test.ts` stay green.
- [ ] Step 2: implement; env plumbing (`init-pilot.mjs` generates `ADMIN_ORIGIN=http://localhost:18090`, `ADMIN_WEB_PORT=18090` for local; examples default to the VPS host); compose passes both origins to S3 CORS.
- [ ] Step 3: gate — apps/api `npm test`, lint, format:check; scripts tests; `contract:generate` diff reported. Commit `feat(api): admin origin and realm-checked login`.

### Task 2: Extract `apps/admin` and strip the learner app
**Files:** Create `apps/admin/**` per the file structure; Move (git mv, with tests) `apps/web/src/pilot/{Admin,HsAdmin,UsersAdmin,BulkUsers,AdminTabs,Dialog,itemExtras}.*`, `users.css`, `apps/web/src/manager/*`; Modify `apps/web/src/pilot/{PilotApp.tsx,api.ts,roleChunks.ts,lazyScreen.tsx}`, `apps/web/src/learner/{role.ts,AppShell.tsx,loginKind.ts,Login.tsx}` + their tests, root `package.json` (scripts `dev:admin`, build/test/typecheck/lint/format cover both workspaces), root `tsconfig`/`.dockerignore` if needed.
**Interfaces:**
- Consumes (T1): realm-checked login.
- Produces: workspace `@seafoodeck/admin` (build output `apps/admin/dist`); alias `@web/*` → `apps/web/src/*` wired in vite, tsconfig paths and vitest; `AdminApp` default export. Admin tabs by role — editor/reviewer/publisher: Quản trị + Thư viện; manager: Học viên + Thư viện + Tài khoản; admin: Quản trị + Người dùng + Học viên + Thư viện. Library/profile views reuse `@web/learner/{Library,Profile,Progress,Review,Account,ChangePassword}`; manager detail stays read-only.
- Learner app: `Kind` = `guest | trial | student`; no admin/manager/staff branches, tabs, icons, copy, route names or tests; a non-learner session (should not occur) behaves as unauthenticated and says nothing about other roles; `StaffLogin`/`loginKind` leave `apps/web`.
- `AdminApp` shell re-implements the thin orchestration (auth bootstrap `/auth/me`, StaffLogin, forced password screen, `setAuthRequiredHandler` 401→login, CSRF adoption after password change, leave guard, chunk-free routing) following PilotApp's staff paths, importing every helper already extracted (`meStore`, `leaveGuard`, `api()`/`setCsrf`/handlers, `ChangePassword`, `Account`, `ErrorNote`). Do not refactor the live learner shell beyond deleting admin parts.
- Admin-only API types (AdminUserRow, AdminUserPage, LearnerRow, LearnerPage, LearnerSummary) move to `apps/admin/src/api.ts`; `apps/web/src/pilot/api.ts` keeps learner endpoints/types.
- [ ] Step 1: move code with `git mv` in a first commit so history follows; make `apps/admin` build with a minimal `AdminApp` and move its tests (the existing admin/manager/AdminTabs/BulkUsers/UsersAdmin/ManagerLearners tests and the admin/manager parts of `PilotApp.test.tsx`/`PilotApp.chunks.test.tsx`/`AppShell.test.tsx`/`role.test.ts` become `AdminApp.test.tsx` etc.; ported assertions must not be weakened).
- [ ] Step 2: strip the learner app; learner tests (`PilotApp.test.tsx` table of `/me` calls etc.) adapt to three kinds; add a learner test that no rendered route/tab/label contains an admin marker.
- [ ] Step 3: new `AdminApp.test.tsx` cases: guest sees StaffLogin; each role sees exactly its tabs and no others; forced password change; 401 → login without error note; CSRF adopted after password change; one-time-password panel pauses navigation/logout via leave guard; manager `account` calls only `GET/PATCH /me` and `POST /me/password`.
- [ ] Step 4: gate — web and admin `npm test`, `tsc`, eslint, `prettier --check`, `npm run build` (both apps build). Commits: `refactor: move admin and manager screens into apps/admin` (+ `feat(admin): admin app shell`).

### Task 3: Boundaries and bundle checks
**Files:** `apps/web/eslint.config.js` (`no-restricted-imports`: nothing in `apps/web` imports `apps/admin`, `@seafoodeck/admin`, or relative paths into `apps/admin`), `scripts/check-bundles.mjs` (+ `scripts/check-bundles.test.mjs`), remove `apps/web/scripts/check-bundle-split.mjs` and its npm scripts, root `package.json` (`check:bundle`), `.github/workflows/ci.yaml`.
- `check-bundles.mjs` (root, no dependencies): reads every file under `apps/web/dist` and fails if any marker from one list (defined once in the script, with a small reviewed allow-list for shared words) appears; reads `apps/admin/dist` and fails if any marker is missing; fails if `apps/web/dist/index.html` references any asset not under learner files; exits non-zero when dist folders are missing.
- [ ] Step 1 tests (red): `check-bundles.test.mjs` builds tiny fixture dist trees: clean learner + marked admin passes; marker planted in learner fails; marker absent from admin fails; missing dist fails. Lint test (or eslint run in a unit test) proving a file in `apps/web/src` importing `../../../admin/src/x` is rejected.
- [ ] Step 2 implement; CI runs lint, build (both), `npm run check:bundle` right after build. Commit `build: enforce learner/admin code boundary`.

### Task 4: Hosts, image and deployment config
**Files:** `deploy/Caddyfile.pilot` (+ other Caddyfiles that serve the web image), `apps/web/Dockerfile`, root `Dockerfile`, `compose*.yaml`/`deploy/compose*.yaml`, `deploy/*.env.example`, `scripts/init-pilot.mjs`, `scripts/publish-pilot.sh` (checks), `docs/DEPLOY_UPGRADE_25C.md` + new `docs/DEPLOY_ADMIN_HOST.md`.
- One image: build stage builds both apps (copy both workspaces' sources; `npm ci` for both), runs `npm run check:bundle` (script copied into the image build), copies learner dist → `/srv/learner`, admin dist → `/srv/admin`.
- Caddy: site block 1 `{$SITE_ADDRESS::80}` root `/srv/learner`; `handle /api/v1/admin* { respond 404 }`-style rules so the response is **identical to an unknown API path** (verify the API's own 404 body/headers and mirror them or proxy-then-rewrite, document the choice), same for `/api/v1/manager*` and docs/openapi; the rest of `/api/*` to `api:3000`; S3 path proxy; assets cache rule; SPA fallback. Site block 2 `{$ADMIN_SITE_ADDRESS}` root `/srv/admin`, `X-Robots-Tag "noindex, nofollow"`, same security headers, `/api/*` → API, S3 path proxy, assets, SPA fallback; if `ADMIN_SITE_ADDRESS` is unset the block must be omitted or harmless (no catch-all serving admin on the learner host). Local: admin site on its own port published as `127.0.0.1:${ADMIN_WEB_PORT:-18090}` and addressed as `localhost`.
- Docs: DNS A/AAAA for the admin host, env lines for the VPS (names only, never values), rollout order (DNS → env → deploy), post-deploy checks (learner host 404 for admin API + docs; admin login per role on admin host; wrong-realm logins refused identically on both hosts), rollback, honest limits (CT logs, no TOTP).
- [ ] Verify what can be verified without touching other projects: `docker run caddy:2-alpine caddy validate` on the Caddyfile with sample env (Docker allowed only for caddy validate and this repo's compose project); state anything unverified. Commit `ops: learner and admin hosts`.

### Task 5: e2e, local stack, delivery notes
**Files:** `apps/web/e2e/*` (or a new `apps/admin/e2e`) + Playwright config(s) for two base URLs, `docs/DELIVERY_25E.md`, `README.md`.
- Playwright: projects for learner origin (`PLAYWRIGHT_BASE_URL`, default `http://127.0.0.1:18089`) and admin origin (`PLAYWRIGHT_ADMIN_URL`, default `http://localhost:18090`), desktop + mobile as today. All existing admin/manager flows (users admin, bulk CSV, manager table/detail/CSV, account screens, admin lock/unlock, forced password) run against the admin origin; learner flows unchanged. New tests: staff/manager/admin login on learner origin fails identically to wrong password; student/learner login on admin origin fails identically; `GET /api/v1/admin/users` on learner origin returns the same status/body shape as an unknown API path; learner pages never request admin assets; admin origin has no Study route; documented absent-Origin script login still works.
- Rebuild this repo's local stack from current code (same method as `.superpowers/sdd/2026-11-23-phase25d-role-hardening/e2e-report.md`, new tag `admin-split-25e-local`, DB backup first), confirm health, run `npm run test:e2e` twice, report real counts. Product bugs found are recorded, not silently fixed.
- `docs/DELIVERY_25E.md` (Vietnamese, template `DELIVERY_25D.md`): what changed, how the split works, honest limits (CT logs, no TOTP, hiding ≠ boundary, Study dropped, staff use personal student accounts), owner to-dos (DNS, env, deploy), real test numbers, remaining minors.
- [ ] Commits `test(e2e): split admin app flows`, `docs: phase 2.5e delivery notes`.

## Final steps (controller)
Whole-branch review on the most capable model → one fix wave → scoped re-review → stack rebuild + e2e twice → finishing options (ask the owner: merge+push / merge local / keep). Never deploy to the VPS.
