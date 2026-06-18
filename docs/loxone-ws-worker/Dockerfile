# Loxone WS Worker – Dockerfile
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY index.ts ./
RUN npm run build

FROM node:20-alpine AS runner
RUN addgroup -g 1001 -S nodejs && adduser -S worker -u 1001
USER worker
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist/index.js ./index.js

ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV FLUSH_INTERVAL_MS=1000
ENV RELOAD_INTERVAL_MS=300000

HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1

CMD ["node", "index.js"]
