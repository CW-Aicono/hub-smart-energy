// Zentrale Reporting-Berechnung: Sessions ↔ Rechnungen ↔ Tarife.
//
// Ziel: eine einzige, konsistente Quelle für UI, CSV, XLSX, PDF und den
// geplanten E-Mail-Report. Vermeidet die früher genutzte 1:1-Annahme
// zwischen `charging_invoices.session_id` und `charging_sessions.id` —
// Rechnungen werden über `charging_invoice_sessions` verknüpft und
// Sammelrechnungen proportional auf ihre Sessions verteilt.
//
// Fallback für Sessions ohne Rechnung: Tarif × Session-kWh (kalkulatorisch).

export type AllocationSource = "invoice" | "calculated" | "none";

export interface AllocSession {
  id: string;
  id_tag: string | null;
  start_time: string;
  stop_time: string | null;
  energy_kwh: number | null;
  charge_point_id?: string | null;
}

export interface AllocInvoice {
  id: string;
  session_id: string | null;
  user_id: string | null;
  billing_group_id: string | null;
  total_amount: number | null;
  net_amount: number | null;
  idle_fee_amount: number | null;
  total_energy_kwh: number | null;
  status: string | null;
  invoice_date: string | null;
}

export interface AllocInvoiceLink {
  invoice_id: string;
  session_id: string;
}

export interface AllocTariff {
  id: string;
  price_per_kwh: number;
  idle_fee_per_minute: number;
  idle_fee_grace_minutes: number;
  tax_rate_percent: number;
  price_includes_vat: boolean | null;
  is_default: boolean;
}

export interface AllocUser {
  id: string;
  group_id: string | null;
  tariff_id: string | null;
}

export interface AllocUserGroup {
  id: string;
  tariff_id: string | null;
}

export interface SessionAllocation {
  source: AllocationSource;
  /** Brutto-Umsatz, der dieser Session zugeordnet wurde. */
  revenue_gross: number;
  /** Netto-Umsatz, der dieser Session zugeordnet wurde. */
  revenue_net: number;
  /** Anteil Standzeit-Gebühr. */
  idle_fee: number;
  /** kWh-Basis für €/kWh-Berechnung (konsistent mit revenue_gross). */
  billed_kwh: number;
  /** Nur bei source="invoice": die primäre (jüngste) Rechnung dieser Session. */
  invoice_id?: string;
  invoice_status?: string | null;
  user_id?: string | null;
  billing_group_id?: string | null;
  /** Nur bei source="calculated": genutzter Tarif. */
  tariff_id?: string | null;
  /** true, wenn keine Zuordnung möglich war (weder Rechnung noch Tarif). */
  no_tariff?: boolean;
}

export interface DiagnosticsReport {
  duplicate_invoice_sessions: string[]; // session_ids mit ≥ 2 Rechnungen
  invoices_without_link: string[];      // invoice_ids ohne N:M-Link und ohne legacy session_id
  sessions_without_tariff: string[];    // session_ids mit source="none"
  invoice_energy_mismatch: string[];    // invoice_ids mit > 5% kWh-Abweichung
}

export interface BuildAllocationsResult {
  allocations: Map<string, SessionAllocation>;
  diagnostics: DiagnosticsReport;
}

function resolveUserId(
  session: AllocSession,
  rfidToUser: Map<string, string>,
): string | null {
  const tag = String(session.id_tag ?? "").toLowerCase();
  if (!tag) return null;
  return rfidToUser.get(tag) ?? null;
}

function resolveTariff(
  userId: string | null,
  users: Map<string, AllocUser>,
  userGroups: Map<string, AllocUserGroup>,
  tariffs: Map<string, AllocTariff>,
  defaultTariff: AllocTariff | null,
): AllocTariff | null {
  if (userId) {
    const u = users.get(userId);
    if (u?.tariff_id) {
      const t = tariffs.get(u.tariff_id);
      if (t) return t;
    }
    if (u?.group_id) {
      const g = userGroups.get(u.group_id);
      if (g?.tariff_id) {
        const t = tariffs.get(g.tariff_id);
        if (t) return t;
      }
    }
  }
  return defaultTariff;
}

