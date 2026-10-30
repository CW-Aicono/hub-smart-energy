export interface SaleProduct {
  kind: "package" | "unit";
  code: string;
  name: string;
  uvp: number;
  ek: number;
}
type CatalogPackage = { code: string; name: string; uvp: number; ek: number; active?: boolean; always_active?: boolean };
type CatalogUnit = { code: string; name: string; uvp: number; ek: number; new_sale_uvp?: number | null; partner_available?: boolean };
/** Current sale choices, separate from stored legacy contract prices. */
export function packageSaleCatalog(packages: CatalogPackage[], units: CatalogUnit[], partner = false): SaleProduct[] {
  return [
    ...packages.filter(p => p.active !== false && !p.always_active && p.code !== "basis" && p.code !== "p4_charging").map(p => ({ kind: "package" as const, code: p.code, name: p.name, uvp: Number(p.uvp), ek: Number(p.ek) })),
    ...units.filter(u => ["charge_point", "extra_location", "remote_support"].includes(u.code) && (!partner || u.partner_available !== false)).map(u => ({ kind: "unit" as const, code: u.code, name: u.code === "charge_point" ? "Ladeinfrastruktur je Ladepunkt" : u.code === "remote_support" ? "Remote-Support-Flatrate" : u.name, uvp: Number(u.new_sale_uvp ?? u.uvp), ek: Number(u.ek) })),
  ];
}