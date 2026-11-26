# Web Tier Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `web` container (one Caddy, one image, both apps) with `edge` + `web-learner` + `web-studio`, with identical behaviour seen from outside.

**Architecture:** `edge` (Caddy) owns ports, TLS, security headers, `/api/*` (X-Edge rules unchanged), the S3 path proxy and the Studio-unconfigured guard, and reverse-proxies every other request by host to `web-learner:80` or `web-studio:80`. Each web container is a plain-HTTP Caddy that serves only its own build. One multi-stage Dockerfile builds both apps, runs `check-bundles.mjs` once, and exposes three runtime targets.

**Tech Stack:** Caddy 2 (alpine), Docker Compose, Node 24 scripts (`node:test`), Playwright e2e (unchanged).

**Spec:** `docs/superpowers/specs/2026-11-26-web-tier-split-design.md`

## Global Constraints

- Services `edge`, `web-learner`, `web-studio`; images `seafoodeck-edge`, `seafoodeck-web-learner`, `seafoodeck-web-studio`. Local compose builds all three from one `WEB_TAG`. VPS compose uses `EDGE_IMAGE_REF`, `LEARNER_IMAGE_REF`, `STUDIO_IMAGE_REF`; `WEB_IMAGE_REF` is removed everywhere except the historical `scripts/deploy-learner-demo-20261120.sh`.
- Only `edge` publishes ports. Local: `127.0.0.1:${WEB_PORT:-18089}:80` and `127.0.0.1:${STUDIO_WEB_PORT:-18090}:8090`. VPS: `80:80`, `443:443`, `443:443/udp`. `web-learner`, `web-studio`, `api`, `storage`, `db` publish nothing.
- `web-learner` image has no studio files; `web-studio` image has no learner build; `edge` image has no app files. `check:bundle` runs in the single build stage, so every target build fails on a leak.
- Behaviour seen from outside is unchanged on both hosts: status, security headers, `Cache-Control` (assets immutable, everything else no-store), `X-Robots-Tag`, `Content-Encoding`, SPA fallback, `/healthz` on a public host still returns the SPA `index.html` (health checks use a separate non-public listener), `X-Edge: learner` set on the learner site and removed on the Studio site, S3 proxy keeps Host and path, `{$STUDIO_SITE_ADDRESS:http://studio.invalid}` guard aborts when unset.
- The edge keeps the existing `caddy_data` / `caddy_config` volumes (certificates survive the switch).
- Compose conventions follow `bot_trading` (`/Users/tien.dang/Workplace/projects/bot_trading/docker-compose.yml`): a header comment, a shared YAML anchor for settings common to the web-tier services, `logging: {driver: json-file, options: {max-size: 10m, max-file: '3'}}`, a `healthcheck` per service, `depends_on` with `condition: service_healthy`, `restart: unless-stopped`, and a comment saying why for every non-obvious line. Deliberate deviations (do not copy): no `container_name` and no fixed `name:`, because several seafoodeck stacks coexist locally and the project name comes from `PILOT_PROJECT_NAME`.
- Never touch other compose projects (`seafoodeck-review-*`, `seafoodeck-flat-demo`, `seafoodeck-trade-demo`, `seafoodeck-demo-4modes`). Never `down -v`. Never push images or touch the VPS.
- Vietnamese for owner-facing docs, English for code and config comments, as the repo does today.

## Review Focus

1. Header fidelity through the extra hop: `Cache-Control` precedence (edge `no-store` vs web `/assets/*` immutable), `Content-Encoding` not doubled, `/healthz` not leaking the web container's health body. Pinned in Task 1 by the header matrix.
2. Studio guard: with `STUDIO_SITE_ADDRESS` unset the Studio host closes the connection and `web-studio` is reachable by no published port. Pinned in Task 1.
3. Isolation: stop `web-studio` → learner host fine, Studio host 502, and the reverse. Pinned in Task 4.
4. Port takeover at the VPS: the old `web` container holds 80/443, so `edge` fails to bind until it is removed; the compose file no longer names `web`, so a plain `dc rm web` fails. Pinned in Tasks 3 and 4 (rehearsal).
5. Certificate continuity: edge must mount the same `caddy_data` volume the old `web` used (same volume name). Pinned in Task 2 by a test on the VPS compose file.

