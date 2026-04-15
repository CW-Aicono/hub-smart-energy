/**
 * OCPP Cloud Proxy – ws:// → wss:// Reverse Proxy
 * =================================================
 * Transparenter Passthrough-Proxy für ältere Wallboxen, die kein TLS (wss://) unterstützen.
 *
 * Eingehend:  ws://ocpp.aicono.org/<OCPP_ID>        (Port 80, unverschlüsselt)
 * Ausgehend:  wss://<SUPABASE_REF>.supabase.co/functions/v1/ocpp-ws-proxy/<OCPP_ID>
 *
 * Features:
 * - Basic Auth wird transparent durchgereicht
 * - OCPP-Subprotokoll (ocpp1.6, ocpp2.0.1) wird korrekt propagiert
 * - Automatische Reconnect-Logik bei Upstream-Trennung
 * - Health-Endpoint auf /health (HTTP GET)
 * - Dual-Mode: Port 80 (ws://) + optional Port 443 (wss://) mit TLS
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { createServer as createHttpsServer } from "https";
import { readFileSync, existsSync } from "fs";
import WebSocket, { WebSocketServer } from "ws";

// ── Configuration ───────────────────────────────────────────────────────────
const LISTEN_PORT = parseInt(process.env.LISTEN_PORT || "80", 10);
const TLS_PORT = parseInt(process.env.TLS_PORT || "443", 10);
const TLS_CERT_PATH = process.env.TLS_CERT_PATH || "/etc/letsencrypt/live/ocpp.aicono.org/fullchain.pem";
const TLS_KEY_PATH = process.env.TLS_KEY_PATH || "/etc/letsencrypt/live/ocpp.aicono.org/privkey.pem";
const ENABLE_TLS = process.env.ENABLE_TLS === "true";

const UPSTREAM_URL = process.env.UPSTREAM_URL
  || "wss://xnveugycurplszevdxtw.supabase.co/functions/v1/ocpp-ws-proxy";

const RECONNECT_DELAY_MS = parseInt(process.env.RECONNECT_DELAY_MS || "3000", 10);
const MAX_RECONNECT_ATTEMPTS = parseInt(process.env.MAX_RECONNECT_ATTEMPTS || "5", 10);
const HEARTBEAT_INTERVAL_MS = parseInt(process.env.HEARTBEAT_INTERVAL_MS || "30000", 10);

const LOG_LEVEL = process.env.LOG_LEVEL || "info";

// ── Logging ─────────────────────────────────────────────────────────────────
const log = {
  info: (...args: unknown[]) => console.log(`[${ts()}] [INFO]`, ...args),
  warn: (...args: unknown[]) => console.warn(`[${ts()}] [WARN]`, ...args),
  error: (...args: unknown[]) => console.error(`[${ts()}] [ERROR]`, ...args),
  debug: (...args: unknown[]) => {
    if (LOG_LEVEL === "debug") console.log(`[${ts()}] [DEBUG]`, ...args);
  },
};

function ts(): string {
  return new Date().toISOString();
}

// ── Metrics ─────────────────────────────────────────────────────────────────
let activeConnections = 0;
let totalConnections = 0;
let totalMessages = 0;

// ── HTTP Server (Health + WebSocket Upgrade) ────────────────────────────────
function handleHttpRequest(req: IncomingMessage, res: ServerResponse) {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      uptime: process.uptime(),
      activeConnections,
      totalConnections,
      totalMessages,
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  if (req.url === "/metrics") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end([
      `# HELP ocpp_proxy_active_connections Current active WebSocket connections`,
      `# TYPE ocpp_proxy_active_connections gauge`,
      `ocpp_proxy_active_connections ${activeConnections}`,
      `# HELP ocpp_proxy_total_connections Total connections since start`,
      `# TYPE ocpp_proxy_total_connections counter`,
      `ocpp_proxy_total_connections ${totalConnections}`,
      `# HELP ocpp_proxy_total_messages Total messages proxied`,
      `# TYPE ocpp_proxy_total_messages counter`,
      `ocpp_proxy_total_messages ${totalMessages}`,
    ].join("\n") + "\n");
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("AICONO OCPP Cloud Proxy – use ws:// or wss:// to connect your charge point.\n");
}

const httpServer = createServer(handleHttpRequest);
const wss = new WebSocketServer({ server: httpServer });

// ── Optional TLS Server ─────────────────────────────────────────────────────
let tlsWss: WebSocketServer | null = null;

if (ENABLE_TLS && existsSync(TLS_CERT_PATH) && existsSync(TLS_KEY_PATH)) {
  const httpsServer = createHttpsServer({
    cert: readFileSync(TLS_CERT_PATH),
    key: readFileSync(TLS_KEY_PATH),
  }, handleHttpRequest);

  tlsWss = new WebSocketServer({ server: httpsServer });
  tlsWss.on("connection", handleConnection);

  httpsServer.listen(TLS_PORT, () => {
    log.info(`🔒 TLS WebSocket server listening on wss://0.0.0.0:${TLS_PORT}`);
  });
}

// ── WebSocket Proxy Logic ───────────────────────────────────────────────────
function handleConnection(clientWs: WebSocket, req: IncomingMessage) {
  const ocppId = extractOcppId(req.url || "");
  if (!ocppId) {
    log.warn("Connection rejected: no OCPP ID in path", req.url);
    clientWs.close(4000, "Missing OCPP ID in URL path");
    return;
  }

  activeConnections++;
  totalConnections++;
  log.info(`⚡ New connection: ${ocppId} (active: ${activeConnections})`);

  // Extract subprotocols from client request
  const subprotocols = extractSubprotocols(req);
  log.debug(`Subprotocols from client: ${subprotocols.join(", ") || "none"}`);

  // Build upstream URL
  const upstreamUrl = `${UPSTREAM_URL}/${ocppId}`;

  // Build upstream headers (pass through auth)
  const upstreamHeaders: Record<string, string> = {};
  if (req.headers.authorization) {
    upstreamHeaders["Authorization"] = req.headers.authorization;
  }

  // Connect to upstream
  let upstreamWs: WebSocket | null = null;
  let reconnectAttempts = 0;
  let isClosing = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  function connectUpstream() {
    if (isClosing) return;

    log.debug(`Connecting upstream for ${ocppId}: ${upstreamUrl}`);

    upstreamWs = new WebSocket(upstreamUrl, subprotocols, {
      headers: upstreamHeaders,
      handshakeTimeout: 10000,
    });

    upstreamWs.on("open", () => {
      reconnectAttempts = 0;
      log.info(`🔗 Upstream connected for ${ocppId}`);

      // Start heartbeat
      heartbeatTimer = setInterval(() => {
        if (upstreamWs?.readyState === WebSocket.OPEN) {
          upstreamWs.ping();
        }
      }, HEARTBEAT_INTERVAL_MS);
    });

    // Upstream → Client
    upstreamWs.on("message", (data, isBinary) => {
      totalMessages++;
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data, { binary: isBinary });
        log.debug(`↓ ${ocppId}: ${isBinary ? "[binary]" : data.toString().substring(0, 120)}`);
      }
    });

    upstreamWs.on("close", (code, reason) => {
      log.info(`Upstream closed for ${ocppId}: ${code} ${reason.toString()}`);
      clearHeartbeat();

      if (!isClosing && clientWs.readyState === WebSocket.OPEN) {
        attemptReconnect();
      }
    });

    upstreamWs.on("error", (err) => {
      log.error(`Upstream error for ${ocppId}:`, err.message);
    });
  }

  function attemptReconnect() {
    if (isClosing || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        log.warn(`Max reconnect attempts reached for ${ocppId}, closing client`);
        clientWs.close(4001, "Upstream unavailable");
      }
      return;
    }

    reconnectAttempts++;
    const delay = RECONNECT_DELAY_MS * reconnectAttempts;
    log.info(`Reconnecting upstream for ${ocppId} in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
    setTimeout(connectUpstream, delay);
  }

  function clearHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function cleanup() {
    isClosing = true;
    activeConnections--;
    clearHeartbeat();
    if (upstreamWs && upstreamWs.readyState !== WebSocket.CLOSED) {
      upstreamWs.close();
    }
    log.info(`🔌 Disconnected: ${ocppId} (active: ${activeConnections})`);
  }

  // Client → Upstream
  clientWs.on("message", (data, isBinary) => {
    totalMessages++;
    if (upstreamWs?.readyState === WebSocket.OPEN) {
      upstreamWs.send(data, { binary: isBinary });
      log.debug(`↑ ${ocppId}: ${isBinary ? "[binary]" : data.toString().substring(0, 120)}`);
    } else {
      log.warn(`Upstream not ready for ${ocppId}, buffering not implemented – message dropped`);
    }
  });

  clientWs.on("close", () => cleanup());
  clientWs.on("error", (err) => {
    log.error(`Client error for ${ocppId}:`, err.message);
    cleanup();
  });

  // Initiate upstream connection
  connectUpstream();
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function extractOcppId(url: string): string | null {
  // URL format: /<OCPP_ID> or /<OCPP_ID>?params
  const match = url.match(/^\/([^/?]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function extractSubprotocols(req: IncomingMessage): string[] {
  const header = req.headers["sec-websocket-protocol"];
  if (!header) return ["ocpp1.6"];
  return header.split(",").map((p) => p.trim());
}

// ── Start ───────────────────────────────────────────────────────────────────
wss.on("connection", handleConnection);

httpServer.listen(LISTEN_PORT, () => {
  log.info(`🚀 AICONO OCPP Cloud Proxy v1.0.0`);
  log.info(`   ws://0.0.0.0:${LISTEN_PORT}/<OCPP_ID>`);
  log.info(`   Upstream: ${UPSTREAM_URL}`);
  log.info(`   TLS: ${ENABLE_TLS ? "enabled" : "disabled"}`);
});

// ── Graceful Shutdown ───────────────────────────────────────────────────────
function shutdown(signal: string) {
  log.info(`${signal} received, shutting down...`);

  wss.clients.forEach((client) => {
    client.close(1001, "Server shutting down");
  });

  if (tlsWss) {
    tlsWss.clients.forEach((client) => {
      client.close(1001, "Server shutting down");
    });
  }

  httpServer.close(() => {
    log.info("HTTP server closed");
    process.exit(0);
  });

  setTimeout(() => {
    log.warn("Forced shutdown after timeout");
    process.exit(1);
  }, 5000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
