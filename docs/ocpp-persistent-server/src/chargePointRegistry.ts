import type { WebSocket } from "ws";

export interface PendingCall {
  commandId: string;
  createdAt: number;
}

export interface Session {
  sessionId: string;
  chargePointId: string;
  chargePointPk: string; // PK aus charge_points.id
  tenantId: string;
  socket: WebSocket;
  openedAt: number;
  lastIncomingAt: number;
  lastOutgoingAt: number;
  pendingCalls: Map<string, PendingCall>;
}

const sessions = new Map<string, Session>(); // key = chargePointId

export function registerSession(s: Session) {
  // Falls bereits eine Session existiert → schließen, neue gewinnt
  const existing = sessions.get(s.chargePointId);
  if (existing && existing.sessionId !== s.sessionId) {
    try { existing.socket.close(1000, "Replaced by new connection"); } catch { /* ignore */ }
  }
  sessions.set(s.chargePointId, s);
}

export function getSession(chargePointId: string): Session | undefined {
  return sessions.get(chargePointId);
}

export function removeSession(chargePointId: string, sessionId: string) {
  const cur = sessions.get(chargePointId);
  if (cur && cur.sessionId === sessionId) sessions.delete(chargePointId);
}

export function listSessions(): Session[] {
  return Array.from(sessions.values());
}
