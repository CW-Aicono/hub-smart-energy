// Partner-Preisliste und Margen auf Paketbasis (reine Rechnung, keine DB).
const r2 = (n: number) => Math.round(n * 100) / 100;

export type Sector = "kommune" | "industrie";
export interface CatPackage { code: string; name: string; uvp: number; ek: number; always_active?: boolean; active?: boolean; sort?: number | null }
export interface CatUnit { code: string; name: string; uvp: number; ek: number; new_sale_uvp?: number | null; partner_available?: boolean }
export interface SaleOverride { module_code: string; sale_price_monthly: number | null; sale_price_industry_monthly: number | null }
export interface PriceRow { kind: "package" | "unit"; code: string; name: string; unit: string; ek: number; uvp: number; sale: number; margin: number; custom: boolean }

/** Mengen- und Servicepreise, die in der Partner-Preisliste erscheinen (Reihenfolge = Anzeige). */
export const PRICE_LIST_UNITS = ["extra_location", "charge_point", "charging_session", "remote_support", "support_15min", "setup"] as const;
const UNIT_LABEL: Record<string, { name: string; unit: string }> = {
  extra_location: { name: "Weitere Liegenschaft", unit: "je Liegenschaft / Monat" },
  charge_point: { name: "Ladeinfrastruktur je Ladepunkt", unit: "je Ladepunkt / Monat" },
  charging_session: { name: "Abgerechneter Ladevorgang", unit: "je Ladevorgang" },
  remote_support: { name: "Remote-Support-Flatrate", unit: "je Monat" },
  support_15min: { name: "Support", unit: "je angefangene 15 Min." },
  setup: { name: "Einrichtung", unit: "einmalig" },
};
/** Pakete, die verkauft werden (Basis ist immer enthalten, Ladeinfrastruktur läuft über den Ladepunktpreis). */
const sellable = (p: CatPackage) => p.active !== false && !p.always_active && p.code !== "basis" && p.code !== "p4_charging";
export const unitUvp = (u: CatUnit) => Number(u.new_sale_uvp ?? u.uvp);

export function salePriceFor(code: string, sector: Sector, overrides: SaleOverride[]): number | null {
  const o = overrides.find((x) => x.module_code === code);
  const v = sector === "kommune" ? o?.sale_price_monthly : o?.sale_price_industry_monthly;
  return v == null ? null : Number(v);
}

/** Preisliste für Paketkunden: Pakete und Mengenpreise mit EK, UVP, eigenem Verkaufspreis und Marge. */
export function partnerPriceRows(packages: CatPackage[], units: CatUnit[], overrides: SaleOverride[], sector: Sector): PriceRow[] {
  const row = (kind: PriceRow["kind"], code: string, name: string, unit: string, ek: number, uvp: number): PriceRow => {
    const own = salePriceFor(code, sector, overrides);
    const sale = own ?? uvp;
    return { kind, code, name, unit, ek: r2(ek), uvp: r2(uvp), sale: r2(sale), margin: r2(sale - ek), custom: own != null };
  };
  const pk = [...packages].filter(sellable).sort((a, b) => Number(a.sort ?? 99) - Number(b.sort ?? 99))
    .map((p) => row("package", p.code, p.name, "je Monat", Number(p.ek), Number(p.uvp)));
  const un = PRICE_LIST_UNITS.map((c) => units.find((u) => u.code === c)).filter((u): u is CatUnit => !!u && u.partner_available !== false)
    .map((u) => row("unit", u.code, UNIT_LABEL[u.code]?.name ?? u.name, UNIT_LABEL[u.code]?.unit ?? "", Number(u.ek), unitUvp(u)));
  return [...pk, ...un];
}

/** Auswahl für „Rabatt bei AICONO anfragen“: Pakete 1–6, Mengenpreise und Remote-Support-Flatrate. */
export function discountOptions(packages: CatPackage[], units: CatUnit[]): { code: string; label: string }[] {
  const pk = [...packages].filter(sellable).sort((a, b) => Number(a.sort ?? 99) - Number(b.sort ?? 99)).map((p) => ({ code: p.code, label: p.name }));
  const un = ["extra_location", "charge_point", "charging_session", "remote_support"].filter((c) => units.some((u) => u.code === c && u.partner_available !== false))
    .map((c) => ({ code: c, label: UNIT_LABEL[c].name }));
  return [...pk, ...un];
}

export function catalogLabel(code: string, packages: { code: string; name: string }[] = []): string | null {
  return packages.find((p) => p.code === code)?.name ?? UNIT_LABEL[code]?.name ?? null;
}

export interface OverviewLine { code: string; type: string; quantity: number; uvp: number; ek: number; review?: boolean; viaContract?: boolean }
export interface OverviewRow { tenant_id: string; tenant_name: string; packageBilling: boolean; legacy: boolean; packages: string[]; lines?: OverviewLine[]; uvp: number; ek: number }

/**
 * Endkunden-Verkauf eines Monats aus den Positionen der Monatsübersicht.
 * Eigener Verkaufspreis ersetzt die UVP anteilig (z. B. bei taggenauer Berechnung); Rabattzeilen mindern nur den EK.
 */
export function saleFromLines(lines: OverviewLine[], ownPrice: (code: string) => number | null, catalogUvp: (code: string) => number): number {
  let s = 0;
  for (const l of lines) {
    if (l.review || l.viaContract || l.type === "discount") continue;
    const own = ownPrice(l.code);
    const list = catalogUvp(l.code);
    if (own == null) s += l.uvp;
    else if (list > 0) s += l.uvp * (own / list);
    else s += own * (l.quantity || 1);
  }
  return r2(s);
}

/** Marge je Tenant auf Paketbasis. EK enthält freigegebene Rabatte. */
export function packageMargin(row: OverviewRow, ownPrice: (code: string) => number | null, catalogUvp: (code: string) => number) {
  if (row.lines) {
    const ek = r2(row.lines.filter((l) => !l.review && !l.viaContract).reduce((s, l) => s + l.ek, 0));
    const sale = saleFromLines(row.lines, ownPrice, catalogUvp);
    return { ek, sale, margin: r2(sale - ek) };
  }
  // Nicht umgestellt, aber Pakete gebucht: UVP der Übersicht, Pakete mit eigenem Preis ersetzt
  let sale = row.uvp;
  for (const c of row.packages) { const own = ownPrice(c); if (own != null) sale += own - catalogUvp(c); }
  return { ek: r2(row.ek), sale: r2(sale), margin: r2(sale - row.ek) };
}

/** Erwartete Provision: Anteil an der UVP, die AICONO dem Kunden berechnet. */
export function expectedCommission(uvp: number, pct: number) {
  return r2(uvp * (pct || 0) / 100);
}

/** Summe offener AICONO-Einkaufsrechnungen (ausgestellt, nicht bezahlt/storniert; ohne Entwürfe, Gutschriften, Hinweise). */
export function openPurchaseTotal(invoices: { status: string; document_type?: string | null; amount: number | null }[]) {
  const open = invoices.filter((i) => (i.document_type ?? "invoice") === "invoice" && !["draft", "paid", "voided", "cancelled"].includes(i.status));
  return { count: open.length, total: r2(open.reduce((s, i) => s + Number(i.amount ?? 0), 0)) };
}
