/**
 * Witterungsbereinigung nach VDI 3807 / DIN EN 15603.
 * Vereinfachtes HDD-Verfahren (Heating Degree Days, Basis 15 °C),
 * skaliert den gemessenen Wärmeverbrauch auf ein langjähriges Referenzjahr.
 *
 * formula:  Q_norm = Q_ist * (HDD_ref / HDD_ist)
 *
 * Standard-Referenz: 3500 Kd/a (deutscher Mittelwert DWD 1991-2020).
 */

const OPEN_METEO_ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";

export const REFERENCE_HDD_GERMANY = 3500; // Kd/a (DWD 1991–2020)
export const HDD_BASE_TEMP_C = 15;

export interface HddResult {
  year: number;
  latitude: number;
  longitude: number;
  hdd: number;          // Heating Degree Days (Kd/a)
  baseTempC: number;
  daysCovered: number;
  source: "open-meteo-archive" | "fallback-reference";
}

/**
 * Lädt Tages-Mitteltemperaturen und summiert die Heizgradtage für ein Jahr.
 * Liefert bei Fehlern eine Fallback-Schätzung (Referenz-HDD).
 */
export async function fetchHeatingDegreeDays(
  latitude: number,
  longitude: number,
  year: number,
  baseTempC: number = HDD_BASE_TEMP_C,
): Promise<HddResult> {
  const startDate = `${year}-01-01`;
  // Open-Meteo Archive verlangt vollständige Tage in der Vergangenheit
  const today = new Date();
  const lastDay =
    year < today.getUTCFullYear()
      ? `${year}-12-31`
      : new Date(today.getTime() - 86400000).toISOString().slice(0, 10);

  const url =
    `${OPEN_METEO_ARCHIVE}?latitude=${latitude}&longitude=${longitude}` +
    `&start_date=${startDate}&end_date=${lastDay}` +
    `&daily=temperature_2m_mean&timezone=Europe%2FBerlin`;

  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const data = (await res.json()) as {
      daily?: { time?: string[]; temperature_2m_mean?: (number | null)[] };
    };
    const temps = data.daily?.temperature_2m_mean ?? [];
    let hdd = 0;
    let days = 0;
    for (const t of temps) {
      if (t === null || t === undefined) continue;
      days++;
      if (t < baseTempC) hdd += baseTempC - t;
    }
    return {
      year,
      latitude,
      longitude,
      hdd: Math.round(hdd),
      baseTempC,
      daysCovered: days,
      source: "open-meteo-archive",
    };
  } catch (e) {
    console.warn("fetchHeatingDegreeDays fallback:", e);
    return {
      year,
      latitude,
      longitude,
      hdd: REFERENCE_HDD_GERMANY,
      baseTempC,
      daysCovered: 0,
      source: "fallback-reference",
    };
  }
}

export function normalizeHeatConsumption(
  measuredKwh: number,
  hddActual: number,
  hddReference: number = REFERENCE_HDD_GERMANY,
): number {
  if (!hddActual || hddActual <= 0) return measuredKwh;
  return measuredKwh * (hddReference / hddActual);
}

/** Energieträger, die als Wärme behandelt werden (witterungsabhängig). */
export const HEAT_ENERGY_TYPES = new Set([
  "waerme",
  "heat",
  "heating",
  "gas",
  "oel",
  "fernwaerme",
  "pellets",
  "holz",
]);

export function isHeatType(energyType: string): boolean {
  return HEAT_ENERGY_TYPES.has(energyType.toLowerCase());
}

// ---------------------------------------------------------------------------
// Warmwasser-Sockel (temperaturunabhängig)
// ---------------------------------------------------------------------------

/**
 * HDD-Schwelle pro Monat, ab der ein Monat als „nicht heizungsdominiert" gilt.
 * 50 Kd/Monat entspricht grob ~1.6 Kd/Tag – typisch für Sommermonate in DE.
 */
export const HOT_WATER_BASELINE_HDD_THRESHOLD = 50;

/**
 * Fallback-Anteil des Jahresverbrauchs, wenn keine plausible Sommer-Baseline
 * verfügbar ist (z. B. nur Winterdaten vorhanden). 12 % ist ein üblicher
 * Erfahrungswert für Gas-Kombithermen mit Trinkwarmwasser (VDI 2067).
 */
export const HOT_WATER_FALLBACK_SHARE = 0.12;

export type HotWaterSource = "manual" | "summer-baseline" | "fallback" | "none";

export interface HotWaterBaselineResult {
  /** monatlicher Warmwasser-Sockel in kWh (temperaturunabhängig) */
  perMonthKwh: number;
  source: HotWaterSource;
  monthsUsed: number;
}

