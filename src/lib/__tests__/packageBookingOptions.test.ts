import { describe, expect, it } from "vitest";
import { packageCadence, packageDiscount } from "../packageBookingOptions";
import { licensePeriodEnd, licenseAmount, discountPeriodAmount } from "../licenseBilling";
describe("individual package options", () => {
  it("permits a one-off package alongside recurring charging-point capacity", () => {
    expect(packageCadence({}, "once")).toBe("once");
    expect(packageCadence({ quantityEnabled: true }, "once")).toBe("monthly");
  });
  it("deducts 50 euros from a 99 euro package", () => {
    expect(packageDiscount(99, "50", "absolute").amount).toBe(49);
  });
  it("keeps independent discount windows for two packages", () => {
    expect(discountPeriodAmount(49,99,1,"2026-11-01","2026-11-30","monthly","2026-11-01","2026-11-15")).toBe(74);
    expect(discountPeriodAmount(40,50,1,"2026-11-01","2026-11-30","monthly","2026-11-16","2026-11-30")).toBe(45);
  });
  it("bills annually in one calendar-year period at monthly prices", () => {
    expect(licensePeriodEnd("2028-02-16","yearly")).toBe("2028-12-31");
    expect(licenseAmount(50,1,"2027-01-01","2027-12-31","yearly")).toBe(600);
  });
});