// Rechnungs-PDF mit eingebetteter E-Rechnung (ZUGFeRD / Factur-X, Profil EN 16931).
import { buildAiconoInvoicePdf, documentTitle, normalizeInvoiceLines, type AiconoBillingSettings, type InvoiceRecipient } from "@/lib/aiconoInvoicePdf";
import { buildZugferdXml, embedZugferd, type EParty } from "@/lib/zugferd";

type Inv = Parameters<typeof buildAiconoInvoicePdf>[0]["invoice"];

const splitPostalCity = (pc?: string | null) => { const m = (pc ?? "").trim().match(/^(\d{4,5})\s+(.*)$/); return m ? { postalCode: m[1], city: m[2] } : { postalCode: null, city: pc || null }; };

export function sellerParty(s: AiconoBillingSettings & Record<string, any>): EParty {
  return { name: s.company_name, street: s.street, postalCode: s.postal_code, city: s.city, country: s.country, vatId: s.vat_id, taxNumber: s.tax_number, email: s.email };
}
export function recipientParty(r: InvoiceRecipient): EParty {
  const pc = r.postalCode || r.city ? { postalCode: r.postalCode ?? null, city: r.city ?? null } : splitPostalCity(r.postalCity);
  return { name: r.name, street: r.street, postalCode: pc.postalCode, city: pc.city, country: r.country, vatId: r.vatId, email: r.email };
}

export function eInvoiceXml(settings: AiconoBillingSettings & Record<string, any>, recipient: InvoiceRecipient, inv: Inv) {
  const selfBilled = inv.document_type === "credit_note"; // Provisionsgutschrift: Leistender ist der Partner
  const me = sellerParty(settings), other = recipientParty(recipient);
  return buildZugferdXml({
    number: inv.invoice_number, typeCode: selfBilled ? "389" : inv.document_type === "cancellation" ? "381" : "380",
    issueDate: (inv.issued_at ?? new Date().toISOString()).slice(0, 10), dueDate: inv.due_date, periodStart: inv.period_start, periodEnd: inv.period_end,
    seller: selfBilled ? other : me, buyer: selfBilled ? me : other, buyerReference: selfBilled ? null : recipient.leitwegId,
    precedingNumber: inv.cancels_number ?? null,
    lines: normalizeInvoiceLines(inv.line_items, Number(inv.amount)), vatRate: Number(inv.vat_rate ?? settings.vat_rate ?? 19),
    iban: selfBilled ? null : settings.iban, bic: selfBilled ? null : settings.bic,
    paymentTerms: inv.due_date ? `Zahlbar bis ${new Date(inv.due_date + "T00:00:00").toLocaleDateString("de-DE")}` : null,
  });
}

/** Baut das sichtbare PDF und bettet die E-Rechnungsdaten ein. */
export async function buildEInvoicePdf(opts: Parameters<typeof buildAiconoInvoicePdf>[0]) {
  const doc = await buildAiconoInvoicePdf(opts);
  const xml = eInvoiceXml(opts.settings as any, opts.recipient, opts.invoice);
  const bytes = await embedZugferd(doc.output("arraybuffer") as ArrayBuffer, xml, documentTitle(opts.invoice));
  const blob = new Blob([bytes], { type: "application/pdf" });
  let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { bytes, blob, base64: btoa(bin), xml };
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
