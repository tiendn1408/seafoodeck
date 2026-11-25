# Admin app on its own host — design

Date: 2026-11-25 · Status: draft for owner approval · Supersedes the plan `docs/superpowers/plans/2026-11-23-phase25e-admin-app-split.md` (its realm-on-every-write idea is dropped; see Approaches).

## Intent and why
Seafood Deck serves two very different audiences from one web app today: learners (trial, student) and staff (editor, reviewer, publisher), managers and admins. Everything is in one React app (`apps/web`); admin/manager screens are lazy chunks, but the learner app still contains the `#admin` route, the "Quản trị" entry points, chunk file names such as `Admin-*.js`, and admin copy. Anyone curious can find that an admin area exists by typing `#admin`, reading the bundle or following links.

**Owner's goal (their words, 2026-11-25):** admins, managers and staff may enter from anywhere, without a VPN. The only aim is to **limit how many people know the admin area exists**. It is not a defence against a determined attacker; "if the company hires a new admin they simply learn about it and use it". Demo level of role separation; no TOTP.

**Success looks like:** a learner (or anyone on the learner host) finds no word, route, link, file name, endpoint or error message that hints an admin area exists, and an admin/manager/staff user works on a separate host with a separate login, with all current admin features intact.

## Goals
- G1. A separate app `apps/admin` (own Vite build) holds every admin, manager and staff screen; `apps/web` (learner app) contains none of their code, copy, route names, endpoint strings or chunk names.
- G2. Admin app is served on its own host `seafoodeckadmin.tiendn.io.vn`; learner app stays on `seafoodeck.tiendn.io.vn`. One API, one database, one web image holding both builds, one Caddy with two sites.
- G3. On the learner host, admin/manager API paths answer 404 exactly like any unknown path (indistinguishable from a path that does not exist).
- G4. Logging in with a staff/manager/admin account on the learner host fails with the same generic "wrong username or password" response as a wrong password; learner/student accounts fail the same way on the admin host. No message ever names the other host or role.
- G5. Session cookies are per host (no sharing); every existing safety behaviour keeps working in the admin app: forced password change, 401 → login, CSRF rotation after password change, one-time-password panel and leave guard, bulk CSV dialog, manager table and detail, manager account screen.
- G6. The code boundary is enforced by CI: `apps/web` can never import `apps/admin`; the learner `dist` must contain no admin marker; the admin `dist` must contain them.

## Non-goals / anti-goals
- Not a hardened security boundary: no TOTP/MFA, no IP allow-list, no wildcard certificate, no authenticated-only delivery of the admin bundle. The admin host name is public in Certificate Transparency logs (crt.sh) and anyone who finds it can download the admin app and see the login page. Accepted by the owner.
- Server-side role checks stay the real boundary (the role × route matrix test must stay green and cover new behaviour).
- No separate API deployment, no separate database, no second image tag stream.
- Anti-goal: leaving any admin trace in the learner app (an "admin" link, a "use the admin site" message, a chunk file name) — that would defeat the purpose even if everything else works.

## Constraints
- Hosts/env: learner `SITE_ADDRESS`/`PUBLIC_ORIGIN` (`seafoodeck.tiendn.io.vn`), admin `ADMIN_SITE_ADDRESS`/`ADMIN_ORIGIN` (`seafoodeckadmin.tiendn.io.vn`). DNS records and certificates for the new host are the owner's task (Caddy obtains the certificate automatically once DNS points at the VPS). Locally the two origins must be distinct *hosts*, because cookies ignore ports: learner `http://127.0.0.1:18089`, admin `http://localhost:18090`.
- Existing deployments without `ADMIN_ORIGIN` must keep working unchanged (single origin, all roles) until the split is deployed.
- Vietnamese UI copy, React 19 + Vite 8, npm workspaces, Vitest/jsdom (no @testing-library/react), Playwright e2e on the repo's own local stack only.
- Never touch other projects' containers; no `down`/volume removal.

