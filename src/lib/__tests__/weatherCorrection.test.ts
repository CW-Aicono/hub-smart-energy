import { describe, it, expect } from "vitest";
import {
  estimateHotWaterBaselineKwhPerMonth,
  normalizeHeatConsumptionWithBaseline,
  HOT_WATER_FALLBACK_SHARE,
  REFERENCE_HDD_GERMANY,
} from "@/lib/report/weatherCorrection";

describe("estimateHotWaterBaselineKwhPerMonth", () => {
  it("returns none when no WW source is configured", () => {
    const monthly = [
      { kwh: 5000, hdd: 400 },
      { kwh: 500, hdd: 20 },
      { kwh: 600, hdd: 10 },
      { kwh: 400, hdd: 15 },
    ];
    const r = estimateHotWaterBaselineKwhPerMonth(monthly, undefined, "gas");
    expect(r.source).toBe("none");
    expect(r.perMonthKwh).toBe(0);
  });

  it("returns none when configured WW source is a different energy type", () => {
    const monthly = [
      { kwh: 500, hdd: 20 },
      { kwh: 600, hdd: 10 },
    ];
    const r = estimateHotWaterBaselineKwhPerMonth(
      monthly,
      { hotWaterEnergyType: "strom", hotWaterKwhYear: 3000 },
      "gas",
    );
    expect(r.source).toBe("none");
    expect(r.perMonthKwh).toBe(0);
  });

  it("uses summer baseline when the configured source matches", () => {
    const monthly = [
      { kwh: 5000, hdd: 400 },
      { kwh: 4000, hdd: 350 },
      { kwh: 500, hdd: 20 },
      { kwh: 600, hdd: 10 },
      { kwh: 400, hdd: 15 },
    ];
    const r = estimateHotWaterBaselineKwhPerMonth(
      monthly,
      { hotWaterEnergyType: "gas" },
      "gas",
    );
    expect(r.source).toBe("summer-baseline");
    expect(r.monthsUsed).toBe(3);
    expect(r.perMonthKwh).toBeCloseTo(500, 5);
  });

  it("manual kWh/year wins over summer baseline", () => {
    const monthly = [
      { kwh: 500, hdd: 20 },
      { kwh: 600, hdd: 10 },
      { kwh: 400, hdd: 15 },
    ];
    const r = estimateHotWaterBaselineKwhPerMonth(
      monthly,
      { hotWaterEnergyType: "gas", hotWaterKwhYear: 2400 },
      "gas",
    );
    expect(r.source).toBe("manual");
    expect(r.perMonthKwh).toBeCloseTo(200, 5);
  });

  it("manual share % uses share of yearly total", () => {
    const monthly = [
      { kwh: 5000, hdd: 400 },
      { kwh: 5000, hdd: 400 },
    ];
    const r = estimateHotWaterBaselineKwhPerMonth(
      monthly,
      { hotWaterEnergyType: "gas", hotWaterSharePct: 20 },
      "gas",
    );
    expect(r.source).toBe("manual");
    expect(r.perMonthKwh).toBeCloseTo(2000 / 12, 5);
  });

  it("falls back to share of year when too few low-HDD months exist", () => {
    const monthly = [
      { kwh: 5000, hdd: 400 },
      { kwh: 4000, hdd: 300 },
      { kwh: 500, hdd: 20 },
    ];
    const r = estimateHotWaterBaselineKwhPerMonth(
      monthly,
      { hotWaterEnergyType: "gas" },
      "gas",
    );
    expect(r.source).toBe("fallback");
    expect(r.perMonthKwh).toBeCloseTo((9500 * HOT_WATER_FALLBACK_SHARE) / 12, 5);
  });

  it("returns none when there is no consumption at all", () => {
    const r = estimateHotWaterBaselineKwhPerMonth(
      [],
      { hotWaterEnergyType: "gas" },
      "gas",
    );
    expect(r.source).toBe("none");
    expect(r.perMonthKwh).toBe(0);
  });

  it("works for Strom as WW source when current energy type matches", () => {
    const monthly = [
      { kwh: 800, hdd: 20 },
      { kwh: 900, hdd: 10 },
      { kwh: 700, hdd: 15 },
    ];
    const r = estimateHotWaterBaselineKwhPerMonth(
      monthly,
      { hotWaterEnergyType: "strom", hotWaterKwhYear: 1200 },
      "strom",
    );
    expect(r.source).toBe("manual");
    expect(r.perMonthKwh).toBeCloseTo(100, 5);
  });
});

describe("normalizeHeatConsumptionWithBaseline", () => {
  it("keeps HDD=0 months at their actual value (WW cannot be scaled)", () => {
    const out = normalizeHeatConsumptionWithBaseline(500, 0, 500, REFERENCE_HDD_GERMANY);
    expect(out).toBeCloseTo(500, 5);
  });

  it("scales only the heating part when WW baseline is subtracted", () => {
    const hddRef = 3500;
    const out = normalizeHeatConsumptionWithBaseline(5000, 350, 500, hddRef);
    expect(out).toBeCloseTo(45500, 5);
  });

  it("never subtracts more WW than actually consumed", () => {
    const out = normalizeHeatConsumptionWithBaseline(300, 0, 500, REFERENCE_HDD_GERMANY);
    expect(out).toBeCloseTo(300, 5);
  });
});
