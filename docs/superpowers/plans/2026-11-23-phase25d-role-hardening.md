# Phase 2.5d — Role hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. One implementer + one reviewer per task, one fix wave at the end.

**Goal:** Make role separation provable: API role×route matrix tests, a role-split web bundle (learners never download admin/manager code), and a manager account screen.

**Spec:** `docs/superpowers/specs/2026-11-20-phase25c-manager-admin-design.md` (sections 6.3 manager `account`, 7 constraints). Owner decisions (2026-11-23): tighten permissions; ordinary users must not see the admin area; add the manager account screen.

## Global Constraints
- Server is the authority: every non-public route needs an explicit role allowlist; the web check is UX only.
- Roles: guest, learner (invite code/trial), student, manager, editor, reviewer, publisher, admin.
- Vietnamese UI copy; no new dependencies unless unavoidable (React.lazy/Suspense are built in; Vite splits dynamic imports natively).
- No line on learner screens about managers seeing progress.
- API files flat in `apps/api/src`; web tests Vitest/jsdom without @testing-library/react (`learner/testDom.ts`).

## Review Focus
1. A route added later without a role check must fail the matrix test (route inventory is derived from the controllers' metadata, not a hand-written list).
2. A learner/trial/guest session requesting any `/admin/*` or `/manager/*` route gets 401/403, never data and never a 500.
3. Lazy chunk load failure (offline, stale deploy) shows a retry, not a blank screen; a guest hitting `#admin` still gets the staff login, not the admin chunk.
4. The learner entry bundle contains no `admin/users` or `manager/learners` strings after the split.
5. A manager changing their password mid-session keeps working (CSRF rotation) like students.

### Task 1: API role × route matrix (audit + test)
**Files:** Create `apps/api/src/role-matrix.test.ts` (+ small helper if needed); Modify controllers only where the audit finds a missing/too-loose check.
- Enumerate every route from the compiled controllers (Nest route/guard metadata via Reflect, or the OpenAPI export), assert each is in an explicit table `{method path → allowed roles | 'public'}`; unknown route → test fails with its name.
- For each protected route and each role (guest, learner, student, manager, editor, reviewer, publisher, admin) assert allowed roles pass the role check and all others get 401/403 (use the existing controller/guard fakes; no DB needed where possible).
- Audit result written to the report: any route found too loose is fixed in this task with its own test (state each).
- [ ] Red first, then implement, run full API gate. Commit `test(api): role x route matrix`.

### Task 2: Split the web bundle by role
**Files:** Modify `apps/web/src/pilot/PilotApp.tsx`, `apps/web/src/main.tsx` if needed, `apps/web/src/pilot/AdminTabs.tsx`; tests in `PilotApp.test.tsx`; add a build-level check script/test.
- `Admin`, `UsersAdmin`, `HsAdmin`, `ManagerLearners`, `ManagerLearnerDetail` (and BulkUsers via UsersAdmin) become `React.lazy` chunks loaded only when the route renders for an allowed kind (the route gate runs BEFORE the import is triggered). Suspense fallback = existing loading style; chunk-load error → ErrorNote with retry.
- A guest on `#admin*`/`#manager*` still sees the staff login without loading the chunk.
- Build check (test or script run in the web gate): after `vite build`, the entry chunk(s) loaded by the learner path contain neither `admin/users` nor `manager/learners`; admin/manager strings exist only in lazy chunks. Document the sizes before/after.
- e2e: keep existing flows green (admin/manager flows load their chunk).
- [ ] Red first. Commit `feat(web): split admin and manager code into role-gated chunks`.

### Task 3: Manager account screen
**Files:** Modify `apps/web/src/learner/role.ts` (+test), `AppShell.tsx` (+test), `PilotApp.tsx`, `learner/Account.tsx` (reuse), tests; e2e flow.
- Manager gets route `account` (change password, display name, logout) reusing the student Account screen without learner-only parts (no progress/achievements, no mention of progress visibility); nav: tabs "Học viên | Thư viện" plus account entry per AppShell pattern; no `/me/*` progress calls; CSRF/session adoption after password change works for manager (Task 11 of 2.5c logic). Forced-change flow for manager unchanged.
- Admin/staff are out of scope unless the spec says otherwise (state in report).
- [ ] Red first. Commit `feat(web): manager account screen`.
