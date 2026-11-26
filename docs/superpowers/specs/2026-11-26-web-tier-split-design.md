# Web tier split: edge + web-learner + web-studio (short design)

Status: draft for owner approval. Owner chose approach A on 2026-11-26.

## Intent and why

Today one container (Caddy, one image `seafoodeck-web`) does TLS, routing, the S3/API proxy and serves both
apps, so the learner host's container holds the Studio files on disk and either app cannot be stopped or
rolled back alone. The owner asked for a real split: the learner container holds only the learner build, the
Studio container only the Studio build, and one edge in front.

## Goals

- `web-learner` image/container contains only the learner build. `web-studio` only the Studio build. The
  `edge` image contains no app files at all.
- Only `edge` publishes ports. `web-learner`, `web-studio`, `api`, `storage`, `db` publish nothing.
- Every behaviour visible from outside stays identical: both hosts, TLS, security headers, noindex, the
  `X-Edge: learner` trusted header, staff-path 404 on the learner host (API side, unchanged), S3 path proxy
  with Host and path preserved, SPA fallback, immutable caching of `/assets/*`, the studio-unconfigured
  abort, local ports 18089 / 18090.
- Stopping or rolling back one web container does not affect the other host (it answers 502 only for itself).

## Non-goals / anti-goals

- No change to the API, DB, roles, `/admin*` paths, Origin/realm logic, `learner-edge.ts`, or any app code.
- Not a second VPS and not separate TLS per app: edge failure still takes both hosts down. Say so in docs.
- Do not weaken any existing guard: `check:bundle` must still run for every image build and still fail the
  build on a leak; the boundary lint stays.

## Approaches (owner picked A)

- **A. Edge Caddy + two static Caddy containers (chosen).** One tool, existing snippets reused.
- B. Edge Caddy + two nginx containers: a second tool and config language, no benefit.
- C. Edge serves both from two volumes: still one web container, not a real split.

## Design

```
edge (Caddy): TLS, security headers, encode, /api/* -> api:3000 (X-Edge set/removed as today),
              /<bucket>/* -> storage:8333, studio guard (abort when unconfigured),
              everything else: learner host -> web-learner:80, studio host -> web-studio:80
web-learner / web-studio (Caddy, plain HTTP :80, auto_https off, admin off): file_server of its own
              root only, try_files {path} /index.html, /assets/* immutable cache, /healthz -> ok
```

- Edge Caddyfile keeps the two site blocks and the `{$STUDIO_SITE_ADDRESS:http://studio.invalid}` guard.
  The local Studio listener (container port 8090) stays on the edge, published `127.0.0.1:${STUDIO_WEB_PORT:-18090}:8090`;
  learner stays `127.0.0.1:${WEB_PORT:-18089}:80`.
- Images and names (my call): services `edge`, `web-learner`, `web-studio`; images `seafoodeck-edge`,
  `seafoodeck-web-learner`, `seafoodeck-web-studio`. Local compose builds all three from one `WEB_TAG`.
  VPS compose: `EDGE_IMAGE_REF`, `LEARNER_IMAGE_REF`, `STUDIO_IMAGE_REF` (digests) replace `WEB_IMAGE_REF`.
- Dockerfile layout (my call, builder may adjust): one multi-stage build stage compiles both apps and runs
  `check-bundles.mjs`; three runtime targets copy only what they need. Merge the duplicated root `Dockerfile`
  and `apps/web/Dockerfile` into that single file, or keep one as a pointer; compose uses `build.target`.
- Edge `depends_on`: api healthy, both web containers healthy. Each web container has its own healthcheck.
- Caching: Cache-Control precedence between the edge's site-level `no-store` and the static container's
  `/assets/*` immutable header must be tested end to end (assets immutable, index/SPA responses no-store).
  Do not assume; assert it.
- `scripts/publish-pilot.sh` pushes three images and prints three digests. `scripts/init-pilot.mjs`,
  `deploy/pilot.env.example`, `restore-check-pilot.mjs`, CI, README, `DEPLOY_STUDIO_HOST.md`,
  `DEPLOY_UPGRADE_25C.md` pointers and `DELIVERY_25E.md` updated. The historical
  `deploy-learner-demo-20261120.sh` is left as it is (it documents the r1 release).

## VPS upgrade consequence (must be in the runbook)

The old single `web` container owns ports 80/443; the new `edge` cannot bind until it is gone. The runbook
needs: pull the three images, `dc rm -sf web` (or equivalent) immediately before `dc up -d edge web-learner
web-studio`, a few seconds of downtime for both hosts, and rollback that restores the old `WEB_IMAGE_REF`
single container with the old compose file. No `down -v`, no volume removal; `caddy_data` stays the edge's.

## Verification required before merge

- Rebuild the local stack from this branch; e2e with all four projects unchanged and green (52 passed expected).
- A script check (also run in CI where Docker is available, else local): `ls /srv` in `web-learner` shows no
  studio files and in `web-studio` no learner build; `edge` has no `/srv` app files.
- Stop `web-studio`: learner host still fine, studio host 502; and the reverse.
- `docker compose ps` shows published ports only on `edge`.
- Existing gates: API, web, studio and scripts tests, build, `check:bundle`, lint, format.

## Left to the builder

Exact Caddyfile syntax for the three configs, healthcheck commands, Dockerfile stage names, how the script
check is wired into CI, and the wording of the runbook steps.

## Risks (honest)

Header precedence at the edge (above); `handle` ordering in the edge Caddyfile (the Studio guard must still
evaluate first); the old `web` container blocking the edge's ports during the VPS switch; real amd64 release
images are still built and verified by the owner, not here.
