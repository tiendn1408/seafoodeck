# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
ARG RELEASE_TAG=flat-illustrations-20261117
ENV VITE_RELEASE_TAG=$RELEASE_TAG
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts playwright.config.ts index.html ./
COPY src ./src
COPY public ./public
COPY e2e ./e2e
RUN npm run build

FROM caddy:2-alpine AS runtime
ARG RELEASE_TAG=flat-illustrations-20261117
LABEL org.opencontainers.image.title="Seafood Deck internal demo" \
      org.opencontainers.image.version=$RELEASE_TAG \
      io.seafoodeck.content-status="draft-internal-only"
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
ENV SITE_ADDRESS=seafoodeck.tiendn.io.vn
EXPOSE 80 443
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
