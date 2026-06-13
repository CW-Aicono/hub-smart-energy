import { normalizeChargePointStatus } from "@/lib/chargePointStatus";

/**
 * Formats a number with German locale (dot as thousands separator, comma as decimal).
 * @param value - The number to format
 * @param decimals - Number of decimal places (default: 2)
 */
export function fmtNum(value: number, decimals: number = 2): string {
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Formats a currency value in German locale with € symbol.
 */
export function fmtCurrency(value: number, decimals: number = 2): string {
  return `${fmtNum(value, decimals)} €`;
}

/**
 * Formats a kWh value in German locale.
 */
export function fmtKwh(value: number, decimals: number = 2): string {
  return `${fmtNum(value, decimals)} kWh`;
}

/**
 * Formats a kW value in German locale.
 */
export function fmtKw(value: number, decimals: number = 1): string {
  return `${fmtNum(value, decimals)} kW`;
}

/**
 * Normalizes an OCPP connector/charge-point status to lowercase, so that
 * frontend lookups work regardless of whether the backend (Hetzner OCPP server,
 * ws-proxy, edge function, etc.) stored "Available" or "available".
 *
 * If `wsConnected` is explicitly `false`, the status is forced to "offline".
 * Pass `true` (default) when you don't have / don't need a connectivity check.
 */
export function normalizeConnectorStatus(
  raw: string | null | undefined,
  wsConnected: boolean = true,
): string {
  return normalizeChargePointStatus({ rawStatus: raw, wsConnected });
}

export function isOccupiedChargingStatus(raw: string | null | undefined): boolean {
  return normalizeChargePointStatus({ rawStatus: raw, wsConnected: true }) === "charging";
}

/**
 * Decides whether a charge point is "online" for UI purposes.
 *
 * Priority:
 *   1. Fresh WebSocket pong (`last_ws_pong_at` < 2 min) → online.
 *      Das ist das echte Liveness-Signal: Der OCPP-Server pingt die Wallbox
 *      alle 30 s; sobald die Wallbox mit Pong antwortet, schreiben wir den
 *      Zeitstempel in die DB. Dieses Feld kommt auch dann, wenn Compleo &
 *      Co. wegen `HeartbeatInterval=86400` stundenlang keine OCPP-Frames
 *      senden.
 *   2. Fallback Fresh `last_heartbeat` (< 3 min) → online (für ältere
 *      OCPP-Server-Builds ohne `last_ws_pong_at`).
 *   3. Explicit `ws_connected === true` → online.
 *   4. Otherwise offline.
 */
export function isChargePointOnline(
  wsConnected: boolean | null | undefined,
  lastHeartbeat: string | null | undefined,
  freshMs: number = 3 * 60 * 1000,
  lastWsPongAt?: string | null | undefined,
): boolean {
  if (lastWsPongAt) {
    const age = Date.now() - new Date(lastWsPongAt).getTime();
    // Pong-Intervall ist 30 s → 2 Min Toleranz reicht für eine verpasste Runde.
    if (Number.isFinite(age) && age >= 0 && age < 2 * 60 * 1000) return true;
  }
  if (lastHeartbeat) {
    const age = Date.now() - new Date(lastHeartbeat).getTime();
    if (Number.isFinite(age) && age >= 0 && age < freshMs) return true;
  }
  return wsConnected === true;
}
