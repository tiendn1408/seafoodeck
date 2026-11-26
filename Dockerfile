# syntax=docker/dockerfile:1
# Web tier images (phase 2.5e split), one file, three runtime targets:
#   edge        TLS, headers, /api/* and S3 proxy, Studio guard; no app files (deploy/edge/Caddyfile)
#   web-learner learner build only, plain HTTP for the edge (deploy/web/Caddyfile)
#   web-studio  Studio build only, same Caddyfile as web-learner
# `build` compiles both apps and runs the learner/Studio boundary guard once, so every target fails on a leak.
FROM node:24-alpine AS build
ARG RELEASE_TAG=pilot-internal-20261118-r2
ENV VITE_RELEASE_TAG=$RELEASE_TAG
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/studio/package.json apps/studio/package.json
RUN npm ci --workspace @seafoodeck/web --workspace @seafoodeck/studio --ignore-scripts
WORKDIR /app/apps/web
COPY apps/web/tsconfig.json apps/web/tsconfig.build.json apps/web/vite.config.ts apps/web/playwright.config.ts apps/web/index.html ./
COPY apps/web/src ./src
COPY apps/web/public ./public
COPY apps/web/e2e ./e2e
WORKDIR /app/apps/studio
COPY apps/studio/tsconfig.json apps/studio/tsconfig.build.json apps/studio/vite.config.ts apps/studio/index.html ./
COPY apps/studio/src ./src
WORKDIR /app
COPY scripts/check-bundles.mjs scripts/check-bundles.mjs
RUN npm run build --workspace @seafoodeck/web \
 && npm run build --workspace @seafoodeck/studio \
 && node scripts/check-bundles.mjs

FROM caddy:2-alpine AS web-learner
ARG RELEASE_TAG=pilot-internal-20261118-r2
LABEL org.opencontainers.image.title="Seafood Deck internal demo (learner web)" \
      org.opencontainers.image.version=$RELEASE_TAG \
      io.seafoodeck.content-status="draft-internal-only"
COPY deploy/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv/app
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8081/healthz || exit 1

FROM caddy:2-alpine AS web-studio
ARG RELEASE_TAG=pilot-internal-20261118-r2
LABEL org.opencontainers.image.title="Seafood Deck internal demo (Studio web)" \
      org.opencontainers.image.version=$RELEASE_TAG \
      io.seafoodeck.content-status="draft-internal-only"
COPY deploy/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/studio/dist /srv/app
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8081/healthz || exit 1

# Last stage: a plain `docker build .` without --target still gives the edge, not an app image.
FROM caddy:2-alpine AS edge
ARG RELEASE_TAG=pilot-internal-20261118-r2
LABEL org.opencontainers.image.title="Seafood Deck internal demo (edge)" \
      org.opencontainers.image.version=$RELEASE_TAG \
      io.seafoodeck.content-status="draft-internal-only"
COPY deploy/edge/Caddyfile /etc/caddy/Caddyfile
# The edge copies nothing from `build`, so BuildKit would skip it; this mount (nothing is copied) makes the
# edge build wait for the build stage, i.e. for check-bundles.mjs to pass, like the two web targets.
RUN --mount=type=bind,from=build,source=/app/apps/web/dist/index.html,target=/tmp/bundles-checked true
ENV SITE_ADDRESS=seafoodeck.tiendn.io.vn
# STUDIO_SITE_ADDRESS has no default here: unset, the Studio site is not served.
# 8090: local-only Studio site (STUDIO_SITE_ADDRESS=http://localhost:8090).
EXPOSE 80 443 8090
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