---

### Task 1: Tier configs, images, local compose, and the header characterisation

**Files:**
- Create: `deploy/edge/Caddyfile`, `deploy/web/Caddyfile`, `scripts/web-tier-headers.mjs`, `scripts/web-tier-headers.test.mjs`, `scripts/web-tier-headers.expected.json`, `scripts/web-tier-check.mjs`
- Modify: `Dockerfile` (becomes the single multi-stage file), `compose.yaml`, `package.json` (script `check:web-tier`)
- Delete: `deploy/Caddyfile.pilot`, `apps/web/Dockerfile`
- Modify after grep: anything that asserts the two Dockerfiles are identical or references `Caddyfile.pilot` / `apps/web/Dockerfile` outside `docs/`

**Interfaces:**
- Produces (for Tasks 2–4):
  - `scripts/web-tier-headers.mjs`: `export const MATRIX` (array of `{host: 'learner'|'studio', path: string, acceptEncoding?: 'gzip'}`), `export async function capture(baseUrls: {learner: string, studio: string}): Promise<Record<string, {status: number, headers: Record<string,string>}>>` (keys `"<host> <path>"`; headers limited to `cache-control`, `x-robots-tag`, `x-content-type-options`, `referrer-policy`, `x-frame-options`, `content-encoding`, `content-type`), `export function diff(expected, actual): string[]` (empty array = identical).
  - `node scripts/web-tier-check.mjs` exits 0/1 and prints one line per check.
  - Compose services `edge`, `web-learner`, `web-studio`; compose anchor `x-web-tier`.
  - Image targets in `Dockerfile`: `edge`, `web-learner`, `web-studio`; shared stage `build`.

