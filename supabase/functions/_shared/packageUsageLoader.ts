// Lädt die Zähldaten (nur lesend) für computeTenantMonth.
import { computeTenantMonth, monthBounds, type PkgDef, type Span, type UsageResult } from "./packageUsage.ts";

const day = (ts: string | null) => (ts ? new Date(ts).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }) : null);
const prevDay = (d: string) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };
export const prevMonth = (m: string) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 2, 1)); return d.toISOString().slice(0, 7); };

export async function loadUsage(admin: any, tenants: { id: string; partner_id: string | null; created_at?: string | null }[], month: string) {
  const ids = tenants.map((t) => t.id);
  const b = monthBounds(month);
  const from = new Date(`${b.start}T00:00:00Z`).toISOString();
  const toD = new Date(`${b.end}T00:00:00Z`); toD.setUTCDate(toD.getUTCDate() + 1);
  const to = toD.toISOString();
  const q = async (p: any) => { const { data, error } = await p; if (error) throw error; return data ?? []; };
  const [defs, mods, units, sales, bookings, snaps, locs, cps, inv, adhoc, support, discounts] = await Promise.all([
    q(admin.from("pricing_packages").select("code,name,uvp,ek,always_active")),
    q(admin.from("pricing_package_modules").select("package_code,module_code")),
    q(admin.from("pricing_unit_prices").select("code,uvp,ek,new_sale_uvp")),
    q(admin.from("license_sales").select("tenant_id,product_kind,product_code,starts_on,ended_on").in("tenant_id", ids)),
    q(admin.from("tenant_package_bookings").select("tenant_id,package_code,booked_at,cancelled_at").in("tenant_id", ids).lt("booked_at", to)),
    q(admin.from("tenant_usage_daily").select("tenant_id,day,locations,active_charge_point_ids").in("tenant_id", ids).gte("day", b.start).lte("day", b.end)),
    q(admin.from("locations").select("tenant_id,is_archived").in("tenant_id", ids)),
    q(admin.from("charge_points").select("id,tenant_id").in("tenant_id", ids).gte("last_heartbeat", from)),
    q(admin.from("charging_invoices").select("tenant_id, charging_invoice_sessions(count)").in("tenant_id", ids).neq("status", "draft").gte("invoice_date", b.start).lte("invoice_date", b.end)),
    q(admin.from("adhoc_payment_sessions").select("tenant_id").in("tenant_id", ids).in("state", ["captured", "partially_refunded"]).gte("started_at", from).lt("started_at", to)),
    q(admin.from("support_sessions").select("id,tenant_id,started_at,ended_at,duration_minutes,reason").in("tenant_id", ids).gte("started_at", from).lt("started_at", to)),
    q(admin.from("partner_discount_requests").select("tenant_id,partner_id,approved_module_codes,discount_type,value,valid_from,duration_months,reason").eq("status", "approved").lte("valid_from", b.end)),
  ]);
  const pkgDefs: PkgDef[] = defs.map((d: any) => ({ code: d.code, name: d.name, uvp: Number(d.uvp), ek: Number(d.ek), always_active: !!d.always_active, modules: mods.filter((m: any) => m.package_code === d.code).map((m: any) => m.module_code) }));
  const unitMap: Record<string, { uvp: number; ek: number }> = Object.fromEntries(units.map((u: any) => [u.code, { uvp: Number(u.new_sale_uvp ?? u.uvp), ek: Number(u.ek) }]));
  const results: Record<string, UsageResult> = {};
  for (const t of tenants) {
    const ts = sales.filter((s: any) => s.tenant_id === t.id);
    const spans: Span[] = [
      ...ts.filter((s: any) => s.product_kind === "package").map((s: any) => ({ code: s.product_code, start: s.starts_on, end: s.ended_on, viaContract: true })),
      // Paketbuchungen: Buchungsmonat ist über den Anteilsentwurf abgedeckt
      ...bookings.filter((x: any) => x.tenant_id === t.id).map((x: any) => { const st = day(x.booked_at)!; return { code: x.package_code, start: st, end: x.cancelled_at ? prevDay(day(x.cancelled_at)!) : null, viaContract: st >= b.start }; }),
    ];
    const tSnaps = snaps.filter((s: any) => s.tenant_id === t.id);
    const cpIds = new Set<string>(tSnaps.flatMap((s: any) => s.active_charge_point_ids ?? []));
    // Ohne Snapshots (laufender Monat vor dem ersten Lauf): Heartbeat seit Monatsbeginn
    if (!tSnaps.length) for (const c of cps) if (c.tenant_id === t.id) cpIds.add(c.id);
    const locations = tSnaps.length ? Math.max(...tSnaps.map((s: any) => s.locations)) : locs.filter((l: any) => l.tenant_id === t.id && !l.is_archived).length;
    const billed = inv.filter((i: any) => i.tenant_id === t.id).reduce((s: number, i: any) => s + Number(i.charging_invoice_sessions?.[0]?.count ?? 0), 0) + adhoc.filter((a: any) => a.tenant_id === t.id).length;
    const disc = discounts.filter((d: any) => d.partner_id === t.partner_id && (!d.tenant_id || d.tenant_id === t.id)).filter((d: any) => {
      if (!d.duration_months) return true;
      const [y, m] = d.valid_from.split("-").map(Number); const until = new Date(Date.UTC(y, m - 1 + d.duration_months, 0)).toISOString().slice(0, 10);
      return until >= b.start;
    }).map((d: any) => ({ type: d.discount_type === "percent" ? "percent" as const : "fixed" as const, value: Number(d.value), modules: d.approved_module_codes, label: d.reason ? `Partnerrabatt: ${d.reason}` : undefined }));
    results[t.id] = computeTenantMonth({
      month, partner: !!t.partner_id, tenantCreatedAt: day(t.created_at ?? null),
      packages: spans, defs: pkgDefs, units: unitMap, locations, chargePoints: cpIds.size, billedSessions: billed,
      remoteSupport: ts.filter((s: any) => s.product_kind === "unit" && s.product_code === "remote_support").map((s: any) => ({ code: "remote_support", start: s.starts_on, end: s.ended_on, viaContract: true })),
      supportSessions: support.filter((s: any) => s.tenant_id === t.id),
      setupViaContract: ts.some((s: any) => s.product_kind === "unit" && s.product_code === "setup"),
      discounts: disc,
    });
  }
  return { results, units: unitMap };
}
