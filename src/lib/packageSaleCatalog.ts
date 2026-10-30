export interface SaleProduct {
  kind: "package" | "unit";
  code: string;
  name: string;
  uvp: number;
  ek: number;
  onceOnly?: boolean;
}
type CatalogPackage = { code: string; name: string; uvp: number; ek: number; active?: boolean; always_active?: boolean };
type CatalogUnit = { code: string; name: string; uvp: number; ek: number; new_sale_uvp?: number | null; partner_available?: boolean };
/** Positions counted automatically from usage data – never booked manually. */
export const AUTO_COUNTED_UNITS = ["charge_point", "extra_location", "charging_session", "support_15min"] as const;
const BOOKABLE_UNITS = ["setup", "remote_support"];
/** Current sale choices, separate from stored legacy contract prices. */
export function packageSaleCatalog(packages: CatalogPackage[], units: CatalogUnit[], partner = false, includeCounted = false): SaleProduct[] {
  const allowed = includeCounted ? [...BOOKABLE_UNITS, "charge_point", "extra_location"] : BOOKABLE_UNITS;
  return [
    ...packages.filter(p => p.active !== false && !p.always_active && p.code !== "basis" && p.code !== "p4_charging").map(p => ({ kind: "package" as const, code: p.code, name: p.name, uvp: Number(p.uvp), ek: Number(p.ek) })),
    ...units.filter(u => allowed.includes(u.code) && (!partner || u.partner_available !== false)).map(u => ({ kind: "unit" as const, code: u.code, name: u.code === "setup" ? "Einrichtung (einmalig)" : u.code === "remote_support" ? "Remote-Support-Flatrate" : u.code === "charge_point" ? "Ladeinfrastruktur je Ladepunkt" : u.name, uvp: Number(u.new_sale_uvp ?? u.uvp), ek: Number(u.ek), onceOnly: u.code === "setup" })),
  ];
}
/** Prefilled list price: direct customer pays the UVP, a reselling partner the EK. */
export function listPrice(p: Pick<SaleProduct, "uvp" | "ek">, hasPartner: boolean) {
  return hasPartner ? p.ek : p.uvp;
}
export function isIndividualPrice(price: number, list: number) {
  return Math.abs(price - list) > 0.004;
}
