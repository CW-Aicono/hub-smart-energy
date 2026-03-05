import { describe, it, expect } from "vitest";
import { formatEnergy, formatEnergyByType, getEnergyUnit, gasM3ToKWh } from "../formatEnergy";

describe("formatEnergy", () => {
  it("formats small values in base unit", () => {
    expect(formatEnergy(500)).toContain("Wh");
    expect(formatEnergy(500)).toContain("500");
  });

  it("formats kWh range", () => {
    expect(formatEnergy(5000)).toContain("kWh");
  });

  it("formats MWh range", () => {
    expect(formatEnergy(2_000_000)).toContain("MWh");
  });

  it("formats power units (W)", () => {
    expect(formatEnergy(1500, "W")).toContain("kW");
  });

  it("handles negative values", () => {
    expect(formatEnergy(-5000)).toContain("kWh");
  });

  it("formats zero", () => {
    expect(formatEnergy(0)).toContain("0");
  });
});

describe("formatEnergyByType", () => {
  it("uses kWh scaling for strom", () => {
    expect(formatEnergyByType(5000, "strom")).toContain("kWh");
  });

  it("uses m³ for gas", () => {
    expect(formatEnergyByType(123, "gas")).toContain("m³");
  });

  it("uses m³ for wasser", () => {
    expect(formatEnergyByType(45.5, "wasser")).toContain("m³");
  });

  it("falls back to kWh for unknown types", () => {
    expect(formatEnergyByType(1000, "solar")).toContain("kWh");
  });
});

describe("getEnergyUnit", () => {
  it("returns correct units", () => {
    expect(getEnergyUnit("strom")).toBe("kWh");
    expect(getEnergyUnit("gas")).toBe("m³");
    expect(getEnergyUnit("waerme")).toBe("kWh");
    expect(getEnergyUnit("wasser")).toBe("m³");
  });

  it("defaults to kWh for unknown", () => {
    expect(getEnergyUnit("unknown")).toBe("kWh");
  });
});

describe("gasM3ToKWh", () => {
  it("uses brennwert and zustandszahl when provided", () => {
    expect(gasM3ToKWh(100, "H", 11.5, 0.9636)).toBeCloseTo(100 * 11.5 * 0.9636);
  });

  it("uses default zustandszahl when null", () => {
    expect(gasM3ToKWh(100, "H", 11.5, null)).toBeCloseTo(100 * 11.5 * 0.9636);
  });

  it("falls back to factor 10 without brennwert", () => {
    expect(gasM3ToKWh(100, null, null, null)).toBe(1000);
  });

  it("falls back when brennwert is 0", () => {
    expect(gasM3ToKWh(100, "H", 0, null)).toBe(1000);
  });
});
