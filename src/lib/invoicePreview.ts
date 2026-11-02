import type { AiconoBillingSettings, InvoiceRecipient } from "./aiconoInvoicePdf";

/** Preview is read-only: drafts use current parties, issued documents only frozen snapshots. */
export function invoicePreviewParties(invoice: { issued_at?: string | null; sender_snapshot?: AiconoBillingSettings; recipient_snapshot?: InvoiceRecipient; vat_rate?: number | null }, settings: AiconoBillingSettings, recipient: InvoiceRecipient) {
  if (invoice.issued_at) return { settings: invoice.sender_snapshot ?? settings, recipient: invoice.recipient_snapshot ?? recipient, vatRate: Number(invoice.vat_rate ?? 19) };
  return { settings, recipient, vatRate: Number(settings.vat_rate ?? 19) };
}