## Approaches considered
- **A. Keep one app with lazy admin chunks (state today).** Cheap, already shipped (2.5d). Fails the goal: `#admin` still resolves on the learner host, chunk names and admin strings remain in the learner build. Rejected.
- **B. Separate app + separate host, API restricts only login by realm (chosen).** Removes every admin trace from the learner app and host; small API change (origin allow-list + login-time realm check). Costs: a new workspace, moving ~3.4k lines of screens, a second Caddy site, two-origin e2e, loss of the staff "Study" screen inside the admin app.
- **C. B plus delivering the admin bundle only after login.** Hides the admin code even from someone who finds the host. Rejected: the owner said low threat; adds Caddy forward-auth complexity for little value.
- **D. B plus realm checks on every write.** More API code than the goal needs; origin allow-list on writes is enough because cookies are per host and admin API paths are 404 on the learner host. Rejected.

## The design (as decided)
1. **API.**
   - New env `ADMIN_ORIGIN`. Write requests (`Auth.checkWrite`) accept an `Origin` header equal to `PUBLIC_ORIGIN` or `ADMIN_ORIGIN` (an absent Origin stays allowed as today, for scripts; CSRF token still required). Any other origin → 403 as now.
   - Login (password and invite-code) with an `Origin` header: realm(account role) must equal realm(origin). learner|student ↔ `PUBLIC_ORIGIN`; editor|reviewer|publisher|manager|admin ↔ `ADMIN_ORIGIN`. Mismatch → the **same status, body and limiter cost as a wrong password**. If `ADMIN_ORIGIN` is unset, behaviour is exactly today's (all roles on `PUBLIC_ORIGIN`).
   - S3 CORS (`-s3.allowedOrigins`) lists both origins so media upload/preview works from the admin host. The role × route matrix, forced-password guard and per-user locks are unchanged.
2. **Admin app (`apps/admin`).** New workspace `@seafoodeck/admin`: own `index.html`, Vite config, tsconfig, eslint, tests. It imports reusable learner modules from `apps/web/src` via a one-way alias `@web/*` (API client, `meStore`, `ErrorNote`, `Library`/`Profile`/`Progress`/`Review` for read-only views, `Account`, `ChangePassword`, theme/tokens CSS, leave guard). Moves into admin: `Admin`, `HsAdmin`, `UsersAdmin`, `BulkUsers`, `AdminTabs`, `Dialog`, `itemExtras`, `users.css`, `manager/*` with their tests. New `AdminApp` shell: staff login, forced password change, 401 handling, CSRF adoption, leave guard, tabs by role — editor/reviewer/publisher: Quản trị + Thư viện; manager: Học viên + Thư viện + Tài khoản; admin: Quản trị + Người dùng + Học viên + Thư viện. **Staff "Study" is dropped** in the admin app (staff preview the deck with an invite code on the learner host).
3. **Learner app (`apps/web`).** All admin/manager/staff branches, tabs, icons, copy and route names are removed; `role.ts` kinds shrink to guest|trial|student; `loginKind`/`StaffLogin` move out. If a non-learner session ever reaches the learner app (should not happen after 1), it behaves like an unauthenticated visitor and says nothing about other roles.
4. **Hosts and image.** One web image: the build stage builds both apps into `/srv/learner` and `/srv/admin`. Caddy has two site blocks. Learner site: security headers, `/api/*` to the API **except** `/api/v1/admin*`, `/api/v1/manager*`, docs/openapi → 404 (same body as an unknown path), S3 path proxy, learner root only. Admin site: same headers plus `X-Robots-Tag: noindex, nofollow`, `/api/*` to the API, S3 path proxy, admin root only. Local stack publishes the admin site on a second port (`ADMIN_WEB_PORT`, default 18090) addressed as `localhost`.
5. **Guard rails.** `apps/web` eslint forbids importing `apps/admin`/`@seafoodeck/admin`; a script fails CI if any admin marker (endpoint strings, screen names, chunk names) appears anywhere in `apps/web/dist`, or is missing from `apps/admin/dist`; the same check runs in the Docker build. e2e covers: login realm refusals identical to wrong-password, 404 for admin API paths on the learner host, learner pages never request admin assets, all existing admin/manager flows on the admin origin.
6. **Docs.** `DELIVERY_25E.md` (honest: hiding ≠ security, no TOTP, CT-log visibility, Study dropped), deploy notes: DNS A/AAAA for the admin host, new env lines on the VPS (never print secrets), post-deploy checks, rollback.

