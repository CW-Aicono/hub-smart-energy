export interface TenantModuleDiscount {
  id: string;
  tenant_id: string;
  module_code: string | null;
  discount_type: "percent" | "absolute";
  value: number;
  valid_from: string;
  valid_until: string | null;
  note: string | null;
}

export type DiscountStatus = "active" | "planned" | "expired";

const today = () => new Date().toISOString().slice(0, 10);

export function discountStatus(d: TenantModuleDiscount, ref = today()): DiscountStatus {
  if (d.valid_from > ref) return "planned";
  if (d.valid_until && d.valid_until < ref) return "expired";
  return "active";
}

/** Günstigster heute gültiger Rabatt (keine Addition), nie unter 0. */
export function applyBestDiscount(gross: number, moduleCode: string, discounts: TenantModuleDiscount[]) {
  let best: { amount: number; discount: TenantModuleDiscount } | null = null;
  for (const d of discounts) {
    if (discountStatus(d) !== "active") continue;
    if (d.module_code && d.module_code !== moduleCode) continue;
    const raw = d.discount_type === "percent" ? (gross * Number(d.value)) / 100 : Number(d.value);
    const amount = Math.min(gross, Math.round(raw * 100) / 100);
    if (amount > 0 && (!best || amount > best.amount)) best = { amount, discount: d };
  }
  return { net: gross - (best?.amount ?? 0), discount: best };
}

export const fmtEur = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

export function addMonths(dateIso: string, months: number): string {
  const d = new Date(dateIso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