- [ ] **Step 1: Characterise the current stack before changing anything.** The stack `seafoodeck-pilot-acceptance` (learner 18089, Studio 18090, tag `studio-split-25e-r3-local`) is running the old single `web`. Write `scripts/web-tier-headers.mjs` and run `node scripts/web-tier-headers.mjs --record http://127.0.0.1:18089 http://localhost:18090 > scripts/web-tier-headers.expected.json`. `MATRIX` per host: `/`, the first `/assets/…` URL found in the served `index.html`, `/some/spa/route`, `/healthz`, `/api/v1/auth/session` (use whichever unauthenticated API path the e2e already calls; expect 401/200 as today), `/seafoodeck-private/x` (S3 proxy, whatever status it gives today), and `/` with `acceptEncoding: 'gzip'`. Commit the JSON as the baseline.
- [ ] **Step 2: Write `scripts/web-tier-headers.test.mjs` (`node:test`, no network).** Tests: `diff({a:{status:200,headers:{'cache-control':'no-store'}}}, same)` returns `[]`; changing a header value returns exactly one message naming key and header; a missing key returns one message. Run `node --test scripts/web-tier-headers.test.mjs` → FAIL, then implement `diff` → PASS.
- [ ] **Step 3: Write `scripts/web-tier-check.mjs`** with these checks, each failing the script with a clear message: (a) `capture` on the live stack equals the baseline (`diff` is empty); (b) `docker compose -p $PILOT_PROJECT_NAME ps --format json` shows published ports only on `edge`; (c) `ls /srv` via `docker compose exec -T web-learner` has `index.html` and no studio marker, `web-studio` the reverse, and `edge` has no `/srv` app files (use the marker names from `scripts/check-bundles.mjs`, import them instead of copying); (d) with `STUDIO_SITE_ADDRESS` unset in a one-off `docker compose run --rm` of the edge config validate step, skip — instead assert the Caddyfile text keeps the `@unconfigured` abort (string check). Add `"check:web-tier": "node scripts/web-tier-check.mjs"` to `package.json`. Run it against the old stack: (a) passes, (b)(c) FAIL (no `edge`). This is the red state.
- [ ] **Step 4: Write `deploy/web/Caddyfile`.** Global options `auto_https off`, `admin off`. Public site `:80`: `root * /srv/app`, `handle /assets/*` sets `Cache-Control "public, max-age=31536000, immutable"` then `file_server`; default `handle` does `try_files {path} /index.html` then `file_server`; no `encode`, no security headers (the edge owns them). Health on a separate listener `http://127.0.0.1:8081` answering `respond /healthz "ok" 200`. Both targets copy the same file; the build copies its dist to `/srv/app`.
- [ ] **Step 5: Write `deploy/edge/Caddyfile`** from `deploy/Caddyfile.pilot`: keep `(security_headers)`, `encode zstd gzip`, the learner site (`{$SITE_ADDRESS::80}` with `/api/*` → `api:3000` + `header_up X-Edge learner`), the Studio site with the `@unconfigured` abort first and `header_up -X-Edge`, the `http://127.0.0.1:8080` health block. In the shared snippet keep the S3 `handle /{$S3_BUCKET:seafoodeck-private}/*` → `storage:8333` and replace the `/assets/*` and fallback handles with one default `reverse_proxy` to `web-learner:80` (learner site) or `web-studio:80` (Studio site). Make Step 1's matrix pass: if edge `no-store` overrides the upstream immutable header, or `Content-Encoding` doubles, fix the edge config (for example send `no-store` only where upstream sent none, or `encode` only non-proxied routes) and say what you chose in the report.
- [ ] **Step 6: Rewrite `Dockerfile`** as one file: stage `build` (the current build stage, incl. `check-bundles.mjs`), target `web-learner` (`FROM caddy:2-alpine`, copy `deploy/web/Caddyfile` to `/etc/caddy/Caddyfile`, copy `/app/apps/web/dist` to `/srv/app`), target `web-studio` (same, `/app/apps/studio/dist`), target `edge` (copy `deploy/edge/Caddyfile`, no app files, `EXPOSE 80 443 8090`, `ENV SITE_ADDRESS=seafoodeck.tiendn.io.vn`, no default for `STUDIO_SITE_ADDRESS`). Keep the `RELEASE_TAG` arg, labels, and amd64 handling; each target has its own `HEALTHCHECK` (web targets: `wget -q -O /dev/null http://127.0.0.1:8081/healthz`; edge: the existing 8080 check). Delete `apps/web/Dockerfile` and `deploy/Caddyfile.pilot`.
- [ ] **Step 7: Rewrite the `web` service in `compose.yaml`** as `edge`, `web-learner`, `web-studio` with the `x-web-tier` anchor (`platform: linux/amd64`, `restart: unless-stopped`, json-file logging 10m/3, `mem_limit`), `build.target`, local ports per Global Constraints, edge `depends_on` api, `web-learner`, `web-studio` all `service_healthy`, a header comment and one-line "why" comments in `bot_trading` style. Keep `environment` for edge exactly as `web` has today.
- [ ] **Step 8: Rebuild and run the red check to green.** `docker compose -p seafoodeck-pilot-acceptance --env-file .local/pilot.env build edge web-learner web-studio`, then `docker compose -p seafoodeck-pilot-acceptance rm -sf web`, `up -d edge web-learner web-studio`, `docker compose … ps` shows all healthy, then `npm run check:web-tier` → every check passes (header matrix equal to the baseline).
- [ ] **Step 9: Gates and commit.** `npm run format:check`, `npm run lint`, `node --test scripts/*.test.mjs` all pass. Commit `feat(deploy): split the web tier into edge, web-learner and web-studio`.

### Task 2: VPS compose, publish script, env, CI, restore-check

**Files:**
- Modify: `deploy/compose.pilot.ghcr.yaml`, `deploy/pilot.env.example`, `scripts/init-pilot.mjs`, `scripts/publish-pilot.sh`, `scripts/restore-check-pilot.mjs`, `.github/workflows/ci.yaml`, any other script that names the `web` service (`grep -rn "\bweb\b" scripts .github` after Task 1)
- Create: `scripts/compose-web-tier.test.mjs`

