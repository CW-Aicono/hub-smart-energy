// Nur lesend: Monatsübersicht nach Paketlogik je Endkunde und Partner.
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const r2 = (n: number) => Math.round(n * 100) / 100;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "Nicht angemeldet." }, 401);

    const body = await req.json().catch(() => ({}));
    const month = /^\d{4}-\d{2}$/.test(body.month ?? "") ? body.month : new Date().toISOString().slice(0, 7);
    const from = `${month}-01T00:00:00Z`;
    const d = new Date(from); d.setUTCMonth(d.getUTCMonth() + 1);
    const to = d.toISOString();

    const { data: canPortal } = await admin.rpc("can_portal_read", { _uid: user.id, _area: "commercial" });
    let partnerFilter: string | null = typeof body.partner_id === "string" ? body.partner_id : null;
    if (!canPortal) {
      const { data: pm } = await admin.from("partner_members").select("partner_id").eq("user_id", user.id).limit(1).maybeSingle();
      if (!pm?.partner_id) return json({ error: "Kein Zugriff." }, 403);
      partnerFilter = pm.partner_id;
    }

    let tq = admin.from("tenants").select("id,name,partner_id").is("deleted_at", null);
    if (partnerFilter) tq = tq.eq("partner_id", partnerFilter);
    const { data: tenants } = await tq;
    const ids = (tenants ?? []).map((t) => t.id);
    if (ids.length === 0) return json({ month, rows: [], partners: [] });

    const [pk, un, bk, loc, cp, inv, adhoc, cs, partners] = await Promise.all([
      admin.from("pricing_packages").select("code,name,uvp,ek,always_active"),
      admin.from("pricing_unit_prices").select("code,uvp,ek"),
      admin.from("tenant_package_bookings").select("tenant_id,package_code,booked_at,cancelled_at").in("tenant_id", ids).lt("booked_at", to),
      admin.from("locations").select("tenant_id,is_archived").in("tenant_id", ids),
      admin.from("charge_points").select("tenant_id").in("tenant_id", ids),
      admin.from("charging_invoices").select("tenant_id, charging_invoice_sessions(count)").in("tenant_id", ids).neq("status", "draft").gte("invoice_date", from.slice(0, 10)).lt("invoice_date", to.slice(0, 10)),
      admin.from("adhoc_payment_sessions").select("tenant_id").in("tenant_id", ids).in("state", ["captured", "partially_refunded"]).gte("started_at", from).lt("started_at", to),
      admin.from("charging_sessions").select("tenant_id").in("tenant_id", ids).gte("start_time", from).lt("start_time", to),
      admin.from("partners").select("id,name"),
    ]);
    const unit = (c: string) => (un.data ?? []).find((u) => u.code === c) ?? { uvp: 0, ek: 0 };
    const count = (rows: any[] | null, id: string) => (rows ?? []).filter((r) => r.tenant_id === id).length;

    const rows = (tenants ?? []).map((t) => {
      const booked = (bk.data ?? []).filter((b) => b.tenant_id === t.id && (!b.cancelled_at || b.cancelled_at >= from)).map((b) => b.package_code);
      const locations = (loc.data ?? []).filter((l) => l.tenant_id === t.id && !l.is_archived).length;
      const chargePoints = count(cp.data, t.id);
      const invoiced = (inv.data ?? []).filter((i: any) => i.tenant_id === t.id)
        .reduce((s: number, i: any) => s + Number(i.charging_invoice_sessions?.[0]?.count ?? 0), 0);
      const billedSessions = invoiced + count(adhoc.data, t.id);
      const internalSessions = Math.max(0, count(cs.data, t.id) - billedSessions);
      const legacy = booked.length === 0;
      let uvp = 0, ek = 0;
      if (!legacy) {
        for (const c of booked) { const p = (pk.data ?? []).find((x) => x.code === c); if (p && !p.always_active) { uvp += Number(p.uvp); ek += Number(p.ek); } }
        const extra = booked.includes("p6_enterprise") ? 0 : Math.max(0, locations - 1);
        uvp += extra * Number(unit("extra_location").uvp) + chargePoints * Number(unit("charge_point").uvp) + billedSessions * Number(unit("charging_session").uvp);
        ek += extra * Number(unit("extra_location").ek) + chargePoints * Number(unit("charge_point").ek) + billedSessions * Number(unit("charging_session").ek);
      }
      return { tenant_id: t.id, tenant_name: t.name, partner_id: t.partner_id, packages: booked, locations, chargePoints, billedSessions, internalSessions, legacy, uvp: r2(uvp), ek: r2(ek) };
    });

    const byPartner = new Map<string, { partner_id: string; partner_name: string; uvp: number; ek: number; tenants: number }>();
    for (const r of rows) {
      const k = r.partner_id ?? "direct";
      const name = r.partner_id ? (partners.data ?? []).find((p) => p.id === r.partner_id)?.name ?? "–" : "Direktkunden";
      const e = byPartner.get(k) ?? { partner_id: k, partner_name: name, uvp: 0, ek: 0, tenants: 0 };
      e.uvp = r2(e.uvp + r.uvp); e.ek = r2(e.ek + r.ek); e.tenants++;
      byPartner.set(k, e);
    }
    return json({ month, rows, partners: [...byPartner.values()] });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
