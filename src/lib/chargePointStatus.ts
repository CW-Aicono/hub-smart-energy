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
  | "faulted"
  | "offline"
  | "unavailable"
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

  if (s === "") return "unconfigured";

  if (s.includes("fault") || s.includes("error")) return "faulted";
  if (s.includes("unavailable") || s.includes("inoperative")) return "unavailable";

  // Alle Zustände, bei denen ein Fahrzeug verbunden ist oder geladen wird,
  // gelten in der Übersicht als "in Nutzung" (= belegt).
  if (
    s.includes("charg") ||
    s.includes("occup") ||
    s.includes("suspendedev") ||
    s.includes("suspendedevse") ||
    s.includes("preparing") ||
    s.includes("finishing") ||
    s.includes("reserved")
  ) {
    return "charging";
  }

  if (s.includes("avail")) return "available";

  // Unbekannten Status nicht stillschweigend als "verfügbar" interpretieren.
  return "unconfigured";
}
