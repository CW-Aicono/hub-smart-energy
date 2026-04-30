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
