import { describe, expect, it } from "vitest";
import { computeTenantMonth, monthDelta, backCharge, spanShare, supportMinutes, type UsageInput } from "../../../supabase/functions/_shared/packageUsage";
const defs = [
  { code: "p1_monitoring", name: "Monitoring", uvp: 99, ek: 74, always_active: false, modules: ["energy_monitoring"] },
  { code: "p6_enterprise", name: "Enterprise", uvp: 199, ek: 149, always_active: false, modules: ["brighthub_api"] },
];
const units = { extra_location: { uvp: 39, ek: 29 }, charge_point: { uvp: 8, ek: 6 }, charging_session: { uvp: 0.1, ek: 0.07 }, setup: { uvp: 200, ek: 200 }, support_15min: { uvp: 25, ek: 25 }, remote_support: { uvp: 149, ek: 112 } };
const base: UsageInput = { month: "2026-11", partner: true, tenantCreatedAt: "2026-01-05", packages: [{ code: "p1_monitoring", start: "2026-01-01", end: null, viaContract: false }], defs, units, locations: 1, chargePoints: 0, billedSessions: 0, remoteSupport: [], supportSessions: [], setupViaContract: false, discounts: [] };
const ek = (i: Partial<UsageInput>) => computeTenantMonth({ ...base, ...i }).ek;
describe("package usage billing", () => {
  it("6 charge points cost 6 × 6 EUR EK", () => expect(ek({ chargePoints: 6 })).toBe(74 + 36));
  it("extra site adds 29 EUR EK", () => expect(ek({ locations: 2 })).toBe(74 + 29));
  it("package 6 waives extra sites", () => expect(ek({ locations: 5, packages: [...base.packages, { code: "p6_enterprise", start: "2026-01-01", end: null, viaContract: false }] })).toBe(74 + 149));
  it("billed sessions cost 0.07 EUR EK each", () => expect(ek({ billedSessions: 100 })).toBe(81));
  it("new tenant pays 200 EUR setup in activation month", () => expect(ek({ tenantCreatedAt: "2026-11-10" })).toBe(274));
  it("package started mid-month is prorated by day", () => expect(spanShare({ start: "2026-11-16", end: null }, "2026-11")).toBe(0.5));
  it("support session over 4 h is marked for review and not billed", () => { const r = computeTenantMonth({ ...base, supportSessions: [{ id: "a", started_at: "2026-11-02T10:00:00Z", ended_at: null, duration_minutes: 1440 }] }); expect(r.review).toBe(true); expect(r.ek).toBe(74); });
  it("open support session is treated as closed after 4 h and reviewed", () => expect(supportMinutes({ id: "b", started_at: "2026-11-02T10:00:00Z", ended_at: null, duration_minutes: null })).toEqual({ minutes: 240, review: true }));
  it("support billed per started 15 minutes", () => expect(ek({ supportSessions: [{ id: "c", started_at: "2026-11-02T10:00:00Z", ended_at: null, duration_minutes: 16 }] })).toBe(74 + 50));
  it("support is free with remote-support flatrate", () => { const r = computeTenantMonth({ ...base, remoteSupport: [{ code: "remote_support", start: "2026-01-01", end: null, viaContract: true }], supportSessions: [{ id: "d", started_at: "2026-11-02T10:00:00Z", ended_at: null, duration_minutes: 30 }] }); expect(r.billableEk).toBe(74); });
  it("approved 10 % partner discount reduces EK", () => expect(ek({ discounts: [{ type: "percent", value: 10, modules: ["energy_monitoring"] }] })).toBe(66.6));
  it("discount on package code P1 reduces only P1 EK", () => expect(ek({ chargePoints: 6, discounts: [{ type: "percent", value: 10, modules: ["p1_monitoring"] }] })).toBe(66.6 + 36));
  it("discount on charge point price reduces charge point EK", () => expect(ek({ chargePoints: 10, discounts: [{ type: "fixed", value: 5, modules: ["charge_point"] }] })).toBe(74 + 55));
  it("discount never exceeds the discounted position", () => expect(ek({ locations: 2, discounts: [{ type: "fixed", value: 100, modules: ["extra_location"] }] })).toBe(74));
  it("flags quantity change above 50 %", () => expect(monthDelta(computeTenantMonth({ ...base, chargePoints: 8 }), computeTenantMonth({ ...base, chargePoints: 5 })).plausibility).toBe(true));
  it("does not flag 5 → 6 charge points", () => { const d = monthDelta(computeTenantMonth({ ...base, chargePoints: 6 }), computeTenantMonth({ ...base, chargePoints: 5 })); expect(d.plausibility).toBe(false); expect(d.ek).toBe(6); });
  it("back-charges a retroactively activated charge point", () => expect(backCharge(computeTenantMonth({ ...base, chargePoints: 6 }), { charge_point: 5 }, units, "2026-10")[0].ek).toBe(6));
});
