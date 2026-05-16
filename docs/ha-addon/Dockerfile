# AICONO EMS Gateway v3.0
# =========================================
# Runtime image for the Home Assistant add-on.
# TypeScript wird bereits vor dem Sync ins HA-Add-on-Repository gebaut.
# Der Home-Assistant-Rechner installiert nur noch Laufzeit-Abhängigkeiten und
# muss beim Update nicht mehr selbst TypeScript kompilieren.

FROM node:20-bullseye-slim AS runner

# IMPORTANT: Must run as root to access /data/options.json
# Do NOT add USER or adduser directives here

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Minimal runtime deps – no cloudflared needed in v3.0
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY dist ./dist

# Version aus config.yaml extrahieren – wird als ENV gesetzt, damit Worker-Code
# (ADDON_VERSION) und Add-on-Manifest immer synchron sind.
COPY config.yaml ./config.yaml
RUN grep '^version:' config.yaml | sed -E 's/version: *"?([^"]+)"?/\1/' > /addon_version.txt

# Copy UI files into dist/ so __dirname (which is /app/dist when running
# `node dist/index.js`) finds them via path.join(__dirname, "ui").
COPY ui/ ./dist/ui/

HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:8099/api/status').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))" || exit 1

ENV NODE_ENV=production

# ADDON_VERSION zur Laufzeit aus der beim Build extrahierten Datei lesen –
# garantiert, dass UI-Anzeige === config.yaml-Version.
CMD ["sh", "-c", "export ADDON_VERSION=$(cat /addon_version.txt) && node dist/index.js"]
