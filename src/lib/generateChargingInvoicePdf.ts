import jsPDF from "jspdf";
import type { ChargingInvoiceSettings } from "@/hooks/useChargingInvoiceSettings";
import type { ChargingInvoice } from "@/hooks/useChargingInvoices";
import { format } from "date-fns";

interface InvoiceLineItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

interface GeneratePdfOptions {
  invoice: ChargingInvoice;
  settings: ChargingInvoiceSettings;
  userName?: string;
  lineItems?: InvoiceLineItem[];
}

const fmtEur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const fmtDate = (d: string | null) => d ? format(new Date(d), "dd.MM.yyyy") : "—";

export async function generateChargingInvoicePdf(opts: GeneratePdfOptions): Promise<Blob> {
  const { invoice, settings } = opts;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = 210;
  const ml = 25; // margin left
  const mr = 25;
  const contentW = pw - ml - mr;
  let y = 20;

  // -- Logo --
  if (settings.logo_url) {
    try {
      const img = await loadImage(settings.logo_url);
      const maxH = 18;
      const ratio = img.width / img.height;
      const h = maxH;
      const w = Math.min(h * ratio, 60);
      doc.addImage(img, "PNG", ml, y, w, h);
      y += h + 4;
    } catch {
      // skip logo on error
    }
  }

  // -- Sender line (small) --
  doc.setFontSize(7);
  doc.setTextColor(120);
  const senderLine = [settings.company_name, settings.company_address?.replace(/\n/g, ", ")].filter(Boolean).join(" · ");
  doc.text(senderLine, ml, y + 4);
  y += 8;

  // -- Recipient --
  doc.setFontSize(10);
  doc.setTextColor(0);
  const recipientName = opts.userName || "Ladekunde";
  doc.text(recipientName, ml, y + 4);
  y += 12;

  // -- Invoice meta (right aligned) --
  const metaX = pw - mr;
  let metaY = 45;
  doc.setFontSize(9);
  doc.setTextColor(80);
  
  const metaRows = [
    ["Rechnungsnummer:", invoice.invoice_number || "—"],
    ["Rechnungsdatum:", fmtDate(invoice.invoice_date)],
    ["Zeitraum:", invoice.period_start && invoice.period_end ? `${fmtDate(invoice.period_start)} – ${fmtDate(invoice.period_end)}` : "—"],
  ];
  if (settings.tax_id) metaRows.push(["USt-IdNr.:", settings.tax_id]);

  for (const [label, val] of metaRows) {
    doc.text(label, metaX - 60, metaY, { align: "left" });
    doc.setTextColor(0);
    doc.text(val, metaX, metaY, { align: "right" });
    doc.setTextColor(80);
    metaY += 5;
  }

  // -- Title --
  y = Math.max(y, metaY + 8);
  doc.setFontSize(16);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.text("Rechnung", ml, y);
  doc.setFont("helvetica", "normal");
  y += 10;

  // -- Line Items Table --
  const colX = [ml, ml + 80, ml + 100, ml + 125, ml + contentW];
  const headers = ["Beschreibung", "Menge", "Einheit", "Einzelpreis", "Betrag"];

  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.setFont("helvetica", "bold");
  headers.forEach((h, i) => {
    const align = i >= 1 ? "right" : "left";
    doc.text(h, i === 0 ? colX[i] : colX[i], y, { align: align as any });
  });
  doc.setFont("helvetica", "normal");
  y += 2;
  doc.setDrawColor(200);
  doc.line(ml, y, ml + contentW, y);
  y += 5;

  // Build items
  const items: InvoiceLineItem[] = opts.lineItems || [
    {
      description: "Ladestrom",
      quantity: invoice.total_energy_kwh,
      unit: "kWh",
      unitPrice: invoice.net_amount > 0 && invoice.total_energy_kwh > 0
        ? (invoice.net_amount - invoice.idle_fee_amount) / invoice.total_energy_kwh
        : 0,
      total: invoice.net_amount - invoice.idle_fee_amount,
    },
  ];
  if (invoice.idle_fee_amount > 0) {
    items.push({
      description: "Blockiergebühr",
      quantity: 1,
      unit: "pauschal",
      unitPrice: invoice.idle_fee_amount,
      total: invoice.idle_fee_amount,
    });
  }

  doc.setFontSize(9);
  doc.setTextColor(0);
  for (const item of items) {
    doc.text(item.description, colX[0], y);
    doc.text(item.quantity.toLocaleString("de-DE", { maximumFractionDigits: 2 }), colX[1], y, { align: "right" });
    doc.text(item.unit, colX[2], y, { align: "right" });
    doc.text(fmtEur(item.unitPrice), colX[3], y, { align: "right" });
    doc.text(fmtEur(item.total), colX[4], y, { align: "right" });
    y += 6;
  }

  // -- Totals --
  y += 2;
  doc.line(ml + 100, y, ml + contentW, y);
  y += 6;

  const netAmount = invoice.net_amount || (invoice.total_amount - (invoice.tax_amount || 0));
  const taxAmount = invoice.tax_amount || 0;
  const taxRate = invoice.tax_rate_percent || 19;

  doc.setFontSize(9);
  doc.text("Nettobetrag", colX[3] - 20, y, { align: "right" });
  doc.text(fmtEur(netAmount), colX[4], y, { align: "right" });
  y += 5;

  doc.setTextColor(80);
  doc.text(`MwSt. (${taxRate.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %)`, colX[3] - 20, y, { align: "right" });
  doc.text(fmtEur(taxAmount), colX[4], y, { align: "right" });
  y += 2;
  doc.line(ml + 100, y, ml + contentW, y);
  y += 6;

  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Gesamtbetrag", colX[3] - 20, y, { align: "right" });
  doc.text(fmtEur(invoice.total_amount), colX[4], y, { align: "right" });
  doc.setFont("helvetica", "normal");
  y += 12;

  // -- Payment info --
  if (settings.iban) {
    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.text("Bankverbindung:", ml, y);
    y += 5;
    doc.setTextColor(60);
    doc.setFontSize(8);
    if (settings.bank_name) { doc.text(settings.bank_name, ml, y); y += 4; }
    doc.text(`IBAN: ${settings.iban}`, ml, y); y += 4;
    if (settings.bic) { doc.text(`BIC: ${settings.bic}`, ml, y); y += 4; }
    y += 4;
  }

  // -- Footer --
  if (settings.footer_text) {
    const footerY = 275;
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.setDrawColor(200);
    doc.line(ml, footerY - 3, ml + contentW, footerY - 3);
    const lines = doc.splitTextToSize(settings.footer_text, contentW);
    doc.text(lines, pw / 2, footerY, { align: "center" });
  }

  // -- Company info in footer --
  const companyFooterY = 285;
  doc.setFontSize(7);
  doc.setTextColor(140);
  const companyLine = [settings.company_name, settings.company_email, settings.company_phone].filter(Boolean).join(" | ");
  if (companyLine) {
    doc.text(companyLine, pw / 2, companyFooterY, { align: "center" });
  }

  return doc.output("blob");
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
