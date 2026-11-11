import { z } from "zod";
import { customInvoiceLinesSchema, invoiceNumber, type CustomInvoiceLine } from "./customInvoice";
import { discountPeriodAmount, discountWindowValid, licensePeriodEnd, type BillingCadence } from "./licenseBilling";
import { packageDiscount } from "./packageBookingOptions";
import { termEnd } from "./licenseTerm";

export type QuoteLine = CustomInvoiceLine & { monthly?: boolean; discountMode?: "percent" | "absolute"; discountValue?: string };
export type ManualInvoiceOptions = { cadence: BillingCadence; termMonths: string; discountMode: "percent" | "absolute"; discountValue: string; limited: boolean; discountFrom: string; discountTo: string; after: "continue" | "end"; payment: "invoice" | "sepa"; from: string; to: string };
const dateValid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const discountSchema = z.number().finite().min(0);

/** One-off drafts reuse package half-month pricing without creating contracts. */
export function manualInvoiceQuote(lines: QuoteLine[], o: ManualInvoiceOptions) {
  const fail = (error: "lines" | "dates" | "term" | "discount" | "window") => ({ success: false as const, error });
  const parsed = customInvoiceLinesSchema.safeParse(lines.map(l => ({ label: l.label, quantity: invoiceNumber(l.quantity), unit_price: invoiceNumber(l.unit_price) })));
  if (!parsed.success) return fail("lines");
  if (!dateValid(o.from) || (o.cadence === "once" && !o.termMonths && (!dateValid(o.to) || o.to < o.from))) return fail("dates");
  const term = o.termMonths === "" ? null : Number(o.termMonths);
  if ((term !== null && (!/^\d+$/.test(o.termMonths) || !Number.isInteger(term) || term < 1 || term > 240)) || (o.cadence === "once" && lines.some(l => l.monthly) && term === null)) return fail("term");
  if (o.limited && !discountWindowValid(o.discountFrom, o.discountTo, o.from)) return fail("window");
  const end = o.cadence === "once" ? (term ? termEnd(o.from, term) : o.to) : licensePeriodEnd(o.from, o.cadence);
  const periodEnd = term && termEnd(o.from, term) < end ? termEnd(o.from, term) : end;
  const billedEnd = o.limited && o.after === "end" && o.discountTo < periodEnd ? o.discountTo : periodEnd;
  const result = [];
  for (let i = 0; i < parsed.data.length; i++) {
    const l = parsed.data[i], input = lines[i];
    const mode = input.discountMode ?? o.discountMode, value = input.discountValue ?? o.discountValue;
    const reduction = invoiceNumber(value);
    if (value.trim() === "" || !discountSchema.safeParse(reduction).success || (mode === "percent" && reduction > 100) || (mode === "absolute" && reduction > l.unit_price)) return fail("discount");
    const sale = packageDiscount(l.unit_price, String(reduction), mode).amount;
    const cadence = input.monthly ? (o.cadence === "once" ? "monthly" : o.cadence) : "once";
    const amount = discountPeriodAmount(sale, l.unit_price, l.quantity, o.from, billedEnd, cadence, o.limited ? o.discountFrom : undefined, o.limited ? o.discountTo : undefined);
    const details = `${o.from} – ${input.monthly ? billedEnd : o.from}${term ? ` · ${term} M` : ""}${reduction ? ` · −${reduction.toLocaleString("de-DE")} ${mode === "percent" ? "%" : "€"}` : ""}${o.limited ? ` (${o.discountFrom} – ${o.discountTo})` : ""}`;
    result.push({ ...l, monthly: !!input.monthly, discount_mode: mode, discount_value: reduction, amount, invoice_label: `${l.label.slice(0, 160)} · ${details}` });
  }
  return { success: true as const, lines: result, periodEnd: billedEnd, net: Math.round(result.reduce((s, l) => s + l.amount, 0) * 100) / 100 };
}