// K6 — Dynamisches DLM: reine Allokations-Logik (testbar, frei von Supabase).
//
// Gegeben:
//   - aktuelle Hausanschluss-Last in kW (oder null wenn Sensor stale)
//   - Konfiguration (grid_limit_kw, safety_buffer_kw, fallback_kw_per_cp, min_charge_kw)
//   - Liste der aktiven Ladepunkte (id, max_kw) in Priorisierungs-Reihenfolge
//
// Ergebnis: pro CP eine Allokation (kW Soll-Leistung, oder null = pausieren)

export interface DlmConfigInput {
  grid_limit_kw: number;
  safety_buffer_kw: number;
  fallback_kw_per_cp: number;
  min_charge_kw: number;
}

export interface CpInput {
  id: string;
  max_kw: number; // max physische Wallbox-Leistung
}

export interface CpAllocation {
  id: string;
  target_kw: number | null; // null = pausieren (RemoteStop oder Limit=0)
  reason: "pause_budget" | "throttled" | "full" | "fallback";
}

export interface DlmAllocationResult {
  available_kw: number; // EV-Budget nach Abzug Hausverbrauch + Puffer
  fallback_active: boolean;
  allocations: CpAllocation[];
}

/**
 * Allokiert Ladeleistung auf die priorisierten CPs.
 *
 * Strategie:
 * 1. Sensor-Ausfall (measured_kw === null) → fallback_kw_per_cp pro CP, gedeckelt
 *    durch Summe fallback_kw_per_cp * cps.length (never overshoot grid_limit).
 * 2. Verfügbares Budget = grid_limit - measured - safety_buffer.
 *    Achtung: measured enthält bereits laufende EV-Last → Budget ist die
 *    Headroom, die wir DAZU geben dürfen. Da wir aber alle EVs neu setzen,
 *    arbeiten wir mit dem Maximum, das insgesamt für EVs verfügbar wäre:
 *    ev_budget = grid_limit - (measured - currently_ev_kw) - safety_buffer.
 *    Da `currently_ev_kw` hier nicht direkt bekannt ist, verwenden wir
 *    available_kw = grid_limit - safety_buffer - non_ev_baseload, wobei
 *    non_ev_baseload als zusätzlicher Parameter übergeben wird (oder
 *    measured, wenn nicht bekannt → konservativ).
 * 3. Pro CP nach Priorität so viel wie max_kw zuteilen, bis Budget verbraucht.
 *    Rest-CPs erhalten null wenn Restbudget < min_charge_kw.
 */
export function allocate(
  config: DlmConfigInput,
  measured_kw: number | null,
  non_ev_baseload_kw: number,
  cps: CpInput[],
): DlmAllocationResult {
  if (cps.length === 0) {
    return { available_kw: 0, fallback_active: false, allocations: [] };
  }

  // Fallback-Pfad
  if (measured_kw === null) {
    const cap = Math.max(0, config.grid_limit_kw - config.safety_buffer_kw);
    const perCp = config.fallback_kw_per_cp;
    const maxCps = Math.floor(cap / perCp);
    return {
      available_kw: cap,
      fallback_active: true,
      allocations: cps.map((cp, idx) => ({
        id: cp.id,
        target_kw: idx < maxCps ? Math.min(perCp, cp.max_kw) : null,
        reason: idx < maxCps ? "fallback" : "pause_budget",
      })),
    };
  }

  const available = Math.max(
    0,
    config.grid_limit_kw - non_ev_baseload_kw - config.safety_buffer_kw,
  );

  let remaining = available;
  const allocations: CpAllocation[] = [];

  for (const cp of cps) {
    if (remaining < config.min_charge_kw) {
      allocations.push({ id: cp.id, target_kw: null, reason: "pause_budget" });
      continue;
    }
    const give = Math.min(cp.max_kw, remaining);
    allocations.push({
      id: cp.id,
      target_kw: give,
      reason: give >= cp.max_kw ? "full" : "throttled",
    });
    remaining -= give;
  }

  return { available_kw: available, fallback_active: false, allocations };
}

/**
 * 3-phasig 400 V: A = kW * 1000 / (400 * sqrt(3))
 * Minimum 6 A, Maximum 32 A (übliche Wallbox-Spanne).
 */
export function kwToAmps(kw: number): number {
  return Math.max(6, Math.min(32, Math.round((kw * 1000) / (400 * Math.sqrt(3)))));
}
