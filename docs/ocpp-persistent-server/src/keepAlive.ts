import type { WebSocket } from "ws";
import { config } from "./config";
import { log } from "./logger";
import { listSessions, removeSession } from "./chargePointRegistry";

export function startPing(ws: WebSocket, sessionId: string, chargePointId: string) {
  const t = setInterval(() => {
    if (ws.readyState !== ws.OPEN) return;
    try {
      ws.ping();
    } catch (e) {
      log.warn("ping failed", { sessionId, chargePointId, error: (e as Error).message });
    }
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
