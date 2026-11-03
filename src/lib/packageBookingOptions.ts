import { bookingPrice, type BillingCadence } from "./licenseBilling";
export type PackageOptions = { cadence?: BillingCadence; mode?: "percent" | "absolute"; value?: string; limited?: boolean; from?: string; to?: string; after?: "continue" | "end" };
export function packageCadence(item: { onceOnly?: boolean; quantityEnabled?: boolean }, selected: BillingCadence): BillingCadence {
  return item.onceOnly ? "once" : item.quantityEnabled && selected === "once" ? "monthly" : selected;
}
export function packageDiscount(vk: number, value: string, mode: "percent" | "absolute", manual?: string) {
  if (mode === "percent") return bookingPrice(vk, value, manual);
  const reduction = Math.min(vk, Math.max(0, Number(value.replace(",", ".")) || 0));
  return bookingPrice(vk, "0", manual ?? String(Math.round((vk - reduction) * 100) / 100));
}