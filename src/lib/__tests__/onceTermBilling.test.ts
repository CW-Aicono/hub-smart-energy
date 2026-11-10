import { describe, it, expect } from "vitest";
import { onceTermAmount, licensePeriodEnd } from "@/lib/licenseBilling";
describe("Einmalzahlung = Laufzeit × Monatspreis", () => {
  it("12 Monate à 49 € ergeben 588 €", () => expect(onceTermAmount(49, 49, 1, "2026-12-01", 12)).toBe(588));
  it("100 % Rabatt ergibt 0 €", () => expect(onceTermAmount(0, 49, 1, "2026-12-01", 12)).toBe(0));
});
describe("Quartalsweise im Voraus", () => {
  it("Abrechnungszeitraum ab Quartalsbeginn umfasst das ganze Quartal", () => expect(licensePeriodEnd("2027-01-01", "quarterly")).toBe("2027-03-31"));
});
