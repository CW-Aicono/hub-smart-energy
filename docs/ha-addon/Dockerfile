# AICONO EMS Gateway
# =========================================
# Multi-stage build for minimal production image

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

# IMPORTANT: Must run as root to access /data/options.json
# Do NOT add USER or adduser directives here

WORKDIR /app

# Install cloudflared (multi-arch) for optional Cloudflare Tunnel
RUN apk add --no-cache curl ca-certificates && \
    ARCH=$(uname -m) && \
    case "$ARCH" in \
      x86_64)   CF_ARCH="amd64" ;; \
      aarch64)  CF_ARCH="arm64" ;; \
      armv7l)   CF_ARCH="arm" ;; \
      *)        CF_ARCH="amd64" ;; \
    esac && \
    curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}" \
      -o /usr/local/bin/cloudflared && \
    chmod +x /usr/local/bin/cloudflared

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist/index.js ./index.js

# Copy UI files
COPY ui/ ./ui/

HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:8099/api/status').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))" || exit 1

ENV NODE_ENV=production

CMD ["node", "index.js"]