## Clarifications after the builder check (answers; items marked *(my call)* are the writer's, not the owner's)
1. **Learner-host API surface.** Only `/api/v1/admin*` and `/api/v1/manager*` (+ docs/openapi) are staff-specific; `catalog`, `media`, `me` and `learning` are learner endpoints that answer by role, and media upload lives under `/admin/revisions/:id/media` (blocked). Because login is realm-restricted, the learner host only ever issues learner/student sessions, so no role name other than those can appear in its responses (`/auth/me`, 403 bodies).
2. **Marker vocabulary** *(my call)*: runtime strings only — endpoint paths (`/admin`, `/manager`), screen/component names, tab labels ("Quản trị", "Người dùng", "Học viên" as an admin tab), chunk/file names, and `admin`/`manager` route names. TypeScript types are erased and do not count. The marker script holds an explicit list in one file plus a small allow-list for unavoidable shared words, reviewed in CI diffs.
3. **Shared API client** *(my call)*: `apps/web/src/pilot/api.ts` is split — learner endpoints/types stay in `apps/web`, admin/manager endpoint functions and types move to `apps/admin`. Part of the extraction task, not a separate refactor.
4. **Cutover.** Existing staff learn the new URL out of band (the owner tells them); nothing is built for migration or messaging. Rollout order in the deploy doc: DNS for the admin host first, then `ADMIN_*` env lines, then deploy (setting `ADMIN_ORIGIN` before DNS only means the admin site cannot get a certificate yet).
5. **Origin at login** *(my call)*: an absent `Origin` is accepted on login and on writes (scripts); tests assert this deliberately. A login `Origin` that is neither configured origin gets the same generic wrong-password response (not a distinct 403).
6. **Shell reuse** *(my call)*: do not refactor the live learner shell. `AdminApp` re-implements the thin orchestration (auth bootstrap, forced password, 401 handler, CSRF adoption, leave guard — roughly PilotApp's staff paths) and imports every already-extracted helper from `@web` (`meStore`, `leaveGuard`, `ChangePassword`, `Account`, API client core). Small duplication is accepted; parity is protected by moving the existing admin/manager shell tests into `apps/admin`.
7. **Unsplit deployments.** Backward compatibility applies to the **API** only (no `ADMIN_ORIGIN` ⇒ single origin, all roles). Once the new web image ships, the split is mandatory: the learner image has no admin UI. If `ADMIN_SITE_ADDRESS` is unset, the admin site is not served and staff have no UI until it is configured; the deploy doc states this.
8. **Staff "Study"** — decided by the owner (2026-11-25): removed from the admin app. Staff who want to train or preview use a personal learner account on the learner host (an admin creates it in the Users screen with role `student`, or they use an invite code). Their staff account never logs in on the learner host, so learning progress stays separate from the admin identity.

## Left to the builder
File-level layout of `apps/admin/src`; how much of PilotApp's shell logic is shared via `@web` versus re-implemented in `AdminApp` (prefer importing); exact alias/tsconfig/vitest wiring; Caddy matcher syntax for the 404 body parity; script details for the marker check; splitting into tasks (suggested order: API → extract admin app → boundaries/CI → hosts/image → e2e/docs).

## Open items for the owner
- DNS and certificate for `seafoodeckadmin.tiendn.io.vn` (owner action).
- None left besides DNS/certificate; the Study question is decided (see clarification 8).
