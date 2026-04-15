# OCPP Cloud Proxy – Docker Image
# =================================
# Leichtgewichtiger ws:// → wss:// Reverse Proxy
#
# Build:   docker build -t ocpp-cloud-proxy .
# Run:     docker run -d --restart=always -p 80:80 ocpp-cloud-proxy

# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY index.ts ./
RUN npm run build

# ── Stage 2: Production ─────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN addgroup -g 1001 -S nodejs && adduser -S proxy -u 1001

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist/index.js ./index.js

# Non-root user (Port 80 needs NET_BIND_SERVICE or Docker port mapping)
USER proxy

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const http=require('http');http.get('http://localhost:80/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

ENV NODE_ENV=production
ENV LISTEN_PORT=80
ENV LOG_LEVEL=info

CMD ["node", "index.js"]
