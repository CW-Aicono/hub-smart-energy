# AICONO EMS Gateway v3.0
# =========================================
# Multi-stage build for minimal production image.
# v3.0: Cloudflared entfernt – Worker kommuniziert ausschließlich via
#       ausgehende WebSocket-Verbindung zur AICONO Cloud.

# ── Stage 1: Build TypeScript ────────────────────────────────────────────────
FROM node:20-bullseye-slim AS builder

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install

COPY index.ts ./
RUN npm run build && npm prune --omit=dev

# Version aus config.yaml extrahieren – wird im Runner-Stage als ENV gesetzt,
# damit Worker-Code (ADDON_VERSION) und Add-on-Manifest immer synchron sind.
COPY config.yaml ./config.yaml
RUN grep '^version:' config.yaml | sed -E 's/version: *"?([^"]+)"?/\1/' > /addon_version.txt

# ── Stage 2: Production image ────────────────────────────────────────────────
FROM node:20-alpine AS runner

# IMPORTANT: Must run as root to access /data/options.json
# Do NOT add USER or adduser directives here

WORKDIR /app

# Minimal runtime deps – no cloudflared needed in v3.0
RUN apk add --no-cache ca-certificates

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist/index.js ./index.js
COPY --from=builder /addon_version.txt /addon_version.txt

# Copy UI files
COPY ui/ ./ui/

HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:8099/api/status').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))" || exit 1

ENV NODE_ENV=production

# ADDON_VERSION zur Laufzeit aus der beim Build extrahierten Datei lesen –
# garantiert, dass UI-Anzeige === config.yaml-Version.
CMD ["sh", "-c", "export ADDON_VERSION=$(cat /addon_version.txt) && node index.js"]
