import { describe, it, expect } from "vitest";
import { licenseAmount, licensePeriodEnd, saleSchema } from "../licenseBilling";
describe("license billing rules", () => {
  it("once charges only the selected quantity", () => expect(licenseAmount(8, 2, "2026-10-30", "2026-10-30", "once")).toBe(16));
  it("monthly ends at calendar month end", () => expect(licensePeriodEnd("2026-10-30", "monthly")).toBe("2026-10-31"));
  it("quarterly covers three months", () => expect(licenseAmount(8, 1, "2026-10-01", "2026-12-31", "quarterly")).toBe(24));
  it("halfyearly covers six months", () => expect(licenseAmount(8, 1, "2026-07-01", "2026-12-31", "halfyearly")).toBe(48));
  it("prorates new sales by actual days", () => expect(licenseAmount(8, 1, "2026-10-30", "2026-10-31", "monthly")).toBe(0.52));
  it("separates illustrative resale and wholesale amounts", () => expect(licenseAmount(6, 2, "2026-11-01", "2026-11-30", "monthly")).toBe(12));
  it("handles leap February", () => expect(licenseAmount(29, 1, "2028-02-29", "2028-02-29", "monthly")).toBe(1));
  it("handles year rollover", () => expect(licensePeriodEnd("2026-12-30", "quarterly")).toBe("2026-12-31"));
  it("rejects negative prices", () => expect(saleSchema.safeParse({ tenant: "11111111-1111-4111-8111-111111111111", kind: "unit", code: "charge_point", quantity: 1, cadence: "monthly", price: -1, payment: "invoice" }).success).toBe(false));
});