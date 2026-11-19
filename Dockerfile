# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
ADD --chmod=644 https://storage.yandexcloud.net/cloud-certs/CA.pem /etc/qronus/yandex-postgresql-ca.pem

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

FROM deps AS migration
COPY drizzle.config.ts tsconfig.json ./
COPY drizzle ./drizzle
COPY src/server/schema.ts src/server/id.ts ./src/server/
USER node
CMD ["npm", "run", "db:migrate"]

FROM deps AS build
WORKDIR /app
COPY . .
# Public build inputs for the generated site, SEO metadata and legal pages.
ARG APP_URL
ARG CONTACT_EMAIL
ARG OWNER_NAME
ARG OWNER_TAX_ID
ARG OWNER_ADDRESS
ARG OWNER_EMAIL
ARG OWNER_PHONE
ARG OWNER_REG_NUMBER
ARG PRIVACY_EMAIL
ENV QRONUS_STANDALONE=1 NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runtime
WORKDIR /app
ARG GIT_COMMIT
ARG APP_URL
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 \
    QRONUS_GIT_COMMIT=${GIT_COMMIT} APP_URL=${APP_URL} DEMO_MODE=true PLATEGA_LIVE_ENABLED=false
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
CMD ["node", "server.js"]
