import { describe, expect, it } from "vitest";
import { packageSaleCatalog, listPrice, isIndividualPrice } from "../packageSaleCatalog";
const packages = [{ code: "basis", name: "Basis", uvp: 0, ek: 0, always_active: true }, { code: "p1_monitoring", name: "Monitoring", uvp: 99, ek: 74 }, { code: "p4_charging", name: "Charging", uvp: 0, ek: 0 }];
const units = [{ code: "charge_point", name: "Ladepunkt", uvp: 7, new_sale_uvp: 8, ek: 6 }, { code: "extra_location", name: "Weitere Liegenschaft", uvp: 39, ek: 29 }, { code: "remote_support", name: "Support", uvp: 149, ek: 112, partner_available: true }, { code: "setup", name: "Einrichtung", uvp: 200, ek: 200 }];
describe("package booking catalog", () => {
  it("does not sell the included basis package", () => expect(packageSaleCatalog(packages, units).some(p => p.code === "basis")).toBe(false));
  it("does not offer charge points for manual booking", () => expect(packageSaleCatalog(packages, units).some(p => p.code === "charge_point")).toBe(false));
  it("does not offer extra locations for manual booking", () => expect(packageSaleCatalog(packages, units).some(p => p.code === "extra_location")).toBe(false));
  it("offers one-time setup at 200 EUR", () => { const p = packageSaleCatalog(packages, units).find(p => p.code === "setup"); expect(p?.uvp).toBe(200); expect(p?.onceOnly).toBe(true); });
  it("manual invoices still list charge points at 8 EUR", () => expect(packageSaleCatalog(packages, units, false, true).find(p => p.code === "charge_point")?.uvp).toBe(8));
  it("prefills UVP for direct customers", () => expect(listPrice({ uvp: 99, ek: 74 }, false)).toBe(99));
  it("prefills EK for reselling partners", () => expect(listPrice({ uvp: 99, ek: 74 }, true)).toBe(74));
  it("flags a changed price as individual", () => expect(isIndividualPrice(90, 99)).toBe(true));
  it("does not flag the list price", () => expect(isIndividualPrice(99, 99)).toBe(false));
});
