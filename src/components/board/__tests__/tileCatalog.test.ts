import { describe, it, expect } from "vitest";
import { TILE_CATALOG } from "../tileCatalog";
import type { BoardKpis } from "@/hooks/useBoardKpis";

const baseKpis: BoardKpis = {
  cost_today: 123.45,
  cost_month: 12480,
  cost_ytd: 145000,
  savings_vs_last_year: 2500,
  forecast_eom: 15000,
  co2_month: 1.234,
  co2_ytd: 12.5,
  co2_avoided_tons: 4.2,
  self_consumption_ratio: 67.8,
  self_sufficiency: 55.2,
  pv_yield_month: 4500,
  pv_yield_ytd: 18000,
  top_locations: [
    { location_id: "a", name: "Standort A", cost_month: 5000 },
    { location_id: "b", name: "Standort B", cost_month: 3000 },
  ],
  alerts_open: 2,
  gateway_availability: 97.5,
  cp_stability: 99.1,
  tasks_open: 5,
  tasks_overdue: 1,
  trading_pnl_month: -42.5,
  charging_kwh_month: 1234,
  invoices_open: 3,
};

describe("tileCatalog resolvers", () => {
  it("formats costs in German EUR currency", () => {
    const r = TILE_CATALOG.cost_month.resolve!(baseKpis);
    expect(r.value).toMatch(/12\.480/);
    expect(r.value).toContain("€");
  });

  it("marks positive savings as positive tone", () => {
    const r = TILE_CATALOG.savings_vs_last_year.resolve!(baseKpis);
    expect(r.tone).toBe("positive");
  });

  it("marks overdue tasks as danger when > 0", () => {
    const r = TILE_CATALOG.tasks_overdue.resolve!(baseKpis);
    expect(r.tone).toBe("danger");
    expect(r.value).toBe("1");
  });

  it("falls back to dash on null values", () => {
    const k: BoardKpis = { ...baseKpis, cost_today: null };
    const r = TILE_CATALOG.cost_today.resolve!(k);
    expect(r.value).toBe("—");
  });

  it("returns a list for top_locations", () => {
    const r = TILE_CATALOG.top_locations.resolve!(baseKpis);
    expect(r.list).toHaveLength(2);
    expect(r.list?.[0].label).toBe("Standort A");
  });

  it("renders availability with % and tone gradient", () => {
    const r = TILE_CATALOG.gateway_availability.resolve!(baseKpis);
    expect(r.value).toMatch(/97,5\s*%/);
    expect(r.tone).toBe("positive");
  });
});