function computeCalculated(
  session: AllocSession,
  tariff: AllocTariff,
): { gross: number; net: number; idle: number } {
  const kwh = Number(session.energy_kwh ?? 0);
  const price = Number(tariff.price_per_kwh ?? 0);
  const includesVat = tariff.price_includes_vat !== false;
  const taxRate = Number(tariff.tax_rate_percent ?? 19) / 100;

  let gross: number;
  let net: number;
  if (includesVat) {
    gross = kwh * price;
    net = taxRate > 0 ? gross / (1 + taxRate) : gross;
  } else {
    net = kwh * price;
    gross = net * (1 + taxRate);
  }

  let idle = 0;
  const idlePerMin = Number(tariff.idle_fee_per_minute ?? 0);
  const grace = Number(tariff.idle_fee_grace_minutes ?? 0);
  if (idlePerMin > 0 && session.start_time && session.stop_time) {
    const minutes =
      (new Date(session.stop_time).getTime() - new Date(session.start_time).getTime()) / 60000;
    const billable = Math.max(0, minutes - grace);
    idle = billable * idlePerMin;
    gross += idle;
    net += taxRate > 0 && includesVat ? idle / (1 + taxRate) - idle : 0;
    if (!includesVat) net += 0; // idle already net in this branch (rough approximation)
  }

  return { gross, net, idle };
}

