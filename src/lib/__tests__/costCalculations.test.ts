import { describe, it, expect } from "vitest";
import { getActivePrice, calculateEnergyCost, formatCurrency } from "../costCalculations";

const makePrices = (overrides: Partial<{ location_id: string; energy_type: string; valid_from: string; valid_until: string | null; price_per_unit: number }>[]) =>
  overrides.map((o) => ({
    id: "x",
    tenant_id: "t",
    currency: "EUR",
    unit: "kWh",
    is_dynamic: false,
    spot_markup_per_unit: 0,
    created_at: "",
    updated_at: "",
    location_id: o.location_id ?? "loc1",
    energy_type: o.energy_type ?? "strom",
    valid_from: o.valid_from ?? "2024-01-01",
    valid_until: o.valid_until ?? null,
    price_per_unit: o.price_per_unit ?? 0.30,
  }));

describe("getActivePrice", () => {
  it("returns 0 when no prices match", () => {
    expect(getActivePrice([], "loc1", "strom", 2024)).toBe(0);
  });

  it("returns price matching location, type and year", () => {
    const prices = makePrices([{ price_per_unit: 0.25, valid_from: "2024-01-01" }]);
    expect(getActivePrice(prices, "loc1", "strom", 2024)).toBe(0.25);
  });

  it("returns the most recent price when multiple match", () => {
    const prices = makePrices([
      { price_per_unit: 0.20, valid_from: "2024-01-01" },
      { price_per_unit: 0.30, valid_from: "2024-07-01" },
    ]);
    expect(getActivePrice(prices, "loc1", "strom", 2024)).toBe(0.30);
  });

  it("excludes prices for different locations", () => {
    const prices = makePrices([{ location_id: "loc2", price_per_unit: 0.50 }]);
    expect(getActivePrice(prices, "loc1", "strom", 2024)).toBe(0);
  });

  it("excludes prices that ended before the year", () => {
    const prices = makePrices([{ valid_from: "2022-01-01", valid_until: "2023-06-30", price_per_unit: 0.40 }]);
    expect(getActivePrice(prices, "loc1", "strom", 2024)).toBe(0);
  });
});

describe("calculateEnergyCost", () => {
  it("multiplies consumption by price", () => {
    expect(calculateEnergyCost(1000, 0.30)).toBeCloseTo(300);
  });

  it("returns 0 for zero consumption", () => {
    expect(calculateEnergyCost(0, 0.30)).toBe(0);
  });
});

describe("formatCurrency", () => {
  it("formats as EUR with German locale", () => {
    const result = formatCurrency(1234);
    expect(result).toContain("1.234");
    expect(result).toContain("€");
  });

  it("formats zero", () => {
    const result = formatCurrency(0);
    expect(result).toContain("0");
  });
});
