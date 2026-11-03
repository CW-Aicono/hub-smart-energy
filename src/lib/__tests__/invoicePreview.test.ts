import { describe, it, expect } from "vitest";
import { invoicePreviewParties } from "../invoicePreview";
describe("invoice preview", () => {
  it("uses current sender and recipient for a draft without issuing it", () => {
    const draft = { issued_at: null, sender_snapshot: { company_name: "old" } };
    expect(invoicePreviewParties(draft, { company_name: "Partner", vat_rate: 19 }, { name: "Tenant" })).toEqual({ settings: { company_name: "Partner", vat_rate: 19 }, recipient: { name: "Tenant" }, vatRate: 19 });
    expect(draft.issued_at).toBeNull();
  });
  it("preserves frozen sender, recipient and tax of issued invoices", () => {
    expect(invoicePreviewParties({ issued_at: "2026-11-02", sender_snapshot: { company_name: "Frozen" }, recipient_snapshot: { name: "Original" }, vat_rate: 7 }, { company_name: "Changed", vat_rate: 19 }, { name: "New" })).toEqual({ settings: { company_name: "Frozen" }, recipient: { name: "Original" }, vatRate: 7 });
  });
});