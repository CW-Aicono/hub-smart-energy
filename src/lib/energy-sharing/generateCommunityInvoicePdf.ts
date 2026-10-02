// Iter C – Client-seitige PDF-Generierung für Mitgliederrechnungen einer Energiegemeinschaft.
import jsPDF from "jspdf";

export interface CommunityInvoiceForPdf {
  id: string;
  invoice_number?: string | null;
  period_start: string;
  period_end: string;
  allocated_kwh: number;
  feed_in_kwh: number;
  internal_amount_ct: number;
  feed_in_credit_ct: number;
  total_ct: number;
  currency?: string | null;
  status: string;
  line_items?: Array<{ description: string; quantity: number; unit: string; unit_price_ct: number; total_ct: number }>;
}

export interface CommunityInvoiceContext {
  communityName: string;
  memberName: string;
  memberEmail?: string | null;
  tenantName?: string | null;
}

const eur = (ct: number) => (ct / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const num = (n: number, d = 2) => Number(n).toLocaleString("de-DE", { maximumFractionDigits: d, minimumFractionDigits: d });
const date = (s: string) => new Date(s).toLocaleDateString("de-DE");

export function generateCommunityInvoicePdf(invoice: CommunityInvoiceForPdf, ctx: CommunityInvoiceContext): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = 210;
  const ml = 20;
  const mr = 20;
  let y = 22;

  // Kopf
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Rechnung Energiegemeinschaft", ml, y);
  y += 8;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(ctx.communityName, ml, y);
  if (ctx.tenantName) {
    doc.text(ctx.tenantName, pw - mr, y, { align: "right" });
  }
  y += 10;

  // Mitglied
  doc.setFont("helvetica", "bold");
  doc.text("Rechnungsempfänger", ml, y);
  doc.setFont("helvetica", "normal");
  y += 5;
  doc.text(ctx.memberName, ml, y);
  if (ctx.memberEmail) { y += 5; doc.text(ctx.memberEmail, ml, y); }
  y += 10;

  // Meta
  doc.setFont("helvetica", "bold");
  doc.text(`Rechnungs-Nr.: `, ml, y);
  doc.setFont("helvetica", "normal");
  doc.text(invoice.invoice_number ?? invoice.id.slice(0, 8), ml + 35, y);
  doc.setFont("helvetica", "bold");
  doc.text("Abrechnungszeitraum:", pw - mr - 70, y);
  doc.setFont("helvetica", "normal");
  doc.text(`${date(invoice.period_start)} – ${date(invoice.period_end)}`, pw - mr, y, { align: "right" });
  y += 10;

  // Positionen
  doc.setFont("helvetica", "bold");
  doc.setFillColor(240, 240, 240);
  doc.rect(ml, y - 4, pw - ml - mr, 7, "F");
  doc.text("Position", ml + 2, y);
  doc.text("Menge", ml + 90, y, { align: "right" });
  doc.text("Einheit", ml + 100, y);
  doc.text("Einzelpreis", pw - mr - 30, y, { align: "right" });
  doc.text("Gesamt", pw - mr - 2, y, { align: "right" });
  y += 7;
  doc.setFont("helvetica", "normal");

  const items = invoice.line_items?.length
    ? invoice.line_items
    : [
        {
          description: "Anteilig bezogene Energie (Community)",
          quantity: invoice.allocated_kwh,
          unit: "kWh",
          unit_price_ct: invoice.allocated_kwh > 0 ? invoice.internal_amount_ct / invoice.allocated_kwh : 0,
          total_ct: invoice.internal_amount_ct,
        },
        ...(invoice.feed_in_kwh > 0
          ? [{
              description: "Einspeisevergütung (Gutschrift)",
              quantity: invoice.feed_in_kwh,
              unit: "kWh",
              unit_price_ct: invoice.feed_in_kwh > 0 ? -invoice.feed_in_credit_ct / invoice.feed_in_kwh : 0,
              total_ct: -invoice.feed_in_credit_ct,
            }]
          : []),
      ];

  items.forEach((it) => {
    if (y > 260) { doc.addPage(); y = 20; }
    doc.text(String(it.description), ml + 2, y);
    doc.text(num(it.quantity, 3), ml + 90, y, { align: "right" });
    doc.text(String(it.unit), ml + 100, y);
    doc.text(`${num(it.unit_price_ct / 100, 4)} €`, pw - mr - 30, y, { align: "right" });
    doc.text(eur(it.total_ct), pw - mr - 2, y, { align: "right" });
    y += 6;
  });

  y += 4;
  doc.setDrawColor(180);
  doc.line(ml, y, pw - mr, y);
  y += 6;

  // Summe
  doc.setFont("helvetica", "bold");
  doc.text("Gesamtbetrag", pw - mr - 60, y);
  doc.text(eur(invoice.total_ct), pw - mr - 2, y, { align: "right" });
  y += 10;

  // Hinweis
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100);
  const note =
    "Diese Abrechnung basiert auf gemessenen 15-Minuten-Werten (MSCONS) und der vereinbarten " +
    "Verteilstrategie der Energiegemeinschaft gemäß §42c EnWG. Bei Rückfragen wenden Sie sich " +
    "bitte an die Betreiberin der Gemeinschaft.";
  doc.text(doc.splitTextToSize(note, pw - ml - mr), ml, y);

  return doc.output("blob");
}
