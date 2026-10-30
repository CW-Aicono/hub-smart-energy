// Rechnungsflüsse nach Partnermodell (Schritt 4) – reine Rechnung, keine DB.
// Direktkunde: AICONO → Kunde (UVP). Wiederverkauf: eine Sammelrechnung AICONO → Partner (EK)
// je Monat, gegliedert nach Kunde; der Partner rechnet selbst mit dem Endkunden ab.
// Provision: AICONO → Kunde (UVP) und monatliche Provisionsgutschrift an den Partner.

const r2 = (n: number) => Math.round(n * 100) / 100;

export type BillingMode = "wholesale" | "commission" | "whitelabel_billing" | string;
export type Route = "direct" | "reseller" | "commission";
export interface FlowTenant { id: string; name: string; partner_id: string | null; partner_self_customer?: boolean | null }
export interface FlowPartner { id: string; name: string; billing_mode: BillingMode; commission_pct: number | null }
export interface FlowLine { type: string; code: string; label: string; quantity: number; uvp: number; ek: number; review?: boolean; session_id?: string }
export interface DraftLine { type: string; code?: string; label: string; quantity: number; unit_price: number; amount: number; tenant_id?: string; review?: boolean; session_id?: string; to_partner?: boolean }

export function routeTenant(t: FlowTenant, partner: FlowPartner | null | undefined): Route {
  if (!t.partner_id || !partner) return "direct";
  return partner.billing_mode === "commission" ? "commission" : "reseller";
}

/** Positionen zu einem Preis (UVP oder EK); zu prüfende Mengen werden mit 0 € ausgewiesen. */
export function priceLines(lines: FlowLine[], pick: "uvp" | "ek"): DraftLine[] {
  return lines.map((l) => {
    const total = l.review ? 0 : r2(l[pick]);
    const unit = l.quantity ? r2(l[pick] / l.quantity) : r2(l[pick]);
    return { type: l.type, code: l.code, label: l.label, quantity: l.quantity, unit_price: unit, amount: total, review: l.review || undefined, session_id: l.session_id };
  });
}

/** Eine Sammelrechnung je Partner und Monat zum EK, nach Kunde sortiert. */
export function buildCollective(entries: { tenant: FlowTenant; lines: FlowLine[] }[]) {
  const sorted = [...entries].sort((a, b) => a.tenant.name.localeCompare(b.tenant.name, "de"));
  const lines: DraftLine[] = [];
  for (const e of sorted) {
    for (const l of priceLines(e.lines, "ek")) {
      const self = !!e.tenant.partner_self_customer;
      lines.push({ ...l, tenant_id: e.tenant.id, to_partner: self || undefined, label: `${e.tenant.name}: ${l.label}${self ? " (An Partner – Eigenbedarf)" : ""}` });
    }
  }
  return { lines, amount: r2(lines.reduce((s, l) => s + l.amount, 0)) };
}

/** Provisionsgutschrift: Provisionssatz des Partners auf die abrechenbare UVP je Kunde. */
export function commissionCredit(partner: FlowPartner, entries: { tenant: FlowTenant; uvp: number }[]) {
  const pct = Number(partner.commission_pct ?? 0);
  const lines: DraftLine[] = [...entries]
    .filter((e) => e.uvp > 0 && pct > 0)
    .sort((a, b) => a.tenant.name.localeCompare(b.tenant.name, "de"))
    .map((e) => ({ type: "commission", label: `Provision ${pct.toLocaleString("de-DE")} % auf ${e.uvp.toLocaleString("de-DE", { minimumFractionDigits: 2 })} € – ${e.tenant.name}`,
      quantity: 1, unit_price: r2(e.uvp * pct / 100), amount: r2(e.uvp * pct / 100), tenant_id: e.tenant.id }));
  return { lines, amount: r2(lines.reduce((s, l) => s + l.amount, 0)) };
}

/** Endkunden-Entwurf des Partners: eigene Verkaufspreise je Code, sonst UVP als Vorschlag. */
export function partnerCustomerLines(lines: FlowLine[], partnerPrices: Record<string, number>): DraftLine[] {
  return lines.map((l) => {
    const unit = partnerPrices[l.code] != null ? Number(partnerPrices[l.code]) : (l.quantity ? r2(l.uvp / l.quantity) : r2(l.uvp));
    const amount = l.review ? 0 : r2(unit * (l.quantity || 1));
    return { type: l.type, code: l.code, label: l.label, quantity: l.quantity, unit_price: unit, amount, review: l.review || undefined };
  });
}

/** Behält vom Partner ergänzte Positionen, wenn der Entwurf neu berechnet wird. */
export function mergeCustomLines(auto: DraftLine[], existing: unknown): DraftLine[] {
  const custom = (Array.isArray(existing) ? existing : []).filter((l: any) => l?.type === "custom");
  return [...auto, ...(custom as DraftLine[])];
}

/** Warnung: Direktrechnungs-Entwürfe an Kunden eines Wiederverkaufs-Partners (außer Eigenbedarf). */
export function directDraftWarnings(tenants: FlowTenant[], partners: Record<string, FlowPartner>, drafts: { tenant_id: string; partner_id: string | null; issued_at: string | null; status: string; document_type?: string }[]): string[] {
  const names = new Set<string>();
  for (const d of drafts) {
    if (d.partner_id || d.issued_at || d.status !== "draft") continue;
    const t = tenants.find((x) => x.id === d.tenant_id);
    if (!t || t.partner_self_customer) continue;
    if (routeTenant(t, partners[t.partner_id ?? ""]) === "reseller") names.add(t.name);
  }
  return [...names].sort();
}
