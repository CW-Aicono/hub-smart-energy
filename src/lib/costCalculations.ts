import type { EnergyPrice } from "@/hooks/useEnergyPrices";

/**
 * Find the active price for a location, energy type and year.
 */
export function getActivePrice(
  prices: EnergyPrice[],
  locationId: string,
  energyType: string,
  year: number,
): number {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const matching = prices.filter(
    (p) =>
      p.location_id === locationId &&
      p.energy_type === energyType &&
      p.valid_from <= yearEnd &&
      (!p.valid_until || p.valid_until >= yearStart),
  );

  if (matching.length === 0) return 0;
  // Return the most recent one
  return matching.sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0].price_per_unit;
}

/**
 * Calculate energy cost from consumption and price.
 */
export function calculateEnergyCost(
  consumptionKwh: number,
  pricePerKwh: number,
): number {
  return consumptionKwh * pricePerKwh;
}

/**
 * Format currency in German locale.
 */
export function formatCurrency(amount: number): string {
  return amount.toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
