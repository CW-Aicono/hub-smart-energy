export type PaymentMode = "monthly" | "prepaid" | "one_time";

export interface TenantModuleDiscount {
  id: string;
  tenant_id: string;
  module_code: string | null;
  bundle_id?: string | null;
  discount_type: "percent" | "absolute";
  value: number;
  valid_from: string;
  valid_until: string | null;
  duration_value?: number | null;
  duration_unit?: "month" | "year" | null;
  payment_mode?: PaymentMode | null;
  one_time_amount?: number | null;
  invoiced_at?: string | null;
  note: string | null;
}

export type DiscountStatus = "active" | "planned" | "expired";

const today = () => new Date().toISOString().slice(0, 10);

export function discountStatus(d: TenantModuleDiscount, ref = today()): DiscountStatus {
  if (d.valid_from > ref) return "planned";
  if (d.valid_until && d.valid_until < ref) return "expired";
  return "active";
}

/** Bundle-ID -> enthaltene Modulcodes */
export type BundleModuleMap = Record<string, string[]>;

/** Gilt der Rabatt für dieses Modul? (Modul, Bundle mit diesem Modul, oder „alle“) */
export function discountCoversModule(d: TenantModuleDiscount, code: string, bundles: BundleModuleMap = {}) {
  if (d.module_code) return d.module_code === code;
  if (d.bundle_id) return (bundles[d.bundle_id] ?? []).includes(code);
  return true;
}

/** Heute aktive Vorkasse/Einmalzahlung, die dieses Modul abdeckt (Modul wird dann nicht monatlich berechnet). */
export function prepaidCover(code: string, discounts: TenantModuleDiscount[], bundles: BundleModuleMap = {}) {
  return discounts.find((d) => (d.payment_mode ?? "monthly") !== "monthly" && discountStatus(d) === "active" && discountCoversModule(d, code, bundles)) ?? null;
}

/** Günstigster heute gültiger Modul-Rabatt (monatlich, kein Bundle, keine Addition), nie unter 0. */
export function applyBestDiscount(gross: number, moduleCode: string, discounts: TenantModuleDiscount[]) {
  let best: { amount: number; discount: TenantModuleDiscount } | null = null;
  for (const d of discounts) {
    if ((d.payment_mode ?? "monthly") !== "monthly" || d.bundle_id) continue;
    if (discountStatus(d) !== "active") continue;
    if (d.module_code && d.module_code !== moduleCode) continue;
    const raw = d.discount_type === "percent" ? (gross * Number(d.value)) / 100 : Number(d.value);
    const amount = Math.min(gross, Math.round(raw * 100) / 100);
    if (amount > 0 && (!best || amount > best.amount)) best = { amount, discount: d };
  }
  return { net: gross - (best?.amount ?? 0), discount: best };
}

/** Bundle-Rabatt auf die Summe der Bundle-Module (nach Modul-Rabatten), nie unter 0. */
export function bundleDiscountAmount(d: TenantModuleDiscount, bundleNet: number) {
  const raw = d.discount_type === "percent" ? (bundleNet * Number(d.value)) / 100 : Number(d.value);
  return Math.max(0, Math.min(bundleNet, Math.round(raw * 100) / 100));
}

export const fmtEur = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

export function addMonths(dateIso: string, months: number): string {
  const d = new Date(dateIso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export const durationMonths = (value: number, unit: "month" | "year") => (unit === "year" ? value * 12 : value);

export function describeDiscount(d: TenantModuleDiscount) {
  const what = d.discount_type === "percent" ? `${Number(d.value).toLocaleString("de-DE")} %` : fmtEur(Number(d.value));
  if (d.payment_mode === "one_time") return `Einmalzahlung ${fmtEur(Number(d.one_time_amount ?? 0))}`;
  if (d.payment_mode === "prepaid") return `Vorkasse, −${what}`;
  return `−${what}`;
}

export const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = {
  monthly: "Monatlich",
  prepaid: "Vorkasse",
  one_time: "Einmalzahlung",
};
