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
