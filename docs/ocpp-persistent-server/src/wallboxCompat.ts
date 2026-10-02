/**
 * Kompatibilitäts-Helfer für ältere Wallboxen, die bei bestimmten OCPP-Calls
 * die WebSocket-Verbindung trennen (Code 1006) oder in einen Reboot-Loop laufen.
 *
 * Aktuell betroffen:
 *   - wallbe "Smart Charge Control" mit Firmware BF-01.04.x
 *     -> trennt nach GetConfiguration die Verbindung
 *     -> Capability-Probe deshalb komplett überspringen
 *     -> GetConfiguration aus der Warteschlange nicht senden
 */

export interface WallboxIdentity {
  vendor?: string | null;
  model?: string | null;
  firmware_version?: string | null;
}

function norm(v: string | null | undefined): string {
  return (v ?? "").toString().trim().toLowerCase();
}

/** wallbe Smart Charge Control mit alter BF-01.04.x Firmware. */
export function isLegacyWallbe(meta: WallboxIdentity): boolean {
  const vendor = norm(meta.vendor);
  const model = norm(meta.model);
  const fw = norm(meta.firmware_version);
  if (vendor !== "wallbe") return false;
  // Vorsichtig: auch ohne explizites Modell sperren, wenn FW BF-01.04.x.
  const isOldFirmware = fw.startsWith("bf-01.04");
  const isSmartChargeControl = model.includes("smart charge control");
  return isOldFirmware || isSmartChargeControl;
}

/** OCPP-Actions, die bei o. g. Wallboxen NICHT gesendet werden dürfen. */
export const LEGACY_WALLBE_BLOCKED_ACTIONS = new Set<string>([
  "GetConfiguration",
]);
