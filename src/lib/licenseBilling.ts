import { z } from "zod";
export const cadenceMonths = { once: 0, monthly: 1, quarterly: 3, halfyearly: 6 } as const;
export type BillingCadence = keyof typeof cadenceMonths;
export const saleSchema = z.object({ tenant: z.string().uuid(), kind: z.enum(["module", "package", "unit"]), code: z.string().min(2).max(64), quantity: z.number().int().min(1).max(100000), cadence: z.enum(["once", "monthly", "quarterly", "halfyearly"]), price: z.number().finite().min(0).max(1000000), payment: z.enum(["invoice", "sepa"]) });
export function licensePeriodEnd(day: string, cadence: BillingCadence) {
  if (cadence === "once") return day;
  const d = new Date(`${day}T00:00:00Z`), months = cadenceMonths[cadence];
  return new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / months) * months + months, 0)).toISOString().slice(0, 10);
}
export function licenseAmount(price: number, quantity: number, from: string, to: string, cadence: BillingCadence) {
  if (cadence === "once") return Math.round(price * quantity * 100) / 100;
  const start = new Date(`${from}T00:00:00Z`), end = new Date(`${to}T00:00:00Z`);
  let m = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)), result = 0;
  while (m <= end) {
    const z = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0));
    result += price * quantity * ((Math.min(z.getTime(), end.getTime()) - Math.max(m.getTime(), start.getTime())) / 86400000 + 1) / z.getUTCDate();
    m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));
  }
  return Math.round(result * 100) / 100;
}