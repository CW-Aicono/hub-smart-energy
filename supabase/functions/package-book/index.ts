// Paket buchen/kündigen = Modul-Codes über die bestehenden, serverseitig
// geprüften Freigabe-Funktionen schalten (portal-set-tenant-module bzw.
// partner-set-tenant-module). Ändert keine EMS-Funktion.
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { createOneTimeDraft, isoDate, monthEnd, proRataAmount } from "../_shared/invoiceDrafts.ts";

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "Nicht angemeldet." }, 401);
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "Nicht angemeldet." }, 401);

    const body = await req.json().catch(() => ({}));
    const tenantId = String(body.tenant_id ?? "");
    const pkg = String(body.package_code ?? "");
    const book = body.book === true;
    if (!/^[0-9a-f-]{36}$/i.test(tenantId) || !/^[a-z0-9_]{2,64}$/.test(pkg)) return json({ error: "Ungültige Eingabe." }, 400);

    const { data: isSuper } = await admin.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
    const { data: canComm } = await admin.rpc("can_portal_write", { _uid: user.id, _area: "commercial" });
    const viaPortal = !!isSuper || !!canComm;

    const { data: defs } = await admin.from("pricing_packages").select("code,name,requires_package,requires_any_other,always_active,active");
    const def = (defs ?? []).find((d) => d.code === pkg);
    if (!def || !def.active || def.always_active) return json({ error: "Paket nicht buchbar." }, 400);

    const { data: activeRows } = await admin.from("tenant_package_bookings").select("package_code").eq("tenant_id", tenantId).is("cancelled_at", null);
    const active = new Set((activeRows ?? []).map((r) => r.package_code));
    const next = new Set(active);
    if (book) next.add(pkg); else next.delete(pkg);

    // Abhängigkeiten prüfen
    for (const c of next) {
      const d = (defs ?? []).find((x) => x.code === c);
      if (!d) continue;
      if (d.requires_package && !next.has(d.requires_package))
        return json({ error: book ? `„${d.name}“ benötigt zuerst ein anderes Paket.` : `Paket wird noch von „${d.name}“ benötigt.` }, 400);
      if (d.requires_any_other && [...next].filter((x) => x !== c).length === 0)
        return json({ error: `„${d.name}“ ist nur zusammen mit mindestens einem anderen Paket buchbar.` }, 400);
    }

    const { data: mods } = await admin.from("pricing_package_modules").select("package_code,module_code");
    const modsOf = (c: string) => (mods ?? []).filter((m) => m.package_code === c).map((m) => m.module_code);
    const basis = new Set((defs ?? []).filter((d) => d.always_active).flatMap((d) => modsOf(d.code)));
    let targets: string[];
    if (book) targets = [...new Set([...modsOf(pkg), ...basis])];
    else {
      const stillCovered = new Set([...basis, ...[...next].flatMap(modsOf)]);
      targets = modsOf(pkg).filter((m) => !stillCovered.has(m));
    }

    const fn = viaPortal ? "portal-set-tenant-module" : "partner-set-tenant-module";
    for (const m of targets) {
      const payload = viaPortal ? { tenant_id: tenantId, module_code: m, enabled: book } : { tenantId, moduleCode: m, enabled: book };
      const r = await fetch(`${url}/functions/v1/${fn}`, {
        method: "POST",
        headers: { Authorization: authHeader, apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "", "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false || j?.error) return json({ error: j?.error ?? `Modul ${m} konnte nicht geschaltet werden.` }, r.status >= 400 ? r.status : 400);
    }

    let invoice: { created: boolean; amount: number } | null = null;
    if (book && !active.has(pkg)) {
      const { data: booking } = await admin.from("tenant_package_bookings")
        .insert({ tenant_id: tenantId, package_code: pkg, booked_by: user.id }).select("id, booked_at").single();
      // Anteiliger erster Monat als Einmal-Entwurf (Kunde zur UVP, Partnerkunde an Partner zum EK)
      try {
        const { data: t } = await admin.from("tenants").select("partner_id, name").eq("id", tenantId).maybeSingle();
        const { data: full } = await admin.from("pricing_packages").select("uvp, ek").eq("code", pkg).maybeSingle();
        const partnerId = t?.partner_id ?? null;
        const monthly = Number((partnerId ? full?.ek : full?.uvp) ?? 0);
        const when = booking?.booked_at ? new Date(booking.booked_at) : new Date();
        const amount = proRataAmount(monthly, when);
        // Im selben Monat gekündigt und neu gebucht: Monat ist bereits voll berechnet
        const mStart = new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), 1)).toISOString();
        const { data: recent } = await admin.from("tenant_package_bookings").select("id")
          .eq("tenant_id", tenantId).eq("package_code", pkg).gte("cancelled_at", mStart).lt("booked_at", mStart).limit(1);
        if (booking?.id && amount > 0 && !(recent ?? []).length) {
          invoice = await createOneTimeDraft(admin, {
            tenantId, partnerId, sourceRef: `prorata:${booking.id}`,
            periodStart: isoDate(when), periodEnd: isoDate(monthEnd(when)),
            lines: [{ type: "one_time", code: pkg, label: `${def.name} anteilig ${isoDate(when)} – ${isoDate(monthEnd(when))}${t?.name ? ` (${t.name})` : ""}`, amount }],
          });
        }
      } catch (e) {
        console.error("[package-book] Anteilsrechnung fehlgeschlagen", e);
      }
    } else if (!book) {
      // Kündigung wirkt zum Monatsende: der laufende Monat wird noch voll berechnet, keine Erstattung.
      await admin.from("tenant_package_bookings").update({ cancelled_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("package_code", pkg).is("cancelled_at", null);
    }
    return json({ success: true, modules: targets, invoice });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
