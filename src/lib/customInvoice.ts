import { z } from "zod";
export type CustomInvoiceLine = { label: string; quantity: string; unit_price: string };
export const emptyInvoiceLine = (): CustomInvoiceLine => ({ label: "", quantity: "1", unit_price: "" });
export const invoiceNumber = (value: string) => Number(value.trim().replace(/\./g, "").replace(",", "."));
export const customInvoiceLinesSchema = z.array(z.object({ label: z.string().trim().min(1).max(200), quantity: z.number().int().min(1).max(100000), unit_price: z.number().finite().min(0).max(1000000) })).min(1).max(50);
export const parseCustomInvoiceLines = (lines: CustomInvoiceLine[]) => customInvoiceLinesSchema.safeParse(lines.map(l => ({ label: l.label, quantity: l.quantity.trim() ? invoiceNumber(l.quantity) : NaN, unit_price: l.unit_price.trim() ? invoiceNumber(l.unit_price) : NaN })));