import http from "http";
import { randomUUID } from "crypto";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "./config";
import { log } from "./logger";
import { loadChargePoint } from "./auth";
import { logOcppMessage } from "./messageLog";
import { updateChargePoint } from "./backendApi";
import { handleCall } from "./ocppHandler";
import { registerSession, removeSession, getSession, listSessions } from "./chargePointRegistry";
import { startPing, startIdleSweeper } from "./keepAlive";
import { startCommandDispatcher, resolvePendingCall } from "./commandDispatcher";

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    const body = JSON.stringify({
      status: "ok",
      uptimeSeconds: Math.round(process.uptime()),
      sessions: listSessions().length,
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(body);
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found", info: "OCPP WebSocket server" }));
});

const wss = new WebSocketServer({ noServer: true, handleProtocols: () => config.ocppSubprotocol });

server.on("upgrade", async (req, socket, head) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const parts = url.pathname.split("/").filter(Boolean);
    const chargePointId = parts[parts.length - 1];

    if (!chargePointId) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\nMissing charge point id");
      socket.destroy();
      return;
    }

    const auth = await loadChargePoint(chargePointId, req.headers.authorization);
    const cp = auth.chargePoint;
    if (!cp) {
      log.warn(auth.message, { chargePointId });
      if (auth.statusCode === 401) {
        socket.write(`HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm="OCPP"\r\n\r\n`);
      } else {
        socket.write(`HTTP/1.1 ${auth.statusCode} ${auth.message}\r\n\r\n${auth.message}`);
      }
      socket.destroy();
      return;
    }

    if (auth.authSkipped) {
      log.info("Accepting unauthenticated connection", { chargePointId, authRequired: cp.auth_required });
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      handleConnection(ws, cp.ocpp_id, cp.id, cp.tenant_id);
    });
  } catch (e) {
    log.error("upgrade failed", { error: (e as Error).message });
    try { socket.destroy(); } catch { /* ignore */ }
  }
});

function handleConnection(ws: WebSocket, chargePointId: string, chargePointPk: string, tenantId: string) {
  const sessionId = randomUUID().substring(0, 8);
  const now = Date.now();
  const session = {
    sessionId, chargePointId, chargePointPk, tenantId,
    socket: ws, openedAt: now, lastIncomingAt: now, lastOutgoingAt: now,
    pendingCalls: new Map(),
  };
  registerSession(session);
  log.info("WebSocket open", { sessionId, chargePointId });

  // ws_connected=true mit Retry. Fire-and-forget hat in der Vergangenheit
  // dazu geführt, dass das Flag bei einem kurzen Backend-Fehler permanent
  // false blieb. Jetzt: bis zu 3 Versuche mit exponential backoff.
  void markConnectedWithRetry(chargePointPk, sessionId, chargePointId);

  const pingTimer = startPing(ws, sessionId, chargePointId);
  ws.on("pong", () => log.debug("pong", { sessionId, chargePointId }));

  ws.on("message", async (raw) => {
    const text = raw.toString();
    session.lastIncomingAt = Date.now();
    log.info("recv", { sessionId, chargePointId, frame: text.substring(0, 200) });
    // WICHTIG: Logs werden mit der UUID (chargePointPk) geschrieben, damit das
    // Frontend (das per UUID filtert) sie zuordnen kann.
    await logOcppMessage(chargePointPk, "incoming", text);

    let msg: unknown;
    try { msg = JSON.parse(text); } catch {
      log.warn("non-JSON frame", { sessionId, chargePointId });
      return;
    }
    if (!Array.isArray(msg)) return;

    const [type, messageId] = msg as [number, string, ...unknown[]];

    // CALLRESULT / CALLERROR vom Charger → unsere Remote-Commands
    if (type === 3) {
      const handled = await resolvePendingCall(chargePointId, messageId, {
        status: "Accepted", payload: msg[2],
      });
      if (handled) return;
    }
    if (type === 4) {
      const handled = await resolvePendingCall(chargePointId, messageId, {
        status: "Rejected", errorCode: msg[2] as string, errorDescription: msg[3] as string,
      });
      if (handled) return;
    }

    // CALL vom Charger → wir antworten
    if (type === 2) {
      const response = await handleCall(session, msg as [2, string, string, Record<string, unknown>]);
      const responseStr = JSON.stringify(response);
      session.lastOutgoingAt = Date.now();
      await logOcppMessage(chargePointPk, "outgoing", responseStr);
      if (ws.readyState === ws.OPEN) ws.send(responseStr);
      log.info("send", { sessionId, chargePointId, frame: responseStr.substring(0, 200) });
    }
  });

  ws.on("close", async (code, reason) => {
    clearInterval(pingTimer);
    const reasonStr = reason?.toString() ?? "";
    log.info("WebSocket closed", {
      sessionId, chargePointId, code, reason: reasonStr,
      openedAt: new Date(session.openedAt).toISOString(),
      lastIncomingAt: new Date(session.lastIncomingAt).toISOString(),
      lastOutgoingAt: new Date(session.lastOutgoingAt).toISOString(),
      durationSec: Math.round((Date.now() - session.openedAt) / 1000),
    });
    removeSession(chargePointId, sessionId);
    try {
      await updateChargePoint(chargePointPk, {
        ws_connected: false,
        ws_connected_since: null,
      });
    } catch (error) {
      log.warn("ws_connected=false update failed", { error: (error as Error).message });
    }
  });

  ws.on("error", (e) => {
    log.error("WebSocket error", { sessionId, chargePointId, error: e.message });
  });
}

