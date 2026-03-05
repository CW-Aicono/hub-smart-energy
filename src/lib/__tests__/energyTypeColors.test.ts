import { describe, it, expect } from "vitest";
import {
  ENERGY_TYPE_LABELS,
  ENERGY_TYPE_UNITS,
  ENERGY_HEX_COLORS,
} from "../energyTypeColors";

describe("ENERGY_TYPE_LABELS", () => {
  it("has all four energy types", () => {
    expect(ENERGY_TYPE_LABELS.strom).toBe("Strom");
    expect(ENERGY_TYPE_LABELS.gas).toBe("Gas");
    expect(ENERGY_TYPE_LABELS.waerme).toBe("Wärme");
    expect(ENERGY_TYPE_LABELS.wasser).toBe("Wasser");
  });
});

describe("ENERGY_TYPE_UNITS", () => {
  it("maps correct units", () => {
    expect(ENERGY_TYPE_UNITS.strom).toBe("kWh");
    expect(ENERGY_TYPE_UNITS.gas).toBe("m³");
    expect(ENERGY_TYPE_UNITS.waerme).toBe("kWh");
    expect(ENERGY_TYPE_UNITS.wasser).toBe("m³");
  });
});

describe("ENERGY_HEX_COLORS", () => {
  it("provides valid hex colors for both cases", () => {
    expect(ENERGY_HEX_COLORS.strom).toMatch(/^#[0-9a-f]{6}$/i);
    expect(ENERGY_HEX_COLORS.Strom).toBe(ENERGY_HEX_COLORS.strom);
  });
});
