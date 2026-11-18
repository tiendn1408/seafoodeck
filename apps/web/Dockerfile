# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
ARG RELEASE_TAG=pilot-internal-20261118-r2
ENV VITE_RELEASE_TAG=$RELEASE_TAG
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci --workspace @seafoodeck/web --ignore-scripts
WORKDIR /app/apps/web
COPY apps/web/tsconfig.json apps/web/tsconfig.build.json apps/web/vite.config.ts apps/web/playwright.config.ts apps/web/index.html ./
COPY apps/web/src ./src
COPY apps/web/public ./public
COPY apps/web/e2e ./e2e
RUN npm run build

FROM caddy:2-alpine AS runtime
ARG RELEASE_TAG=pilot-internal-20261118-r2
LABEL org.opencontainers.image.title="Seafood Deck internal demo" \
      org.opencontainers.image.version=$RELEASE_TAG \
      io.seafoodeck.content-status="draft-internal-only"
COPY deploy/Caddyfile.pilot /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
ENV SITE_ADDRESS=seafoodeck.tiendn.io.vn
EXPOSE 80 443
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
