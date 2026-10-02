import jsPDF from "jspdf";
import type { ChargingInvoiceSettings } from "@/hooks/useChargingInvoiceSettings";
import type { ChargingInvoice } from "@/hooks/useChargingInvoices";
import { format } from "date-fns";

interface GeneratePdfOptions {
  invoice: ChargingInvoice;
  settings: ChargingInvoiceSettings;
  userName?: string;
}

const fmtEur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const fmtKwh = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kWh";
const fmtDate = (d: string | null) => d ? format(new Date(d), "dd.MM.yyyy") : "—";

export async function generateChargingInvoicePdf(opts: GeneratePdfOptions): Promise<Blob> {
  const { invoice, settings } = opts;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = 210;
  const ml = 20;
  const mr = 20;
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
      // skip
    }
  }

  // -- Sender line --
  doc.setFontSize(7);
  doc.setTextColor(120);
  const senderLine = [settings.company_name, settings.company_address?.replace(/\n/g, ", ")].filter(Boolean).join(" · ");
  doc.text(senderLine, ml, y + 4);
  y += 8;

  // -- Recipient --
  doc.setFontSize(10);
  doc.setTextColor(0);
  const recipientName = opts.userName || invoice.user_name || "Ladekunde";
  doc.text(recipientName, ml, y + 4);
  if (invoice.user_email) {
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(invoice.user_email, ml, y + 9);
    doc.setTextColor(0);
  }
  y += 14;

  // -- Invoice meta --
  const metaX = pw - mr;
  let metaY = 45;
  doc.setFontSize(9);
  doc.setTextColor(80);
  const metaRows: [string, string][] = [
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
  y = Math.max(y, metaY + 6);
  doc.setFontSize(16);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.text("Rechnung", ml, y);
  doc.setFont("helvetica", "normal");
  y += 8;

  // Tariff details
  const taxRate = invoice.tax_rate_percent || 19;
  const pricePerKwh = invoice.tariff_price_per_kwh ?? 0;
  const idleFeePerMin = invoice.tariff_idle_fee_per_minute ?? 0;
  const idleGrace = invoice.tariff_idle_fee_grace_minutes ?? 60;

  // -- Sessions grouped by tag --
  const sessions = invoice.sessions || [];
  const tagLabel = new Map<string, string | null>();
  for (const t of (invoice.user_tags || [])) tagLabel.set(t.tag.toUpperCase(), t.label);

  const groups = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const key = (s.id_tag || "—").toUpperCase();
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }

  const colX = {
    date: ml,
    energy: ml + 70,
    idle: ml + 100,
    net: ml + 130,
    gross: ml + contentW,
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > 270) {
      doc.addPage();
      y = 20;
    }
  };

  doc.setFontSize(10);
  doc.setTextColor(0);

  for (const [tagKey, sess] of groups) {
    ensureSpace(20);
    // Tag header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0);
    const label = tagLabel.get(tagKey);
    const headerText = label ? `Tag: ${tagKey}  ·  ${label}` : `Tag: ${tagKey}`;
    doc.text(headerText, ml, y);
    y += 5;

    // Table header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text("Zeitpunkt", colX.date, y);
    doc.text("Energie", colX.energy, y, { align: "right" });
    doc.text("Blockiergeb.", colX.idle, y, { align: "right" });
    doc.text("Netto", colX.net, y, { align: "right" });
    doc.text("Brutto", colX.gross, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += 1.5;
    doc.setDrawColor(200);
    doc.line(ml, y, ml + contentW, y);
    y += 4;

    doc.setFontSize(9);
    doc.setTextColor(0);
    for (const s of sess!) {
      ensureSpace(6);
      const duration = s.stop_time ? Math.round((new Date(s.stop_time).getTime() - new Date(s.start_time).getTime()) / 60000) : 0;
      const idleMin = Math.max(0, duration - idleGrace);
      const idleFee = idleFeePerMin > 0 ? idleMin * idleFeePerMin : 0;
      const energyNet = (s.energy_kwh || 0) * pricePerKwh;
      const net = energyNet + idleFee;
      const gross = net * (1 + taxRate / 100);

      doc.text(format(new Date(s.start_time), "dd.MM.yyyy HH:mm"), colX.date, y);
      doc.text(fmtKwh(s.energy_kwh || 0), colX.energy, y, { align: "right" });
      doc.text(idleFee > 0 ? fmtEur(idleFee) : "—", colX.idle, y, { align: "right" });
      doc.text(fmtEur(net), colX.net, y, { align: "right" });
      doc.text(fmtEur(gross), colX.gross, y, { align: "right" });
      y += 5;
    }
    y += 4;
  }

  if (groups.size === 0) {
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("Keine Ladevorgänge verknüpft.", ml, y);
    y += 8;
  }

  // -- Totals --
  ensureSpace(30);
  y += 2;
  doc.setDrawColor(180);
  doc.line(ml + 90, y, ml + contentW, y);
  y += 5;

  const netAmount = invoice.net_amount || (invoice.total_amount - (invoice.tax_amount || 0));
  const taxAmount = invoice.tax_amount || 0;

  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text("Nettobetrag", colX.net, y, { align: "right" });
  doc.text(fmtEur(netAmount), colX.gross, y, { align: "right" });
  y += 5;

  doc.setTextColor(80);
  doc.text(`MwSt. (${taxRate.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %)`, colX.net, y, { align: "right" });
  doc.text(fmtEur(taxAmount), colX.gross, y, { align: "right" });
  y += 2;
  doc.line(ml + 90, y, ml + contentW, y);
  y += 5;

  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Gesamtbetrag (brutto)", colX.net, y, { align: "right" });
  doc.text(fmtEur(invoice.total_amount), colX.gross, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  y += 10;

  // -- Payment info --
  if (settings.iban) {
    ensureSpace(20);
    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.text("Bankverbindung:", ml, y);
    y += 5;
    doc.setTextColor(60);
    doc.setFontSize(8);
    if (settings.bank_name) { doc.text(settings.bank_name, ml, y); y += 4; }
    doc.text(`IBAN: ${settings.iban}`, ml, y); y += 4;
    if (settings.bic) { doc.text(`BIC: ${settings.bic}`, ml, y); y += 4; }
  }

  // -- Footer on each page --
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    if (settings.footer_text) {
      const footerY = 275;
      doc.setFontSize(7);
      doc.setTextColor(120);
      doc.setDrawColor(200);
      doc.line(ml, footerY - 3, ml + contentW, footerY - 3);
      const lines = doc.splitTextToSize(settings.footer_text, contentW);
      doc.text(lines, pw / 2, footerY, { align: "center" });
    }
    const companyFooterY = 285;
    doc.setFontSize(7);
    doc.setTextColor(140);
    const companyLine = [settings.company_name, settings.company_email, settings.company_phone].filter(Boolean).join(" | ");
    if (companyLine) {
      doc.text(companyLine, pw / 2, companyFooterY, { align: "center" });
    }
    doc.text(`Seite ${p} / ${totalPages}`, pw - mr, 290, { align: "right" });
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