**Interfaces:**
- Consumes (Task 1): service names `edge`, `web-learner`, `web-studio`, anchor `x-web-tier`, image names above.
- Produces (Task 3): env names `EDGE_IMAGE_REF`, `LEARNER_IMAGE_REF`, `STUDIO_IMAGE_REF`; `publish-pilot.sh <tag>` pushes `ghcr.io/tiendn1408/seafoodeck-{api,edge,web-learner,web-studio}:<tag>` and prints each digest.

- [ ] **Step 1: Write `scripts/compose-web-tier.test.mjs` (`node:test`).** Parse `deploy/compose.pilot.ghcr.yaml` (use the repo's YAML dependency if present, else `docker compose config --format json` via child process with dummy env). Tests: `only edge publishes ports` (exactly `80:80`, `443:443`, `443:443/udp`); `edge mounts caddy_data and caddy_config` (volume names `caddy_data`, `caddy_config`, targets `/data`, `/config`); `web services publish no ports and no volumes`; `images come from the three refs` (`${EDGE_IMAGE_REF…}` etc., each with `:?` required-variable form); `no service named web`; `edge depends on api, web-learner, web-studio with service_healthy`; the same `no ports on web-learner/web-studio` for `compose.yaml`. Run → FAIL.
- [ ] **Step 2: Rewrite the `web` service in `deploy/compose.pilot.ghcr.yaml`** to the three services, same conventions and healthchecks as Task 1, `image: ${EDGE_IMAGE_REF:?Set EDGE_IMAGE_REF in .local/pilot.env}` and likewise for the others. Run the test → PASS.
- [ ] **Step 3: Update `deploy/pilot.env.example` and `scripts/init-pilot.mjs`** (three refs replace `WEB_IMAGE_REF`; defaults point at the current release tag, as `WEB_IMAGE_REF` did). Extend or create the existing test for `init-pilot` output so it asserts the three keys exist and `WEB_IMAGE_REF` does not (find the existing test; if none, add `scripts/init-pilot.test.mjs`). FAIL first, then PASS.
- [ ] **Step 4: `scripts/publish-pilot.sh`:** loop over `api edge web-learner web-studio`; keep the amd64 check, tag validation and "never changes the VPS" header. Add a `node:test` or shell check that the loop list is exactly those four names (read the file in `compose-web-tier.test.mjs`).
- [ ] **Step 5: `restore-check-pilot.mjs` and `ci.yaml`:** replace `up -d api web` / `build api web` with `edge web-learner web-studio` (plus `api`). Verify no other occurrence with the grep from Files; list any occurrence you leave and why.
- [ ] **Step 6: Gates and commit.** `node --test scripts/*.test.mjs`, `npm run lint`, `npm run format:check`. Commit `feat(deploy): VPS compose, publish script and env for the three-image web tier`.

### Task 3: Runbook and docs

**Files:**
- Modify: `docs/DEPLOY_STUDIO_HOST.md`, `docs/DEPLOY_UPGRADE_25C.md` (banner pointers, `apps/web/Dockerfile` mentions), `docs/DEPLOY_PILOT.md`, `docs/DEPLOY_FRESH_INSTALL_0.6.md` (if it names the web image), `docs/DELIVERY_25E.md` (addendum "Tách tầng web"), `README.md`

**Interfaces:**
- Consumes (Task 2): env names, publish script behaviour. Produces: the runbook the owner executes.

- [ ] **Step 1: Rewrite §3 of `DEPLOY_STUDIO_HOST.md`** for the r1 → split path: build three amd64 images from the single `Dockerfile` with `--target edge|web-learner|web-studio` and `-t seafoodeck-<name>:<TAG>`; `publish-pilot.sh`; `imagetools inspect` of all four (amd64/linux, digest equals the printed one); VPS: backup, `git pull --ff-only origin main`, replace the `WEB_IMAGE_REF` line with the three refs via `sudo -e` (names only, never print the file), then `dc pull`, migrate, `storage`, `api`, `dc up -d --no-deps web-learner web-studio`, wait healthy, remove the old `web` container with `docker rm -f $(docker ps -aq --filter label=com.docker.compose.project=<project> --filter label=com.docker.compose.service=web)` (state why: the new file no longer names `web`, and the old container holds 80/443), then `dc up -d --no-deps edge`, `dc ps`, logs. State the few seconds of downtime for both hosts and keep the "no `down -v`" rule. The commands must be those verified in Task 4.
- [ ] **Step 2: §4 and §5.** Post-deploy checks unchanged plus `dc ps` showing ports only on `edge`. Rollback: restore the previous `WEB_IMAGE_REF` and the previous compose file (`git checkout <previous commit> -- deploy/compose.pilot.ghcr.yaml`), remove `edge`/`web-learner`/`web-studio`, start the old `web`; API and web images revert together.
- [ ] **Step 3: Other docs.** Update every mention of `apps/web/Dockerfile`, single web image, `WEB_IMAGE_REF`, and `dc … web` in the files listed; `DELIVERY_25E.md` addendum states what changed, what did not (edge failure still takes both hosts down; same VPS, API, DB), and how it was verified (filled in by Task 4). Grep afterwards: `grep -rn "WEB_IMAGE_REF\|apps/web/Dockerfile\|Caddyfile.pilot" docs README.md` shows only historical mentions, each marked as such.
- [ ] **Step 4: Commit** `docs: three-image web tier runbook, rollback and delivery note`.

### Task 4: Rebuild, e2e, isolation and VPS-switch rehearsal (evidence)

**Files:**
- Modify: `docs/DELIVERY_25E.md` (evidence only). No product code; a failing check goes back to Task 1–3 as a fix.

**Interfaces:**
- Consumes everything above. Produces the evidence the owner reads before deploying.

- [ ] **Step 1: Rebuild the local stack** (`seafoodeck-pilot-acceptance`) from this branch with tag `web-tier-split-local`; confirm `docker compose … ps` all healthy and only `edge` has ports.
- [ ] **Step 2: Run `npm run check:web-tier`, `npm run smoke:pilot`, the learner-accounts check, `npm run test:e2e`** (all four Playwright projects; expect 52 passed / 6 skipped / 0 failed as on `main`). Mind the login limiter (20 failures / 10 min / IP; each e2e run uses 8): restart `api` first if you ran other login scripts.
- [ ] **Step 3: Isolation.** `docker compose stop web-studio` → learner host still returns 200 for `/`, Studio host 502; `start`, wait healthy; repeat with `web-learner`. Record the status codes.
- [ ] **Step 4: Unconfigured Studio.** In a scratch project (`seafoodeck-split-unconfigured`, other ports, `STUDIO_SITE_ADDRESS` unset) start `edge` + `web-studio` + `web-learner` (+ `api` and its dependencies as needed) and show the Studio host closes the connection (curl exit/empty reply) while `web-studio` has no published port. Remove the scratch project afterwards (that project only).
- [ ] **Step 5: Rehearse the VPS switch** in a scratch project `seafoodeck-split-rehearsal` with an override file mapping the public ports to `127.0.0.1:18201:80` / `18202:443`: (a) start from the previous layout (`git show main:deploy/compose.pilot.ghcr.yaml`, old image `seafoodeck-web:studio-split-25e-r3-local`); (b) switch with exactly the Task 3 commands against the new file with local image names as the three refs; (c) show `edge` binds only after the old `web` container is removed, that the `<project>_caddy_data` volume is the same one, and that a plain `dc rm -sf web` against the new file fails (so the doc's `docker rm -f …` form is needed); (d) roll back with the Task 3 rollback commands and show the old layout serves again. Remove the scratch project. Fix the runbook text for anything that did not work as written.
- [ ] **Step 6: Record** the evidence (commands, outputs trimmed, counts) in `docs/DELIVERY_25E.md` and commit `docs: web tier split evidence`.
