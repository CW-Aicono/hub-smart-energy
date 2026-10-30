import jsPDF from "jspdf";
import aiconoLogo from "@/assets/aicono-logo.png";

export interface AiconoBillingSettings {
  company_name: string;
  street?: string | null; postal_code?: string | null; city?: string | null; country?: string | null;
  register_court?: string | null; register_number?: string | null; managing_director?: string | null;
  vat_id?: string | null; tax_number?: string | null;
  bank_name?: string | null; iban?: string | null; bic?: string | null;
  email?: string | null; phone?: string | null; website?: string | null;
  payment_terms_days?: number | null; vat_rate?: number | null; footer_note?: string | null;
  logo_url?: string | null;
}

export interface InvoiceRecipient { name: string; contact?: string | null; street?: string | null; postalCity?: string | null; country?: string | null; postalCode?: string | null; city?: string | null; vatId?: string | null; email?: string | null; leitwegId?: string | null }

export interface InvoiceLine { label: string; quantity: number; unitPrice: number; amount: number }

const eur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const dDE = (s?: string | null) => (s ? new Date(s.length === 10 ? s + "T00:00:00" : s).toLocaleDateString("de-DE") : "–");

/** Überschrift je Belegart (Rechnung, Storno-Rechnung, Provisionsgutschrift). */
export function documentTitle(inv: { invoice_number: string; document_type?: string | null }) {
  if (inv.document_type === "cancellation") return `Stornorechnung ${inv.invoice_number}`;
  if (inv.document_type === "credit_note") return `Gutschrift ${inv.invoice_number}`;
  return `Rechnung ${inv.invoice_number}`;
}

/** Normalisiert gespeicherte Positionen (Monatslauf, Einmal, manuell) auf Menge × Einzelpreis = Betrag. */
export function normalizeInvoiceLines(raw: unknown, fallbackAmount: number): InvoiceLine[] {
  const arr = Array.isArray(raw) ? raw : [];
  const lines = arr.map((li: any) => {
    const amount = Number(li?.amount ?? 0);
    const quantity = Number(li?.quantity ?? 1) || 1;
    const unitPrice = li?.unit_price != null ? Number(li.unit_price) : amount / quantity;
    const label = String(li?.label ?? li?.description ?? li?.name ?? li?.code ?? "Position");
    return { label, quantity, unitPrice, amount };
  });
  if (lines.length === 0 && fallbackAmount > 0) lines.push({ label: "Leistung lt. Vereinbarung", quantity: 1, unitPrice: fallbackAmount, amount: fallbackAmount });
  return lines;
}

/** Rechnet Netto, USt und Brutto (kaufmännisch gerundet). */
export function invoiceTotals(net: number, vatRate: number) {
  const n = Math.round(net * 100) / 100;
  const vat = Math.round(n * vatRate) / 100;
  return { net: n, vat, gross: Math.round((n + vat) * 100) / 100 };
}

async function loadLogo(source: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = source;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return { data: c.toDataURL("image/png"), w: img.naturalWidth, h: img.naturalHeight };
  } catch { return null; }
}

