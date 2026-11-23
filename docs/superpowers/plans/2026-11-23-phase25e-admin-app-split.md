# Phase 2.5e — Separate admin app on its own host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. One implementer + one reviewer per task, one fix wave at the end.

**Goal:** Admin, manager and staff screens live in their own app (`apps/admin`) served on their own host (`seafoodeckadmin.tiendn.io.vn`); the learner app (`apps/web`, host `seafoodeck.tiendn.io.vn`) contains no admin/manager code or endpoint names, and the learner host does not route admin/manager API paths.

**Architecture:** Two Vite apps in the monorepo, one shared API. `apps/admin` imports reusable learner modules from `apps/web/src` through a one-way alias `@web/*` (admin → web only; web never imports admin; lint-enforced). One web image holds both builds; Caddy serves two sites (learner host, admin host) from separate roots. The API knows two realms by `Origin`: learner realm (`PUBLIC_ORIGIN`: roles learner, student) and admin realm (`ADMIN_ORIGIN`: roles editor, reviewer, publisher, manager, admin). Login and every write enforce role↔realm. Session cookies are per host.

**Tech Stack:** React 19, Vite 8, NestJS, Caddy, Playwright, npm workspaces.

**Spec:** owner decisions 2026-11-23 (this plan's header + `docs/superpowers/specs/2026-11-20-phase25c-manager-admin-design.md`): admin enters from anywhere without VPN; wants admin source and endpoints out of the learner app; admin host = `seafoodeckadmin.tiendn.io.vn`; **no TOTP** (basic role demo only).

## Global Constraints
- Server role checks stay the security boundary (role matrix test must stay green and be extended); hiding is an additional layer, state this honestly in docs.
- Hosts: learner `seafoodeck.tiendn.io.vn` (`SITE_ADDRESS`, `PUBLIC_ORIGIN`), admin `seafoodeckadmin.tiendn.io.vn` (`ADMIN_SITE_ADDRESS`, `ADMIN_ORIGIN`). DNS records and TLS issuance are the owner's job (Caddy obtains certs automatically once DNS points here); document, don't attempt.
- Learner host: Caddy answers 404 for `/api/v1/admin*`, `/api/v1/manager*`, plus the already-blocked docs/openapi paths; the learner dist contains none of the admin/manager endpoint strings or components.
- Staff/manager/admin cannot log in on the learner host; learner/student cannot log in on the admin host (neutral Vietnamese message, same shape as bad credentials where it would leak role existence).
- Admin app keeps: staff login, Quản trị (content), Người dùng (admin), Học viên + chi tiết (manager, admin), Thư viện/hồ sơ loài (browse), manager Tài khoản. Staff **Study** is dropped from the admin app (staff preview the deck with an invite code on the learner host) — state in docs.
- Locally the two origins must be distinct *hosts* (cookies ignore ports): e.g. learner `http://127.0.0.1:18089`, admin `http://localhost:18090`.
- Vietnamese UI copy; no new runtime dependencies beyond workspace wiring; web tests Vitest/jsdom without @testing-library/react.
- Never touch other projects' containers; no `down`, no volume removal on this repo's local stack.

## Review Focus
1. A staff/admin/manager session cookie or login on the learner origin (and student/learner on the admin origin) is refused, including via direct API calls with a forged Origin header; missing Origin on write is refused as before.
2. Learner dist/bundle and learner Caddy host never serve admin/manager code or paths; `check:bundle` becomes: markers absent from every file in `apps/web/dist`, present in `apps/admin/dist`.
3. `apps/web` cannot import `apps/admin` (lint rule + test); circular or reverse imports fail CI.
4. Presigned media URLs (S3 via Caddy `/{bucket}/*`) and uploads work from the admin host (CORS `s3.allowedOrigins` includes both origins).
5. Forced password change, 401→login, CSRF rotation, leave-guard and one-time-password flows still work in the admin app (they were built in the combined shell).

### Task 1: API realms by Origin
**Files:** Modify `apps/api/src/security.ts`, `auth.controller.ts`, `me.controller.ts` if needed, env wiring (`ADMIN_ORIGIN` in `pilot.env.example`, `env.example`, `ghcr.env.example`, `scripts/init-pilot.mjs`, compose files, `scripts/local-origin.mjs` + test); Tests: `auth`/`security` tests, extend `role-matrix.test.ts`.
- `realmOf(role)`: learner|student → 'learner'; editor|reviewer|publisher|manager|admin → 'admin'. `originRealm(origin)`: `PUBLIC_ORIGIN` → learner, `ADMIN_ORIGIN` → admin, else none. If `ADMIN_ORIGIN` is unset the admin realm shares nothing (admin logins refused) except in local/dev mode where the existing single-origin behaviour is kept ONLY when `ADMIN_ORIGIN` is unset AND a documented dev flag allows it — pick the simplest safe rule and document it.
- Login (password and invite code) requires an Origin header; role realm must equal origin realm, else 401 with the generic bad-credentials message (never reveal the role). Write requests (`checkWrite`): Origin must be one of the two and match the session role's realm. CORS/credentials unaffected (same-origin proxies).
- S3: `s3.allowedOrigins` includes both origins (compose).
- Tests: realm matrix (each role × each origin for login and a representative write), missing/forged Origin, ADMIN_ORIGIN unset behaviour, existing tests green, role-matrix still green.
- [ ] Red first; commit `feat(api): learner and admin realms by Origin`.

### Task 2: Extract `apps/admin`
**Files:** Create `apps/admin/` (package.json `@seafoodeck/admin`, vite/tsconfig/eslint/index.html/main.tsx, `src/AdminApp.tsx` shell, `src/screens/*`); Move from `apps/web/src`: `pilot/Admin.tsx`, `UsersAdmin.tsx`, `HsAdmin.tsx`, `BulkUsers.tsx`, `AdminTabs.tsx`, `Dialog.tsx`, `itemExtras.ts`, `users.css`, `manager/*` (+ their tests); Modify `apps/web/src/pilot/PilotApp.tsx`, `roleChunks.ts`/`lazyScreen.tsx` (remove if unused), `learner/role.ts`, `AppShell.tsx`, `loginKind.ts`, `Login.tsx` (StaffLogin moves to admin).
- Admin app: alias `@web` → `../web/src` (vite + tsconfig paths + vitest); reuses `api.ts`, `meStore`, `ErrorNote`, `Library`/`Profile`/`Progress`/`Review` (read-only detail), `Account`, `ChangePassword`, tokens/theme/shell CSS, leaveGuard — imported, not copied. `AdminApp` handles auth bootstrap, staff login (`StaffLogin`), forced password flow, 401→login, CSRF adoption, tabs per role (editor/reviewer/publisher: Quản trị, Thư viện; manager: Học viên, Thư viện, Tài khoản; admin: Quản trị, Người dùng, Học viên, Thư viện), leave guard — following the behaviours already implemented in PilotApp (read it) without regressions; share small helpers via `@web` rather than duplicating where sensible.
- Learner app (`apps/web`): remove all admin/manager/staff branches; kinds reduce to guest|trial|student; a signed-in session whose role is not learner/student (should not occur after Task 1) shows a neutral "Tài khoản này đăng nhập ở trang quản trị" screen with logout. `routesFor`/`routeAllowed` tables keep only learner kinds; table-driven `/me` tests adjusted.
- Move/port the unit tests with the code (admin tests live in `apps/admin`); learner tests keep passing; root scripts (`dev:admin`, `build` for both, `test`, `typecheck`, `lint`, `format:check`) cover both workspaces.
- [ ] Green gates for both workspaces; commit `refactor: move admin and manager screens into apps/admin`.

### Task 3: Boundaries and bundle checks
**Files:** `apps/web/eslint.config.js` (no-restricted-imports: nothing in `apps/web` may import `apps/admin` or `@seafoodeck/admin`), a boundary unit test, `apps/web/scripts/check-bundle-split.mjs` → `scripts/check-bundles.mjs` at root or per app, `.github/workflows/ci.yaml`, Dockerfile check steps.
- New check: no admin/manager marker (endpoint strings and screen names) in ANY file of `apps/web/dist`; markers present in `apps/admin/dist`; learner `index.html` references no admin assets. Wire into CI after build and into the image build.
- [ ] Red first (temporarily break to prove it fails); commit `build: enforce learner/admin code boundary`.

### Task 4: Hosts, image and deployment config
**Files:** `deploy/Caddyfile.pilot` (+ other Caddyfiles as needed), `apps/web/Dockerfile`, root `Dockerfile`, `compose*.yaml`, `deploy/*.env.example`, `scripts/init-pilot.mjs`, `scripts/publish-pilot.sh`, docs.
- One image: build stage builds both apps; Caddy has two site blocks: learner (`{$SITE_ADDRESS}`, root `/srv/learner`, 404 for `/api/v1/admin*`, `/api/v1/manager*`, docs/openapi) and admin (`{$ADMIN_SITE_ADDRESS}`, root `/srv/admin`, `/api/*` to API, S3 path proxy, same security headers, `X-Robots-Tag noindex`). Healthcheck unchanged. Local stack: admin site on a second published port (e.g. `127.0.0.1:${ADMIN_WEB_PORT:-18090}`) addressed as `localhost`.
- Env: `ADMIN_SITE_ADDRESS`, `ADMIN_ORIGIN`, `ADMIN_WEB_PORT` documented in examples; defaults for the VPS (`seafoodeckadmin.tiendn.io.vn`); `init-pilot` generates local values; publish script unchanged except checks.
- Docs: new section in `docs/DEPLOY_UPGRADE_25C.md` (or a new `docs/DEPLOY_ADMIN_HOST.md`): DNS A/AAAA for `seafoodeckadmin.tiendn.io.vn` to the VPS, env lines to add on the VPS (never print secrets), Caddy certificate note, post-deploy checks (learner host 404 for admin API paths and docs; admin host login for each role; learner host refuses admin login), rollback.
- [ ] Verify the Caddyfile loads (`caddy validate` via the Caddy image if docker is permitted for this repo's stack only; otherwise state not verified); commit `ops: learner and admin hosts`.

### Task 5: e2e, realm tests, docs
**Files:** `apps/web/e2e/*` (move admin/manager flows to run against the admin origin; Playwright projects/baseURLs for both), `docs/DELIVERY_25E.md`, `README.md`.
- e2e: admin/manager flows target the admin origin; new tests: staff/admin/manager login on learner origin refused, learner/student login on admin origin refused, direct API `/api/v1/admin/users` on the learner origin → 404, learner pages never request admin assets, admin host serves no learner-only study route; existing learner flows unchanged; run twice on the rebuilt local stack with the two hosts.
- Docs honesty: hiding ≠ security boundary; no TOTP (owner decision); staff study dropped; what the VPS owner must do (DNS, env, deploy); known remaining items.
- [ ] Commit `test(e2e): split admin app flows` and `docs: phase 2.5e delivery notes`.
