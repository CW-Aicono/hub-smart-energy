import { describe, it, expect } from "vitest";
import { calcRoi } from "../roi";

describe("calcRoi", () => {
  it("rechnet kumulierten Cashflow korrekt", () => {
    const r = calcRoi({
      capex_cents: 200_000, // 2000 €
      opex_monthly_cents: 1_000, // 10 €
      commissioned_on: "2024-01-01",
      electricity_cost_eur_per_kwh: 0.2,
      sale_price_eur_per_kwh: 0.5,
      sessions: [
        { start_time: "2024-01-15T10:00:00", energy_kwh: 100 },
        { start_time: "2024-02-15T10:00:00", energy_kwh: 200 },
      ],
      now: new Date(2024, 1, 28),
    });
    expect(r.totalKwh).toBe(300);
    expect(r.totalRevenueCents).toBe(15_000); // 300*0.5*100
    expect(r.totalElectricityCostCents).toBe(6_000);
    expect(r.totalOpexCents).toBe(2_000);
    expect(r.cumulativeCashflowCents).toBe(15_000 - 6_000 - 2_000 - 200_000);
  });

  it("ermittelt Payback-Datum bei positiver Marge", () => {
    const r = calcRoi({
      capex_cents: 1_000,
      opex_monthly_cents: 0,
      commissioned_on: "2024-01-01",
      electricity_cost_eur_per_kwh: 0,
      sale_price_eur_per_kwh: 1,
      sessions: [
        { start_time: "2024-01-15T10:00:00", energy_kwh: 5 },
        { start_time: "2024-02-15T10:00:00", energy_kwh: 5 },
      ],
      now: new Date(2024, 1, 28),
    });
    expect(r.paybackDate).not.toBeNull();
  });
});
