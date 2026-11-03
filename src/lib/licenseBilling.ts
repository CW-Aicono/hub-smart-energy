import { z } from "zod";
export const cadenceMonths = { once: 0, monthly: 1, quarterly: 3, halfyearly: 6, yearly: 12 } as const;
export type BillingCadence = keyof typeof cadenceMonths;
export const saleSchema = z.object({ tenant: z.string().uuid(), kind: z.enum(["package", "unit"]), code: z.string().min(2).max(64), quantity: z.number().int().min(1).max(100000), cadence: z.enum(["once", "monthly", "quarterly", "halfyearly", "yearly"]), price: z.number().finite().min(0).max(1000000), payment: z.enum(["invoice", "sepa"]) }).refine(p => p.kind === "package" ? p.code !== "p4_charging" && p.quantity === 1 : ["charge_point", "extra_location"].includes(p.code) ? p.cadence !== "once" : ["setup", "remote_support"].includes(p.code) && p.quantity === 1 && (p.code !== "setup" || p.cadence === "once"));
export function licensePeriodEnd(day: string, cadence: BillingCadence) {
  if (cadence === "once") return day;
  const d = new Date(`${day}T00:00:00Z`), months = cadenceMonths[cadence];
  return new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / months) * months + months, 0)).toISOString().slice(0, 10);
}
/** Halbmonatsraster: 1.–15. und 16.–Monatsende; jede angebrochene Hälfte = halber Monatspreis (keine taggenaue Abrechnung). */
export function licenseAmount(price: number, quantity: number, from: string, to: string, cadence: BillingCadence) {
  if (cadence === "once") return Math.round(price * quantity * 100) / 100;
  const start = new Date(`${from}T00:00:00Z`), end = new Date(`${to}T00:00:00Z`);
  let m = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)), result = 0;
  while (m <= end) {
    const z = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0));
    const s = new Date(Math.max(m.getTime(), start.getTime())).getUTCDate();
    const e = new Date(Math.min(z.getTime(), end.getTime())).getUTCDate();
    const halves = (s <= 15 ? 1 : 0) + (e >= 16 ? 1 : 0);
    result += price * quantity * halves / 2;
    m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));
  }
  return Math.round(result * 100) / 100;
}
/** Endkundenpreis nach Partnerrabatt in Prozent auf den VK. */
export function discountedPrice(vk: number, pct: number) {
  return Math.round(vk * (1 - Math.min(100, Math.max(0, pct)) / 100) * 100) / 100;
}
/** One source for editable percentage discounts and manually entered VK. */
export function bookingPrice(vk: number, discount: string, price?: string) {
  const pct = Math.min(100, Math.max(0, Number(discount.replace(",", ".")) || 0));
  const manual = price !== undefined && price !== "";
  const amount = manual ? Number(price.replace(",", ".")) || 0 : discountedPrice(vk, pct);
  const effectivePct = manual && vk > 0 ? Math.round(Math.min(100, Math.max(0, (1 - amount / vk) * 100)) * 100) / 100 : pct;
  return { amount, pct: effectivePct, individual: manual && Math.abs(amount - discountedPrice(vk, effectivePct)) > 0.004 };
}

export function discountWindowValid(from: string, to: string, start: string) {
  const a = new Date(`${from}T00:00:00Z`), b = new Date(`${to}T00:00:00Z`);
  return Number.isFinite(a.getTime()) && Number.isFinite(b.getTime()) && a.toISOString().slice(0, 10) === from && b.toISOString().slice(0, 10) === to && from >= start && to >= from && [1, 16].includes(a.getUTCDate()) && (b.getUTCDate() === 15 || b.getUTCDate() === new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 0)).getUTCDate());
}

/** Discount windows use whole half-months; never apply both rates to one half. */
export function discountPeriodAmount(sale: number, list: number, quantity: number, from: string, to: string, cadence: BillingCadence, discountFrom?: string, discountTo?: string) {
  if (!discountFrom || !discountTo) return licenseAmount(sale, quantity, from, to, cadence);
  if (cadence === "once") return licenseAmount(from >= discountFrom && from <= discountTo ? sale : list, quantity, from, to, cadence);
  const start = new Date(`${from}T00:00:00Z`), end = new Date(`${to}T00:00:00Z`);
  let month = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)), amount = 0;
  while (month <= end) {
    for (const day of [1, 16]) {
      const half = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day));
      const last = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + (day === 16 ? 1 : 0), day === 16 ? 0 : 15));
      if (half <= end && last >= start) amount += ((half.toISOString().slice(0, 10) <= discountTo && last.toISOString().slice(0, 10) >= discountFrom) ? sale : list) * quantity / 2;
    }
    month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
  }
  return Math.round(amount * 100) / 100;
}