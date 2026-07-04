import { describe, it, expect } from "vitest";
import {
  estimateHotWaterBaselineKwhPerMonth,
  normalizeHeatConsumptionWithBaseline,
  HOT_WATER_FALLBACK_SHARE,
  REFERENCE_HDD_GERMANY,
} from "@/lib/report/weatherCorrection";

describe("estimateHotWaterBaselineKwhPerMonth", () => {
  it("uses summer baseline (mean of low-HDD months)", () => {
    const monthly = [
      { kwh: 5000, hdd: 400 }, // Jan
      { kwh: 4000, hdd: 350 }, // Feb
      { kwh: 500, hdd: 20 },   // Jun
      { kwh: 600, hdd: 10 },   // Jul
      { kwh: 400, hdd: 15 },   // Aug
    ];
    const r = estimateHotWaterBaselineKwhPerMonth(monthly);
    expect(r.source).toBe("summer-baseline");
    expect(r.monthsUsed).toBe(3);
    expect(r.perMonthKwh).toBeCloseTo(500, 5);
  });

  it("manual override with kWh/year wins over summer baseline", () => {
    const monthly = [
      { kwh: 500, hdd: 20 },
      { kwh: 600, hdd: 10 },
      { kwh: 400, hdd: 15 },
    ];
    const r = estimateHotWaterBaselineKwhPerMonth(monthly, {
      hotWaterViaGas: true,
      hotWaterGasKwhYear: 2400,
    });
    expect(r.source).toBe("manual");
    expect(r.perMonthKwh).toBeCloseTo(200, 5);
  });

  it("manual override with share % uses share of yearly total", () => {
    const monthly = [
      { kwh: 5000, hdd: 400 },
      { kwh: 5000, hdd: 400 },
    ];
    const r = estimateHotWaterBaselineKwhPerMonth(monthly, {
      hotWaterViaGas: true,
      hotWaterGasSharePct: 20,
    });
    expect(r.source).toBe("manual");
    // 20 % von 10 000 = 2 000 → /12
    expect(r.perMonthKwh).toBeCloseTo(2000 / 12, 5);
  });

  it("falls back to share of year when too few low-HDD months exist", () => {
    const monthly = [
      { kwh: 5000, hdd: 400 },
      { kwh: 4000, hdd: 300 },
      { kwh: 500, hdd: 20 },
    ];
    const r = estimateHotWaterBaselineKwhPerMonth(monthly);
    expect(r.source).toBe("fallback");
    expect(r.perMonthKwh).toBeCloseTo((9500 * HOT_WATER_FALLBACK_SHARE) / 12, 5);
  });

  it("returns zero when there is no consumption at all", () => {
    const r = estimateHotWaterBaselineKwhPerMonth([]);
    expect(r.source).toBe("none");
    expect(r.perMonthKwh).toBe(0);
  });

  it("ignores manual override when hotWaterViaGas is false", () => {
    const monthly = [
      { kwh: 500, hdd: 20 },
      { kwh: 600, hdd: 10 },
    ];
    const r = estimateHotWaterBaselineKwhPerMonth(monthly, {
      hotWaterViaGas: false,
      hotWaterGasKwhYear: 999999,
    });
    expect(r.source).toBe("summer-baseline");
  });
});

describe("normalizeHeatConsumptionWithBaseline", () => {
  it("keeps HDD=0 months at their actual value (WW cannot be scaled)", () => {
    // Juni: kompletter Verbrauch = WW → normalisiert bleibt bei actual
    const out = normalizeHeatConsumptionWithBaseline(500, 0, 500, REFERENCE_HDD_GERMANY);
    expect(out).toBeCloseTo(500, 5);
  });

  it("scales only the heating part when WW baseline is subtracted", () => {
    // 5000 kWh im Januar, HDD=350, WW=500 → Heizung 4500 wird skaliert
    const hddRef = 3500;
    const out = normalizeHeatConsumptionWithBaseline(5000, 350, 500, hddRef);
    // heating 4500 * 3500/350 = 4500 * 10 = 45000; + WW 500 = 45500
    expect(out).toBeCloseTo(45500, 5);
  });

  it("never subtracts more WW than actually consumed", () => {
    const out = normalizeHeatConsumptionWithBaseline(300, 0, 500, REFERENCE_HDD_GERMANY);
    expect(out).toBeCloseTo(300, 5);
  });
});
