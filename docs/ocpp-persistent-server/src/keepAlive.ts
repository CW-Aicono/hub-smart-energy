import type { WebSocket } from "ws";
import { config } from "./config";
import { log } from "./logger";
import { listSessions, removeSession } from "./chargePointRegistry";
import { updateChargePoint } from "./backendApi";

/**
 * Serverseitiger Liveness-Tick: Wenn der WebSocket beim Ping-Intervall
 * noch OPEN ist, schreiben wir `last_ws_pong_at = now()` in die DB —
 * unabhängig davon, ob der Charger tatsächlich mit Pong antwortet.
 *
 * Hintergrund: Viele Wallbox-Stacks (Compleo u. a.) antworten nicht
 * zuverlässig auf WebSocket-Pings. Der echte Pong-Handler in index.ts
 * bleibt aktiv und überschreibt diesen Tick bei kooperierenden Chargern.
 */
export function startPing(ws: WebSocket, sessionId: string, chargePointId: string, chargePointPk: string) {
  let lastDbTouch = 0;
  const t = setInterval(() => {
    if (ws.readyState !== ws.OPEN) return;
    try {
      ws.ping();
    } catch (e) {
      log.warn("ping failed", { sessionId, chargePointId, error: (e as Error).message });
    }
    // IO-Reduktion: Liveness-Touch max. alle 60 s in die Cloud schreiben,
    // unabhängig vom Ping-Intervall. Vorher: pro Ping ein DB-Write.
    if (Date.now() - lastDbTouch < 60_000) return;
    lastDbTouch = Date.now();
    updateChargePoint(chargePointPk, {
      last_ws_pong_at: new Date().toISOString(),
    }).catch((e) => log.warn("ws liveness touch failed", { chargePointId, error: (e as Error).message }));
  }, config.pingIntervalSec * 1000);
  return t;
}


/** Periodischer Idle-Check: Sessions ohne Frame > IDLE_TIMEOUT_SECONDS werden geschlossen. */
export function startIdleSweeper() {
  return setInterval(() => {
    const now = Date.now();
    const limit = config.idleTimeoutSec * 1000;
    for (const s of listSessions()) {
      const last = Math.max(s.lastIncomingAt, s.lastOutgoingAt);
      if (now - last > limit) {
        log.warn("Idle timeout, closing session", {
          sessionId: s.sessionId,
          chargePointId: s.chargePointId,
          idleMs: now - last,
        });
        try { s.socket.close(1001, "Idle timeout"); } catch { /* ignore */ }
        removeSession(s.chargePointId, s.sessionId);
      }
    }
  }, 30_000);
}
