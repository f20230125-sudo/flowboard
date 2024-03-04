# syntax=docker/dockerfile:1

# Three stages, so the image that runs holds the built app and nothing else:
# no source, no dev dependencies, no build tools.

# 1. Install dependencies. Kept apart so this layer is reused until
#    package-lock.json changes.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 2. Build. BUILD_STANDALONE makes Next.js write a self-contained server to
#    .next/standalone (see next.config.ts).
FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV BUILD_STANDALONE=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 3. Run, as a user without root rights.
FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -S flowboard && adduser -S flowboard -G flowboard
COPY --from=build --chown=flowboard:flowboard /app/.next/standalone ./
COPY --from=build --chown=flowboard:flowboard /app/.next/static ./.next/static
COPY --from=build --chown=flowboard:flowboard /app/public ./public
USER flowboard
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
