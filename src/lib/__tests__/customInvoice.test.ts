import { describe, expect, it } from "vitest";
import { parseCustomInvoiceLines } from "../customInvoice";
import { licenseAmount, licensePeriodEnd } from "../licenseBilling";
describe("individual invoice items", () => {
  it("accepts freely created items without a catalog package", () => { const parsed = parseCustomInvoiceLines([{ label: "Individuelle Leistung", quantity: "2", unit_price: "123,45" }]); expect(parsed.success).toBe(true); if (parsed.success) expect(parsed.data).toEqual([{ label: "Individuelle Leistung", quantity: 2, unit_price: 123.45 }]); });
  it("supports one-off invoices", () => { expect(licenseAmount(123.45, 2, "2026-11-02", "2026-11-02", "once")).toBe(246.9); });
  it.each([['monthly', '2026-11-30', 100], ['quarterly', '2026-12-31', 200], ['halfyearly', '2026-12-31', 200]] as const)("supports %s recurring items", (cadence, end, amount) => { expect(licensePeriodEnd("2026-11-01", cadence)).toBe(end); expect(licenseAmount(100, 1, "2026-11-01", end, cadence)).toBe(amount); });
  it("rejects incomplete items", () => { expect(parseCustomInvoiceLines([{label: "", quantity: "1", unit_price: ""}]).success).toBe(false); });
});