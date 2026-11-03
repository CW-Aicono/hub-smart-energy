import { describe, expect, it } from "vitest";
import { suggestPackages, enterpriseHint } from "../packageSuggestion";
const defs = [
  { code: "basis", uvp: 0, requires_package: null, requires_any_other: false, always_active: true, modules: ["dashboard", "locations"] },
  { code: "p1_monitoring", uvp: 99, requires_package: null, requires_any_other: false, always_active: false, modules: ["energy_monitoring", "alerts"] },
  { code: "p2_analysis", uvp: 49, requires_package: "p1_monitoring", requires_any_other: false, always_active: false, modules: ["energy_report"] },
  { code: "p4_charging", uvp: 0, requires_package: null, requires_any_other: false, always_active: false, modules: ["ev_charging"] },
  { code: "p6_enterprise", uvp: 199, requires_package: null, requires_any_other: true, always_active: false, modules: ["brighthub_api"] },
];
describe("package suggestion", () => {
  it("adds package 1 when only package 2 modules are active", () => expect(suggestPackages(["energy_report"], defs).packages.sort()).toEqual(["p1_monitoring", "p2_analysis"]));
  it("keeps modules outside packages as individual grants", () => expect(suggestPackages(["energy_monitoring", "custom_x"], defs).individual).toEqual(["custom_x"]));
  it("counts charging modules automatically", () => expect(suggestPackages(["ev_charging"], defs).automatic).toEqual(["ev_charging"]));
  it("allows package 6 alone when charge points exist", () => expect(suggestPackages(["brighthub_api"], defs, true).packages).toEqual(["p6_enterprise"]));
  it("hints package 6 from 7 locations", () => expect(enterpriseHint(7, ["p1_monitoring"])).toBe(true));
  it("no hint below 7 locations", () => expect(enterpriseHint(6, [])).toBe(false));
});
