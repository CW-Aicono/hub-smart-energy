import http from "http";
import { randomUUID } from "crypto";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "./config";
import { log } from "./logger";
import { supabase } from "./supabaseClient";
import { loadChargePoint, checkBasicAuth } from "./auth";
import { logOcppMessage } from "./messageLog";
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

    const cp = await loadChargePoint(chargePointId);
    if (!cp) {
      log.warn("Unknown charge point", { chargePointId });
      socket.write("HTTP/1.1 404 Not Found\r\n\r\nUnknown charge point");
      socket.destroy();
      return;
    }

    if (cp.ocpp_password) {
      const ok = checkBasicAuth(req.headers.authorization, cp.ocpp_password);
      if (!ok) {
        log.warn("Auth failed", { chargePointId });
        socket.write(`HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm="OCPP"\r\n\r\n`);
        socket.destroy();
        return;
      }
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

  // DB: connected markieren
  supabase.from("charge_points").update({
    ws_connected: true, ws_connected_since: new Date().toISOString(),
  }).eq("id", chargePointPk).then(({ error }) => {
    if (error) log.warn("ws_connected update failed", { error: error.message });
  });

  const pingTimer = startPing(ws, sessionId, chargePointId);
  ws.on("pong", () => log.debug("pong", { sessionId, chargePointId }));

  ws.on("message", async (raw) => {
    const text = raw.toString();
    session.lastIncomingAt = Date.now();
    log.info("recv", { sessionId, chargePointId, frame: text.substring(0, 200) });
    await logOcppMessage(chargePointId, "incoming", text);

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
      await logOcppMessage(chargePointId, "outgoing", responseStr);
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
    const { error } = await supabase.from("charge_points").update({
      ws_connected: false, ws_connected_since: null,
    }).eq("id", chargePointPk);
    if (error) log.warn("ws_connected=false update failed", { error: error.message });
  });

  ws.on("error", (e) => {
    log.error("WebSocket error", { sessionId, chargePointId, error: e.message });
  });
}

const stopDispatcher = startCommandDispatcher();
const sweeper = startIdleSweeper();

server.listen(config.port, () => {
  log.info("OCPP server started", { port: config.port, domain: config.ocppDomain });
});

function shutdown(signal: string) {
  log.info("Shutdown signal received", { signal });
  clearInterval(sweeper);
  stopDispatcher();
  for (const s of listSessions()) {
    try { s.socket.close(1001, "Server shutdown"); } catch { /* ignore */ }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
