// Portal-Admin (bzw. kaufmännische Portal-Rolle) setzt Module eines Kunden direkt –
// auch wenn der Kunde zu einem Partner gehört. Das Partner-Portfolio wird dabei
// idempotent ergänzt, damit die Freigabe gültig bleibt. Partner-Admins nutzen
// weiterhin partner-set-tenant-module.
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "Nicht angemeldet." }, 401);
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "Nicht angemeldet." }, 401);

    const { data: isSuper } = await admin.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
    let allowed = !!isSuper;
    if (!allowed) {
      const { data: canWrite } = await admin.rpc("can_portal_write", { _uid: user.id, _area: "commercial" });
      allowed = !!canWrite;
    }
    if (!allowed) return json({ error: "Nur Portal-Admins oder die kaufmännische Portal-Rolle dürfen Kunden-Module setzen." }, 403);

    const body = await req.json().catch(() => ({}));
    const tenantId = typeof body.tenant_id === "string" ? body.tenant_id : "";
    const moduleCode = typeof body.module_code === "string" ? body.module_code.trim() : "";
    const enabled = body.enabled === true;
    if (!/^[0-9a-f-]{36}$/i.test(tenantId) || !/^[a-z0-9_]{2,60}$/.test(moduleCode)) {
      return json({ error: "Ungültige Eingabe." }, 400);
    }

    const { data: tenant, error: tErr } = await admin.from("tenants").select("id, partner_id").eq("id", tenantId).maybeSingle();
    if (tErr) return json({ error: tErr.message }, 400);
    if (!tenant) return json({ error: "Kunde nicht gefunden." }, 404);

    if (enabled && (tenant as any).partner_id) {
      const { error: pErr } = await admin.from("partner_modules").upsert(
        { partner_id: (tenant as any).partner_id, module_code: moduleCode, created_by: user.id },
        { onConflict: "partner_id,module_code", ignoreDuplicates: true },
      );
      if (pErr) return json({ error: "Partner-Portfolio: " + pErr.message }, 400);
    }

    const { error } = await admin.from("tenant_modules").upsert(
      { tenant_id: tenantId, module_code: moduleCode, is_enabled: enabled },
      { onConflict: "tenant_id,module_code" },
    );
    if (error) return json({ error: error.message }, 400);

    await admin.from("audit_logs").insert({
      action: enabled ? "tenant_module.enable" : "tenant_module.disable",
      entity_type: "tenant_module",
      entity_label: moduleCode,
      tenant_id: tenantId,
      actor_user_id: user.id,
      actor_email: user.email,
    });
    return json({ success: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
