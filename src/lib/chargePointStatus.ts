/**
 * Zentrales Mapping von OCPP-1.6-Status-Strings auf interne UI-Kategorien.
 * Wird sowohl im Tenant-UI als auch im öffentlichen Status-Link verwendet,
 * damit beide Ansichten denselben Zustand zeigen.
 *
 * OCPP-1.6-Statuswerte: Available, Preparing, Charging, SuspendedEV,
 * SuspendedEVSE, Finishing, Reserved, Unavailable, Faulted.
 * Einige Wallboxen senden zusätzlich "Occupied".
 */
export type ChargePointStatusKey =
  | "available"
  | "charging"
  | "preparing"
  | "suspended_ev"
  | "suspended_evse"
  | "finishing"
  | "reserved"
  | "occupied"
  | "faulted"
  | "offline"
  | "unavailable"
  | "unknown"
  | "unconfigured";

export interface ChargePointStatusInput {
  /** Hat keine OCPP-ID -> wird in der UI als "unconfigured" angezeigt */
  hasOcppId?: boolean;
  /** WS-Verbindung aktiv? Bei false -> offline */
  wsConnected?: boolean | null;
  /** OCPP-Status der Wallbox bzw. eines Steckers */
  rawStatus?: string | null;
}

export function normalizeChargePointStatus(
  input: ChargePointStatusInput,
): ChargePointStatusKey {
  if (input.hasOcppId === false) return "unconfigured";
  if (!input.wsConnected) return "offline";

  const s = (input.rawStatus ?? "").toLowerCase().trim();

  if (s === "") return "unknown";

  if (s.includes("fault") || s.includes("error")) return "faulted";
  if (s.includes("unavailable") || s.includes("inoperative")) return "unavailable";

  const compact = s.replace(/[\s_-]/g, "");
  const ocppStatuses: Record<string, ChargePointStatusKey> = {
    available: "available", preparing: "preparing", charging: "charging",
    suspendedev: "suspended_ev", suspendedevse: "suspended_evse",
    finishing: "finishing", reserved: "reserved", occupied: "occupied",
    offline: "offline", unconfigured: "unconfigured", unknown: "unknown",
  };
  if (ocppStatuses[compact]) return ocppStatuses[compact];

  if (s.includes("avail")) return "available";

  // Unbekannten Status nicht stillschweigend als "verfügbar" interpretieren.
  return "unknown";
}
