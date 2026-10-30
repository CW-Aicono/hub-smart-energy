import { describe, expect, it } from "vitest";
import { packageSaleCatalog } from "../packageSaleCatalog";
const packages = [{ code: "basis", name: "Basis", uvp: 0, ek: 0, always_active: true }, { code: "p1_monitoring", name: "Monitoring", uvp: 99, ek: 74 }, { code: "p4_charging", name: "Charging", uvp: 0, ek: 0 }];
const units = [{ code: "charge_point", name: "Ladepunkt", uvp: 7, new_sale_uvp: 8, ek: 5.25 }, { code: "extra_location", name: "Weitere Liegenschaft", uvp: 39, ek: 29 }, { code: "remote_support", name: "Support", uvp: 149, ek: 149, partner_available: false }];
describe("package-only current sale catalog", () => {
  it("does not sell the included basis package", () => expect(packageSaleCatalog(packages, units).some(p => p.code === "basis")).toBe(false));
  it("uses 8 EUR for new charging-point sales without changing old 7 EUR", () => { expect(packageSaleCatalog(packages, units).find(p => p.code === "charge_point")?.uvp).toBe(8); expect(units[0].uvp).toBe(7); });
  it("retains the verified partner purchase price when none was specified", () => expect(packageSaleCatalog(packages, units, true).find(p => p.code === "charge_point")?.ek).toBe(5.25));
  it("omits remote support from partner sales when no partner price exists", () => expect(packageSaleCatalog(packages, units, true).some(p => p.code === "remote_support")).toBe(false));
  it("includes remote support at 149 EUR for direct customers", () => expect(packageSaleCatalog(packages, units).find(p => p.code === "remote_support")?.uvp).toBe(149));
  it("uses the package recommendation and partner prices", () => { const p=packageSaleCatalog(packages, units)[0]; expect(p.uvp).toBe(99); expect(p.ek).toBe(74); });
  it("uses 39/29 EUR for an extra location", () => { const p=packageSaleCatalog(packages, units).find(p => p.code === "extra_location"); expect(p?.uvp).toBe(39); expect(p?.ek).toBe(29); });
});