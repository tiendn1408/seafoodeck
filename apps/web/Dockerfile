# syntax=docker/dockerfile:1
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

FROM caddy:2-alpine AS runtime
ARG RELEASE_TAG=pilot-internal-20261118-r2
LABEL org.opencontainers.image.title="Seafood Deck internal demo" \
      org.opencontainers.image.version=$RELEASE_TAG \
      io.seafoodeck.content-status="draft-internal-only"
COPY deploy/Caddyfile.pilot /etc/caddy/Caddyfile
# Two sites, one image: learner build and Studio build side by side (deploy/Caddyfile.pilot).
COPY --from=build /app/apps/web/dist /srv/learner
COPY --from=build /app/apps/studio/dist /srv/studio
ENV SITE_ADDRESS=seafoodeck.tiendn.io.vn
# STUDIO_SITE_ADDRESS has no default here: unset, the Studio site is not served.
# 8090: local-only Studio site (STUDIO_SITE_ADDRESS=http://localhost:8090).
EXPOSE 80 443 8090
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
