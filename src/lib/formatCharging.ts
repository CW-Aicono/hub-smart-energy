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
  if (wsConnected === false) return "offline";
  return (raw ?? "").toLowerCase();
}

/**
 * Decides whether a charge point is "online" for UI purposes.
 *
 * Priority:
 *   1. Fresh heartbeat (< 3 min) → online, even if `ws_connected` is null/false
 *      (older OCPP-server builds e.g. on Hetzner may never have written
 *      `ws_connected=true`, but they keep updating `last_heartbeat`).
 *   2. Explicit `ws_connected === true` → online.
 *   3. Otherwise offline.
 *
 * Fixes the case where the CP-level badge showed "Verfügbar" but each
 * connector card showed "Offline" due to inconsistent fallback logic.
 */
export function isChargePointOnline(
  wsConnected: boolean | null | undefined,
  lastHeartbeat: string | null | undefined,
  freshMs: number = 3 * 60 * 1000,
): boolean {
  if (lastHeartbeat) {
    const age = Date.now() - new Date(lastHeartbeat).getTime();
    if (Number.isFinite(age) && age >= 0 && age < freshMs) return true;
  }
  return wsConnected === true;
}
