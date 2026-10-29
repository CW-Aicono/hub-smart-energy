import { describe, it, expect, vi } from "vitest";
vi.mock("@/assets/aicono-logo.png", () => ({ default: "" }));
import { invoiceTotals, normalizeInvoiceLines } from "../aiconoInvoicePdf";

describe("AICONO-Rechnung", () => {
  it("weist 19 % USt auf den Nettobetrag aus", () => {
    expect(invoiceTotals(100, 19)).toEqual({ net: 100, vat: 19, gross: 119 });
  });
  it("rundet die USt kaufmännisch auf Cent", () => {
    expect(invoiceTotals(10.05, 19)).toEqual({ net: 10.05, vat: 1.91, gross: 11.96 });
  });
  it("leitet den Einzelpreis aus Betrag und Menge ab", () => {
    expect(normalizeInvoiceLines([{ label: "Modul", amount: 30, quantity: 3 }], 30)[0].unitPrice).toBe(10);
  });
});
