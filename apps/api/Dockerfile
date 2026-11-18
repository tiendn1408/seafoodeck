FROM node:24-alpine AS base
RUN apk add --no-cache openssl ffmpeg
FROM base AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace @seafoodeck/api --ignore-scripts
COPY apps/api apps/api
RUN npm run build --workspace @seafoodeck/api
RUN npm prune --workspace @seafoodeck/api --omit=dev --ignore-scripts && rm -f apps/api/dist/*.test.js
FROM base AS runtime
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
WORKDIR /app/apps/api
ARG RELEASE_TAG=pilot-internal-20261118-r2
ENV RELEASE_TAG=$RELEASE_TAG
ENV NODE_ENV=production
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=4s --start-period=30s --retries=5 CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