export async function buildAiconoInvoicePdf(opts: {
  settings: AiconoBillingSettings;
  recipient: InvoiceRecipient;
  invoice: { invoice_number: string; issued_at: string | null; due_date: string | null; period_start: string | null; period_end: string | null; amount: number; vat_rate: number | null; line_items: unknown; status?: string; document_type?: string | null; cancels_number?: string | null };
  customerNumber?: string;
  partnerBranding?: boolean;
}): Promise<jsPDF> {
  const { settings: s, recipient: r, invoice: inv } = opts;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const ml = 20, mr = 190;
  const brand: [number, number, number] = [16, 64, 112];

  const logo = opts.partnerBranding && !s.logo_url ? null : await loadLogo(opts.partnerBranding ? s.logo_url || "" : aiconoLogo);
  if (logo) { const h = 14; const w = (logo.w / logo.h) * h; doc.addImage(logo.data, "PNG", 105 - w / 2, 14, (logo.w / logo.h) * h, h); }
  else { doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(...brand); doc.text(s.company_name, 105, 22, { align: "center" }); }

  const sender = [s.company_name, s.street, [s.postal_code, s.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(110);
  doc.text(sender, ml, 48);
  doc.setDrawColor(180); doc.line(ml, 49, ml + 85, 49);

  doc.setFontSize(10); doc.setTextColor(0);
  const addr = [r.name, r.contact, r.street, r.postalCity, r.country && r.country !== "Deutschland" ? r.country : null].filter(Boolean) as string[];
  addr.forEach((l, i) => doc.text(l, ml, 55 + i * 5));

  const info: [string, string][] = [
    ["Rechnungsnr.", inv.invoice_number],
    ["Rechnungsdatum", dDE(inv.issued_at)],
    ["Leistungszeitraum", `${dDE(inv.period_start)} – ${dDE(inv.period_end)}`],
    ["Fällig am", dDE(inv.due_date)],
  ];
  if (opts.customerNumber) info.splice(1, 0, ["Kundennr.", opts.customerNumber]);
  doc.setFontSize(9);
  info.forEach(([k, v], i) => { doc.setTextColor(110); doc.text(k, 118, 55 + i * 5); doc.setTextColor(0); doc.text(v, mr, 55 + i * 5, { align: "right" }); });

  let y = 92;
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(...brand);
  doc.text(`${documentTitle(inv)}${inv.status === "voided" ? " (storniert)" : ""}`, ml, y);
  y += 10;
  if (inv.document_type === "cancellation" && inv.cancels_number) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(0);
    doc.text(`Storno zu Rechnung ${inv.cancels_number}. Die Beträge der ursprünglichen Rechnung werden vollständig gutgeschrieben.`, ml, y - 3);
    y += 4;
  }

  doc.setFillColor(...brand); doc.rect(ml, y - 5, mr - ml, 7, "F");
  doc.setFontSize(9); doc.setTextColor(255);
  doc.text("Pos.", ml + 2, y); doc.text("Bezeichnung", ml + 14, y);
  doc.text("Menge", 128, y, { align: "right" }); doc.text("Einzelpreis", 157, y, { align: "right" }); doc.text("Gesamt", mr - 2, y, { align: "right" });
  y += 7;

  doc.setFont("helvetica", "normal"); doc.setTextColor(0);
  const lines = normalizeInvoiceLines(inv.line_items, Number(inv.amount));
  lines.forEach((li, i) => {
    const wrapped = doc.splitTextToSize(li.label, 90) as string[];
    if (y + wrapped.length * 4.5 > 245) { doc.addPage(); y = 25; }
    doc.text(String(i + 1), ml + 2, y);
    doc.text(wrapped, ml + 14, y);
    doc.text(li.quantity.toLocaleString("de-DE", { maximumFractionDigits: 3 }), 128, y, { align: "right" });
    doc.text(eur(li.unitPrice), 157, y, { align: "right" });
    doc.text(eur(li.amount), mr - 2, y, { align: "right" });
    y += wrapped.length * 4.5 + 2;
    doc.setDrawColor(225); doc.line(ml, y - 2.5, mr, y - 2.5);
  });

  const vatRate = Number(inv.vat_rate ?? s.vat_rate ?? 19);
  const t = invoiceTotals(Number(inv.amount), vatRate);
  if (y > 225) { doc.addPage(); y = 25; }
  y += 3;
  const row = (k: string, v: string, bold = false) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.text(k, 140, y); doc.text(v, mr - 2, y, { align: "right" }); y += 5.5; };
  row("Summe netto", eur(t.net));
  row(`zzgl. ${vatRate.toLocaleString("de-DE")} % USt.`, eur(t.vat));
  doc.setDrawColor(...brand); doc.line(140, y - 3.5, mr, y - 3.5);
  row(inv.document_type === "credit_note" ? "Gutschriftbetrag" : "Rechnungsbetrag", eur(t.gross), true);

  y += 6; doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  const pay = inv.document_type === "cancellation" ? `Der Betrag der ursprünglichen Rechnung ${inv.cancels_number ?? ""} wird storniert; bereits gezahlte Beträge werden erstattet bzw. verrechnet.`
    : inv.document_type === "credit_note" ? `Der Gutschriftbetrag wird innerhalb von ${s.payment_terms_days ?? 14} Tagen auf Ihr hinterlegtes Konto überwiesen.`
    : `Bitte überweisen Sie den Rechnungsbetrag bis zum ${dDE(inv.due_date)} (${s.payment_terms_days ?? 14} Tage netto) unter Angabe der Rechnungsnummer ${inv.invoice_number} auf das unten genannte Konto.`;
  const pw = doc.splitTextToSize(pay, mr - ml) as string[];
  doc.text(pw, ml, y); y += pw.length * 4.5;
  if (s.footer_note) { const fw = doc.splitTextToSize(s.footer_note, mr - ml) as string[]; doc.text(fw, ml, y + 2); }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...brand); doc.line(ml, 270, mr, 270);
    doc.setFontSize(7); doc.setTextColor(90);
    const col1 = [s.company_name, s.street, [s.postal_code, s.city].filter(Boolean).join(" ")].filter(Boolean) as string[];
    const col2 = [s.register_court && s.register_number ? `${s.register_court} ${s.register_number}` : null, s.managing_director ? `Geschäftsführer: ${s.managing_director}` : null, s.vat_id ? `USt-IdNr.: ${s.vat_id}` : null, s.tax_number ? `Steuernr.: ${s.tax_number}` : null].filter(Boolean) as string[];
    const col3 = [s.bank_name, s.iban ? `IBAN: ${s.iban}` : null, s.bic ? `BIC: ${s.bic}` : null].filter(Boolean) as string[];
    const col4 = [s.email, s.phone, s.website].filter(Boolean) as string[];
    [col1, col2, col3, col4].forEach((c, i) => c.forEach((l, j) => doc.text(l, ml + i * 44, 275 + j * 3.5)));
    doc.text(`Seite ${p} von ${pages}`, mr, 290, { align: "right" });
  }
  return doc;
}