export interface HotWaterOverride {
  /**
   * Energieträger, über den das Warmwasser bereitet wird (z. B. "gas", "strom",
   * "pellets", "oel", "fernwaerme", "waerme"). NULL/leer = nicht konfiguriert,
   * es findet KEIN Sockelabzug statt (Bereinigung wie ohne WW-Feature).
   */
  hotWaterEnergyType?: string | null;
  /** Optionaler Jahres-Warmwasserverbrauch in kWh. */
  hotWaterKwhYear?: number | null;
  /** Optionaler Anteil am Verbrauch der WW-Quelle in %. */
  hotWaterSharePct?: number | null;
}

/**
 * Schätzt den monatlichen Warmwasser-Sockel für den aktuell analysierten
 * Energieträger. Wenn der Nutzer keine WW-Quelle konfiguriert hat oder die
 * konfigurierte Quelle nicht dem aktuell analysierten Energieträger
 * entspricht, wird KEIN Sockel abgezogen (source: "none").
 *
 * Reihenfolge bei passender Quelle:
 *   1) manueller kWh/Jahr-Wert
 *   2) manueller Anteil (%) am Jahresverbrauch der Quelle
 *   3) Sommer-Baseline (Monate mit HDD < Schwelle)
 *   4) Fallback (12 % vom Jahresverbrauch)
 */
export function estimateHotWaterBaselineKwhPerMonth(
  monthly: { kwh: number; hdd: number }[],
  override: HotWaterOverride | undefined,
  currentEnergyType: string,
  opts?: { hddThreshold?: number; fallbackShare?: number },
): HotWaterBaselineResult {
  const configured = (override?.hotWaterEnergyType || "").trim().toLowerCase();
  const current = (currentEnergyType || "").trim().toLowerCase();

  // Keine Konfiguration ODER Konfiguration betrifft eine andere Energieart:
  // kein Sockelabzug – Bereinigung wie ohne WW-Feature.
  if (!configured || configured !== current) {
    return { perMonthKwh: 0, source: "none", monthsUsed: 0 };
  }

  const yearTotal = monthly.reduce((s, m) => s + (m.kwh || 0), 0);

  // 1) Manueller kWh-Jahreswert
  if (typeof override?.hotWaterKwhYear === "number" && override.hotWaterKwhYear > 0) {
    return { perMonthKwh: override.hotWaterKwhYear / 12, source: "manual", monthsUsed: 12 };
  }

  // 2) Manueller Anteil in %
  if (
    typeof override?.hotWaterSharePct === "number" &&
    override.hotWaterSharePct > 0 &&
    yearTotal > 0
  ) {
    return {
      perMonthKwh: (yearTotal * (override.hotWaterSharePct / 100)) / 12,
      source: "manual",
      monthsUsed: 12,
    };
  }

  if (yearTotal <= 0) {
    return { perMonthKwh: 0, source: "none", monthsUsed: 0 };
  }

  // 3) Sommer-Baseline: alle Monate mit HDD < Schwelle mitteln
  const threshold = opts?.hddThreshold ?? HOT_WATER_BASELINE_HDD_THRESHOLD;
  const baselineMonths = monthly.filter(
    (m) => (m.hdd ?? 0) < threshold && (m.kwh ?? 0) >= 0,
  );
  if (baselineMonths.length >= 2) {
    const mean =
      baselineMonths.reduce((s, m) => s + m.kwh, 0) / baselineMonths.length;
    return { perMonthKwh: mean, source: "summer-baseline", monthsUsed: baselineMonths.length };
  }

  // 4) Fallback: fester Anteil vom Jahresverbrauch
  const share = opts?.fallbackShare ?? HOT_WATER_FALLBACK_SHARE;
  return {
    perMonthKwh: (yearTotal * share) / 12,
    source: "fallback",
    monthsUsed: 0,
  };
}


/**
 * Witterungsbereinigung mit WW-Sockel: Sockel wird vor der HDD-Skalierung
 * abgezogen und danach wieder addiert (temperaturunabhängiger Anteil).
 */
export function normalizeHeatConsumptionWithBaseline(
  actualKwh: number,
  hdd: number,
  hotWaterKwh: number,
  hddReference: number = REFERENCE_HDD_GERMANY,
): number {
  const baseline = Math.max(0, Math.min(hotWaterKwh, actualKwh));
  const heatingPart = actualKwh - baseline;
  const heatingNormalized = normalizeHeatConsumption(heatingPart, hdd, hddReference);
  return heatingNormalized + baseline;
}
