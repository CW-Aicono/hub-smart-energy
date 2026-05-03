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
