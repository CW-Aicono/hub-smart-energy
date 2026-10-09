// Automatische Rechnungsentwürfe (Einmal- und Dauerrechnungen).
// Jeder Vorgang hat einen eindeutigen source_ref – derselbe Vorgang wird nie
// zweimal berechnet (Unique-Index auf aktive source_refs). Entwürfe werden
// nie automatisch an die Buchhaltung übergeben.

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Anteil des Monatspreises ab Buchungstag (inkl.) bis Monatsende, tagesgenau. */
export function proRataAmount(monthly: number, date: Date): number {
  const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  const remaining = daysInMonth - date.getUTCDate() + 1;
  return r2((monthly * remaining) / daysInMonth);
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const monthEnd = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));

export interface DraftLine { type: string; label: string; amount: number; quantity?: number; unit_price?: number; code?: string }

export async function createOneTimeDraft(admin: any, p: {
  tenantId: string; partnerId: string | null; sourceRef: string;
  periodStart: string; periodEnd: string; lines: DraftLine[];
}): Promise<{ created: boolean; amount: number }> {
  const amount = r2(p.lines.reduce((s, l) => s + Number(l.amount || 0), 0));
  if (!(amount > 0)) return { created: false, amount };
  const { data: existing } = await admin.from("tenant_invoices").select("id")
    .eq("source_ref", p.sourceRef).neq("status", "voided").maybeSingle();
  if (existing) return { created: false, amount };
  const { error } = await admin.from("tenant_invoices").insert({
    tenant_id: p.tenantId, partner_id: p.partnerId, invoice_kind: "one_time", source_ref: p.sourceRef,
    invoice_number: "DRAFT", document_type: "invoice", status: "draft",
    period_start: p.periodStart, period_end: p.periodEnd,
    amount, module_total: amount, support_total: 0, line_items: p.lines,
  });
  // 23505 = paralleler Aufruf hat denselben Vorgang schon angelegt
  if (error && error.code !== "23505") throw error;
  return { created: !error, amount };
}
