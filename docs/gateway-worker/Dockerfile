# Gateway Worker – Docker Image
# ==============================
# Multi-stage build for minimal production image
#
# Build:   docker build -t gateway-worker .
# Run:     docker run -d --restart=always \
#            -e SUPABASE_URL=https://xnveugycurplszevdxtw.supabase.co \
#            -e GATEWAY_API_KEY=dein-api-key \
#            -e POLL_INTERVAL_MS=30000 \
#            -e FLUSH_INTERVAL_MS=1000 \
#            gateway-worker

# ── Stage 1: Build TypeScript ────────────────────────────────────────────────
FROM node:20-alpine AS builder

# bufferutil (dependency of lxcommunicator) needs python3 + build tools
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY index.ts ./
RUN npm run build

# ── Stage 2: Production image ────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Security: run as non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S worker -u 1001
USER worker

WORKDIR /app

# Only copy production dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist/index.js ./index.js

# Health check – ensures the container is restarted if the process crashes
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1

# Environment variable defaults (override at runtime)
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV POLL_INTERVAL_MS=30000

# OCPP ws:// Proxy Port (optional – nur setzen wenn benötigt)
# ENV OCPP_PROXY_PORT=9000
# ENV OCPP_PROXY_TARGET=wss://ocpp.aicono.org

CMD ["node", "index.js"]