async function markConnectedWithRetry(chargePointPk: string, sessionId: string, chargePointId: string) {
  const sinceIso = new Date().toISOString();
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await updateChargePoint(chargePointPk, {
        ws_connected: true,
        ws_connected_since: sinceIso,
      });
      if (attempt > 1) {
        log.info("ws_connected=true updated after retry", { sessionId, chargePointId, attempt });
      }
      return;
    } catch (error) {
      const msg = (error as Error).message;
      if (attempt === maxAttempts) {
        log.error("ws_connected=true update FAILED after retries; relying on Heartbeat self-heal", {
          sessionId, chargePointId, attempt, error: msg,
        });
        return;
      }
      const delayMs = 500 * Math.pow(2, attempt - 1); // 500, 1000
      log.warn("ws_connected=true update failed, retrying", { sessionId, chargePointId, attempt, delayMs, error: msg });
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

// Periodischer Re-Sync: alle 60 s wird für jede aktive Session ws_connected=true
// in die DB geschrieben. Das schützt vor Edge-Cases, in denen Connect-Update UND
// alle bisherigen Heartbeat-Updates an Backend-Fehlern gescheitert sind.
const reconcileTimer = setInterval(() => {
  for (const s of listSessions()) {
    updateChargePoint(s.chargePointPk, { ws_connected: true }).catch((error) => {
      log.debug("periodic ws_connected reconcile failed", {
        sessionId: s.sessionId, chargePointId: s.chargePointId, error: (error as Error).message,
      });
    });
  }
}, 60_000);

const stopDispatcher = startCommandDispatcher();
const sweeper = startIdleSweeper();

async function startServer() {
  if (config.startupCheckOcppId) {
    const auth = await loadChargePoint(config.startupCheckOcppId);
    if (!auth.chargePoint) {
      log.warn("Startup check failed, continuing server start", {
        chargePointId: config.startupCheckOcppId,
        message: auth.message,
      });
    } else {
      log.info("Startup check ok", { chargePointId: config.startupCheckOcppId });
    }
  }

  server.listen(config.port, () => {
    log.info("OCPP server started", { port: config.port, domain: config.ocppDomain });
  });
}

startServer().catch((error) => {
  log.error("OCPP server startup failed", { error: (error as Error).message });
  process.exit(1);
});

function shutdown(signal: string) {
  log.info("Shutdown signal received", { signal });
  clearInterval(sweeper);
  clearInterval(reconcileTimer);
  stopDispatcher();
  for (const s of listSessions()) {
    try { s.socket.close(1001, "Server shutdown"); } catch { /* ignore */ }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