export function buildAllocations(params: {
  sessions: AllocSession[];
  invoices: AllocInvoice[];
  invoiceLinks: AllocInvoiceLink[];
  tariffs: AllocTariff[];
  users: AllocUser[];
  userGroups: AllocUserGroup[];
  rfidToUser: Map<string, string>;
}): BuildAllocationsResult {
  const { sessions, invoices, invoiceLinks, tariffs, users, userGroups, rfidToUser } = params;

  const sessionMap = new Map(sessions.map((s) => [s.id, s]));
  const tariffMap = new Map(tariffs.map((t) => [t.id, t]));
  const userMap = new Map(users.map((u) => [u.id, u]));
  const userGroupMap = new Map(userGroups.map((g) => [g.id, g]));
  const defaultTariff = tariffs.find((t) => t.is_default) ?? null;

  // Rechnung → verknüpfte Session-Ids
  const linksByInvoice = new Map<string, string[]>();
  for (const l of invoiceLinks) {
    const arr = linksByInvoice.get(l.invoice_id) ?? [];
    arr.push(l.session_id);
    linksByInvoice.set(l.invoice_id, arr);
  }

  const allocations = new Map<string, SessionAllocation>();
  const upsertInvoiceAlloc = (
    sessionId: string,
    inv: AllocInvoice,
    gross: number,
    net: number,
    idle: number,
    billedKwh: number,
  ) => {
    const prev = allocations.get(sessionId);
    if (!prev || prev.source !== "invoice") {
      allocations.set(sessionId, {
        source: "invoice",
        revenue_gross: gross,
        revenue_net: net,
        idle_fee: idle,
        billed_kwh: billedKwh,
        invoice_id: inv.id,
        invoice_status: inv.status,
        user_id: inv.user_id,
        billing_group_id: inv.billing_group_id,
      });
      return;
    }
    prev.revenue_gross += gross;
    prev.revenue_net += net;
    prev.idle_fee += idle;
    prev.billed_kwh += billedKwh;
    // primäre Rechnung: bezahlt gewinnt gegen offen, sonst höchster Betrag
    const promote =
      (prev.invoice_status !== "paid" && inv.status === "paid") ||
      (prev.invoice_status === inv.status && gross > 0 && (prev.revenue_gross - gross) < gross);
    if (promote) {
      prev.invoice_id = inv.id;
      prev.invoice_status = inv.status;
      prev.user_id = inv.user_id ?? prev.user_id;
      prev.billing_group_id = inv.billing_group_id ?? prev.billing_group_id;
    }
  };

  const invoicesWithoutLink: string[] = [];
  const invoiceEnergyMismatch: string[] = [];

  // 1) N:M-Links auswerten
  for (const inv of invoices) {
    const linkedSessionIds = linksByInvoice.get(inv.id) ?? [];
    let sessionIds = linkedSessionIds.filter((id) => sessionMap.has(id));

    // Fallback: legacy session_id
    if (sessionIds.length === 0 && inv.session_id && sessionMap.has(inv.session_id)) {
      sessionIds = [inv.session_id];
    }

    if (sessionIds.length === 0) {
      invoicesWithoutLink.push(inv.id);
      continue;
    }

    // Proportional nach session.energy_kwh, sonst gleichmäßig
    const kwhBySession = sessionIds.map((sid) => Number(sessionMap.get(sid)!.energy_kwh ?? 0));
    const kwhSum = kwhBySession.reduce((a, b) => a + b, 0);
    const invGross = Number(inv.total_amount ?? 0);
    const invNet = Number(inv.net_amount ?? 0);
    const invIdle = Number(inv.idle_fee_amount ?? 0);
    const invKwh = Number(inv.total_energy_kwh ?? 0);

    // Datenqualität: Rechnungs-kWh vs. Summe der Session-kWh
    if (kwhSum > 0 && invKwh > 0) {
      const diff = Math.abs(invKwh - kwhSum) / Math.max(invKwh, kwhSum);
      if (diff > 0.05) invoiceEnergyMismatch.push(inv.id);
    }

    sessionIds.forEach((sid, idx) => {
      const share =
        kwhSum > 0 ? kwhBySession[idx] / kwhSum : 1 / sessionIds.length;
      const gross = invGross * share;
      const net = invNet * share;
      const idle = invIdle * share;
      // billed_kwh: bevorzugt tatsächliche Session-kWh, sonst anteilige Rechnungs-kWh
      const billed = kwhSum > 0 ? kwhBySession[idx] : invKwh * share;
      upsertInvoiceAlloc(sid, inv, gross, net, idle, billed);
    });
  }

  // 2) Duplikat-Erkennung (aus linksByInvoice)
  const invoicesPerSession = new Map<string, Set<string>>();
  for (const [invoiceId, sids] of linksByInvoice.entries()) {
    for (const sid of sids) {
      const set = invoicesPerSession.get(sid) ?? new Set<string>();
      set.add(invoiceId);
      invoicesPerSession.set(sid, set);
    }
  }
  for (const inv of invoices) {
    if (inv.session_id && (linksByInvoice.get(inv.id) ?? []).length === 0) {
      const set = invoicesPerSession.get(inv.session_id) ?? new Set<string>();
      set.add(inv.id);
      invoicesPerSession.set(inv.session_id, set);
    }
  }
  const duplicateInvoiceSessions = Array.from(invoicesPerSession.entries())
    .filter(([, set]) => set.size > 1)
    .map(([sid]) => sid);

  // 3) Sessions ohne Rechnung → kalkulatorisch
  const sessionsWithoutTariff: string[] = [];
  for (const s of sessions) {
    if (allocations.has(s.id)) continue;
    const uid = resolveUserId(s, rfidToUser);
    const tariff = resolveTariff(uid, userMap, userGroupMap, tariffMap, defaultTariff);
    if (!tariff) {
      allocations.set(s.id, {
        source: "none",
        revenue_gross: 0,
        revenue_net: 0,
        idle_fee: 0,
        billed_kwh: Number(s.energy_kwh ?? 0),
        user_id: uid,
        no_tariff: true,
      });
      sessionsWithoutTariff.push(s.id);
      continue;
    }
    const c = computeCalculated(s, tariff);
    allocations.set(s.id, {
      source: "calculated",
      revenue_gross: c.gross,
      revenue_net: c.net,
      idle_fee: c.idle,
      billed_kwh: Number(s.energy_kwh ?? 0),
      user_id: uid,
      tariff_id: tariff.id,
    });
  }

  return {
    allocations,
    diagnostics: {
      duplicate_invoice_sessions: duplicateInvoiceSessions,
      invoices_without_link: invoicesWithoutLink,
      sessions_without_tariff: sessionsWithoutTariff,
      invoice_energy_mismatch: invoiceEnergyMismatch,
    },
  };
}

export function passesStatusFilter(
  alloc: SessionAllocation | undefined,
  filter: "all" | "paid" | "open" | "calculated",
): boolean {
  if (!alloc) return filter === "all" || filter === "open";
  if (filter === "all") return true;
  if (filter === "calculated") return alloc.source === "calculated";
  if (filter === "paid") return alloc.source === "invoice" && alloc.invoice_status === "paid";
  if (filter === "open") {
    if (alloc.source === "calculated" || alloc.source === "none") return true;
    return alloc.invoice_status !== "paid";
  }
  return true;
}
