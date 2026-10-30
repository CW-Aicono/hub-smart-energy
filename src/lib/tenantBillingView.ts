// Kundenansicht „Paket & Rechnungen“: welche Rechnungen ein Mandant sieht (reine Logik).
export interface CustomerInvoice {
  id: string; source: "aicono" | "partner"; number: string; period_start: string; period_end: string;
  amount: number; issued_at: string; cancellation: boolean; row: any;
}

/**
 * Nur festgeschriebene Rechnungen an den Kunden selbst: AICONO-Rechnungen ohne Partner-Adressierung
 * (EK-Rechnungen an den Partner bleiben unsichtbar) und ausgestellte Partner-Rechnungen. Keine Entwürfe, keine 0-€-Hinweise.
 */
export function customerInvoiceList(aicono: any[], partner: any[]): CustomerInvoice[] {
  const ok = (r: any) => !!r.issued_at && r.status !== "draft" && r.document_type !== "subscription_notice" && r.document_type !== "credit_note";
  const map = (r: any, source: CustomerInvoice["source"]): CustomerInvoice => ({
    id: r.id, source, number: r.invoice_number, period_start: r.period_start, period_end: r.period_end,
    amount: Number(r.amount ?? 0), issued_at: r.issued_at, cancellation: r.document_type === "cancellation", row: r,
  });
  return [
    ...aicono.filter((r) => ok(r) && !r.partner_id).map((r) => map(r, "aicono")),
    ...partner.filter(ok).map((r) => map(r, "partner")),
  ].sort((a, b) => (a.issued_at < b.issued_at ? 1 : -1));
}

/** Hinweis bei gesperrter Funktion; Vorlage z. B. „Im Paket {pkg} enthalten – Anfrage an {to}“. */
export function lockedHint(packageName: string, requestTo: string, template = "Im Paket {pkg} enthalten – Anfrage an {to}") {
  return template.replace("{pkg}", packageName).replace("{to}", requestTo);
}
