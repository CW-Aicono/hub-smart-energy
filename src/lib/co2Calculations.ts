import type { Co2Factor } from "@/hooks/useCo2Factors";

/**
 * Calculate CO2 emissions in kg from energy consumption.
 * @param energyKwh - energy consumption in kWh
 * @param energyType - strom, gas, waerme, oel, etc.
 * @param factors - available CO2 factors
 * @returns CO2 in kg, or null if no factor found
 */
export function calculateCo2(
  energyKwh: number,
  energyType: string,
  factors: Co2Factor[],
): number | null {
  const factor = factors.find((f) => f.energy_type === energyType);
  if (!factor) return null;
  return energyKwh * factor.factor_kg_per_kwh;
}

/**
 * Format CO2 value with dynamic unit (kg / t).
 */
export function formatCo2(kg: number): string {
  if (Math.abs(kg) >= 1000) {
    const t = kg / 1000;
    return `${t.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t CO₂`;
  }
  return `${kg.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} kg CO₂`;
}
