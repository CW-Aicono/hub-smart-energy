import { describe, it, expect } from "vitest";
import { hasOnlyBaseModules, isAllowedWithoutPackages } from "@/lib/routeModules";

describe("tenant without booked packages", () => {
  it("counts only base modules as no package", () => {
    expect(hasOnlyBaseModules([{ module_code: "dashboard", is_enabled: true }, { module_code: "locations", is_enabled: true }, { module_code: "ev_charging", is_enabled: false }])).toBe(true);
    expect(hasOnlyBaseModules([{ module_code: "energy_monitoring", is_enabled: true }])).toBe(false);
  });
  it("menu shows only dashboard and settings", () => {
    expect(isAllowedWithoutPackages("/", true)).toBe(true);
    expect(isAllowedWithoutPackages("/settings", true)).toBe(true);
    for (const p of ["/locations", "/copilot", "/admin", "/help", "/profile"]) expect(isAllowedWithoutPackages(p, true)).toBe(false);
  });
  it("profile stays reachable directly", () => expect(isAllowedWithoutPackages("/profile", false)).toBe(true));
});
