import { describe, expect, it } from "vitest";
import { manualInvoiceQuote, type ManualInvoiceOptions } from "../manualInvoiceQuote";
const options: ManualInvoiceOptions = { cadence: "once", termMonths: "12", discountMode: "percent", discountValue: "0", limited: false, discountFrom: "2027-01-01", discountTo: "2027-03-31", after: "continue", payment: "invoice", from: "2027-01-01", to: "2027-01-01" };
const line = { label: "Analyse", quantity: "1", unit_price: "49,00", monthly: true };
const quote = (patch: Partial<ManualInvoiceOptions> = {}) => manualInvoiceQuote([line], { ...options, ...patch });
describe("single manual invoice with booking pricing", () => {
  it("Einmalig: 12 × 49 € = 588 €", () => { const q = quote(); expect(q.success && q.net).toBe(588); expect(q.success && q.periodEnd).toBe("2027-12-31"); });
  it("100 % Rabatt für P1 + P2 ergibt 0 €", () => { const q = manualInvoiceQuote([{ ...line, label: "Monitoring", unit_price: "99" }, line], { ...options, discountValue: "100" }); expect(q.success && q.net).toBe(0); });
  it("Quartal im Voraus: 3 × 49 € = 147 €", () => { const q = quote({ cadence: "quarterly" }); expect(q.success && q.net).toBe(147); expect(q.success && q.periodEnd).toBe("2027-03-31"); });
  it("befristeter Rabatt: 3 Monate kostenlos + 9 × 49 €", () => { const q = quote({ discountValue: "100", limited: true }); expect(q.success && q.net).toBe(441); });
  it("Rabattablauf mit Ende begrenzt nur den Rechnungszeitraum", () => { const q = quote({ discountValue: "50", limited: true, after: "end" }); expect(q.success && q.net).toBe(73.5); expect(q.success && q.periodEnd).toBe("2027-03-31"); });
  it("Euro-Rabatt gilt pro Einheit und Monat", () => { const q = manualInvoiceQuote([{ ...line, quantity: "2", discountMode: "absolute", discountValue: "9" }], options); expect(q.success && q.net).toBe(960); });
  it("Einrichtungsposition wird trotz Laufzeit nur einmal berechnet", () => { const q = manualInvoiceQuote([{ ...line, monthly: false, unit_price: "200" }], options); expect(q.success && q.net).toBe(200); });
  it("Einmalige Monatspreise benötigen eine Laufzeit", () => expect(quote({ termMonths: "" })).toEqual({ success: false, error: "term" }));
  it("Rabatte über 100 % werden abgelehnt", () => expect(quote({ discountValue: "101" })).toEqual({ success: false, error: "discount" }));
  it("berechnetes Laufzeitende ignoriert den alten manuellen Endtag", () => { const q = quote({ to: "2026-11-11" }); expect(q.success && q.net).toBe(588); });
  it("ungültige Rabattgrenzen werden abgelehnt", () => expect(quote({ limited: true, discountFrom: "2027-01-02" })).toEqual({ success: false, error: "window" }));
});