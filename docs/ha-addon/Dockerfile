# EMS Gateway Hub – Home Assistant Add-on
# =========================================
# Multi-stage build for minimal production image
#
# Dieses Image wird automatisch vom HA Supervisor gebaut.

# ── Stage 1: Build TypeScript ────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json tsconfig.json ./
RUN npm install

COPY index.ts ./
RUN npm run build && npm prune --omit=dev

# ── Stage 2: Production image ────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN addgroup -g 1001 -S nodejs && adduser -S worker -u 1001

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist/index.js ./index.js

# SQLite DB directory for offline buffer (persisted via HA add-on data mount)
RUN mkdir -p /data/db && chown worker:nodejs /data/db

USER worker

HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:8099/api/status').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))" || exit 1

ENV NODE_ENV=production

CMD ["node", "index.js"]
