/**
 * Formats an energy value with dynamic unit scaling.
 * - Power: W → kW → MW
 * - Energy: Wh → kWh → MWh
 *
 * @param value - The raw value (assumed in base unit: W or Wh)
 * @param baseUnit - "W" for power, "Wh" for energy (default: "Wh")
 * @returns Formatted string like "3,5 kWh" or "12 MW"
 */
export function formatEnergy(value: number, baseUnit: "W" | "Wh" = "Wh"): string {
  const abs = Math.abs(value);

  let scaled: number;
  let unit: string;

  if (abs > 9999) {
    scaled = value / 1_000_000;
    unit = `M${baseUnit}`;
  } else if (abs > 999) {
    scaled = value / 1_000;
    unit = `k${baseUnit}`;
  } else {
    scaled = value;
    unit = baseUnit;
  }

  // Use up to 2 decimal places, but strip trailing zeros
  const formatted = scaled.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  return `${formatted} ${unit}`;
}

/** Unit mapping per energy type */
const ENERGY_BASE_UNITS: Record<string, string> = {
  strom: "kWh",
  gas: "m³",
  waerme: "kWh",
  wasser: "m³",
};

/**
 * Formats a value with the correct unit for its energy type.
 * For kWh-based types, applies dynamic scaling (Wh → kWh → MWh).
 * For m³-based types, formats with German locale and m³ suffix.
 *
 * @param value - The raw numeric value
 * @param energyType - "strom" | "gas" | "waerme" | "wasser"
 * @returns Formatted string like "3,5 kWh" or "12,04 m³"
 */
export function formatEnergyByType(value: number, energyType: string): string {
  const baseUnit = ENERGY_BASE_UNITS[energyType];
  if (!baseUnit || baseUnit === "kWh") {
    // Use dynamic scaling for electrical/heat energy
    return formatEnergy(value);
  }
  // For m³ units (gas, water): simple locale formatting
  const formatted = value.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${baseUnit}`;
}

/**
 * Returns the display unit string for an energy type.
 */
export function getEnergyUnit(energyType: string): string {
  return ENERGY_BASE_UNITS[energyType] || "kWh";
}

/** Default calorific values (Brennwert) in kWh/m³ */
const DEFAULT_BRENNWERT: Record<string, number> = {
  H: 11.5,
  L: 8.9,
};

/**
 * Converts a gas volume (m³) to energy (kWh).
 * Formula: kWh = m³ × Brennwert × Zustandszahl
 */
export function gasM3ToKWh(
  m3: number,
  gasType: string | null,
  brennwert: number | null,
  zustandszahl: number | null,
): number {
  const bw = brennwert ?? DEFAULT_BRENNWERT[gasType || "H"] ?? 11.5;
  const zz = zustandszahl ?? 0.9636; // typical default
  return m3 * bw * zz;
}

/**
 * Formats a gas value showing both m³ and the kWh equivalent.
 */
export function formatGasDual(
  m3: number,
  gasType: string | null,
  brennwert: number | null,
  zustandszahl: number | null,
): { m3Str: string; kwhStr: string } {
  const m3Str = m3.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " m³";
  const kwh = gasM3ToKWh(m3, gasType, brennwert, zustandszahl);
  // gasM3ToKWh returns kWh, so multiply by 1000 to get Wh (base unit for formatEnergy)
  const kwhStr = formatEnergy(kwh * 1000);
  return { m3Str, kwhStr };
}
