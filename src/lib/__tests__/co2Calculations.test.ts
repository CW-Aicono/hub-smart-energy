import { describe, it, expect } from "vitest";
import { calculateCo2, formatCo2, calculatePrimaryEnergy } from "../co2Calculations";

const factors = [
  {
    id: "1", tenant_id: "t", energy_type: "strom",
    factor_kg_per_kwh: 0.4, factor_kg_per_m3: null,
    primary_energy_factor: 1.8, source: null,
    is_default: true, valid_from: "2024-01-01", valid_until: null,
    created_at: "", updated_at: "",
  },
  {
    id: "2", tenant_id: "t", energy_type: "gas",
    factor_kg_per_kwh: 0.2, factor_kg_per_m3: 2.0,
    primary_energy_factor: 1.1, source: null,
    is_default: true, valid_from: "2024-01-01", valid_until: null,
    created_at: "", updated_at: "",
  },
];

describe("calculateCo2", () => {
  it("calculates CO2 for known energy type", () => {
    expect(calculateCo2(1000, "strom", factors)).toBeCloseTo(400);
  });

  it("returns null for unknown energy type", () => {
    expect(calculateCo2(1000, "solar", factors)).toBeNull();
  });

  it("returns 0 for zero consumption", () => {
    expect(calculateCo2(0, "strom", factors)).toBe(0);
  });
});

describe("formatCo2", () => {
  it("formats in kg for small values", () => {
    expect(formatCo2(500)).toContain("kg CO₂");
    expect(formatCo2(500)).toContain("500");
  });

  it("formats in tonnes for >= 1000 kg", () => {
    const result = formatCo2(2500);
    expect(result).toContain("t CO₂");
    expect(result).toContain("2,5");
  });

  it("handles negative values", () => {
    expect(formatCo2(-1500)).toContain("t CO₂");
  });
});

describe("calculatePrimaryEnergy", () => {
  it("calculates primary energy with factor", () => {
    expect(calculatePrimaryEnergy(1000, "strom", factors)).toBeCloseTo(1800);
  });

  it("returns null for unknown type", () => {
    expect(calculatePrimaryEnergy(1000, "solar", factors)).toBeNull();
  });
});
