// AICONO Portal entscheidet über Rabatt-Anfragen von Partnern.
// Nur Portal-Admins bzw. die kaufmännische Portal-Rolle. Bei Freigabe werden für die
// freigegebenen Module Kundenrabatte (tenant_module_discounts) angelegt – für den
// angefragten Kunden oder, ohne Kunde, für alle aktuellen Kunden des Partners.
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const UUID = /^[0-9a-f-]{36}$/i;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ success: false, error: "Nicht angemeldet." }, 401);
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ success: false, error: "Nicht angemeldet." }, 401);

    const { data: canWrite } = await admin.rpc("can_portal_write", { _uid: user.id, _area: "commercial" });
    if (!canWrite) return json({ success: false, error: "Nur Portal-Admins oder die kaufmännische Rolle dürfen Rabatte freigeben." }, 403);

    const body = await req.json().catch(() => ({}));
    const id = typeof body.requestId === "string" ? body.requestId : "";
    const decision = body.decision;
    const note = typeof body.note === "string" ? body.note.slice(0, 500) : null;
    if (!UUID.test(id) || !["approve", "reject"].includes(decision)) return json({ success: false, error: "Ungültige Eingabe." }, 400);

    const { data: r, error: rErr } = await admin.from("partner_discount_requests").select("*").eq("id", id).maybeSingle();
    if (rErr) throw rErr;
    if (!r) return json({ success: false, error: "Anfrage nicht gefunden." }, 404);
    if (r.status !== "pending") return json({ success: false, error: "Diese Anfrage wurde bereits entschieden." }, 409);

    if (decision === "reject") {
      const { error } = await admin.from("partner_discount_requests")
        .update({ status: "rejected", decided_by: user.id, decided_at: new Date().toISOString(), decision_note: note })
        .eq("id", id).eq("status", "pending");
      if (error) throw error;
      return json({ success: true });
    }

    const requested: string[] = r.module_codes ?? [];
    const approved: string[] = Array.isArray(body.moduleCodes)
      ? body.moduleCodes.filter((c: unknown) => typeof c === "string" && requested.includes(c as string))
      : requested;
    if (!approved.length) return json({ success: false, error: "Bitte mindestens ein Modul freigeben." }, 400);

    let tenantIds: string[] = [];
    if (r.tenant_id) tenantIds = [r.tenant_id];
    else {
      const { data: ts, error } = await admin.from("tenants").select("id").eq("partner_id", r.partner_id);
      if (error) throw error;
      tenantIds = (ts ?? []).map((t: { id: string }) => t.id);
    }

    let validUntil: string | null = null;
    if (r.duration_months) {
      const d = new Date(r.valid_from + "T00:00:00Z");
      d.setUTCMonth(d.getUTCMonth() + r.duration_months);
      d.setUTCDate(d.getUTCDate() - 1);
      validUntil = d.toISOString().slice(0, 10);
    }

    const rows = tenantIds.flatMap((tid) => approved.map((code) => ({
      tenant_id: tid, module_code: code, discount_type: r.discount_type, value: r.value,
      valid_from: r.valid_from, valid_until: validUntil,
      duration_value: r.duration_months, duration_unit: r.duration_months ? "month" : null,
      payment_mode: "monthly", note: `Partner-Rabattanfrage freigegeben${note ? ": " + note : ""}`.slice(0, 200),
      created_by: user.id, updated_by: user.id,
    })));
    if (rows.length) {
      const { error } = await admin.from("tenant_module_discounts").insert(rows);
      if (error) throw error;
    }

    const { error } = await admin.from("partner_discount_requests")
      .update({ status: "approved", approved_module_codes: approved, decided_by: user.id, decided_at: new Date().toISOString(), decision_note: note })
      .eq("id", id);
    if (error) throw error;
    return json({ success: true, created: rows.length });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
