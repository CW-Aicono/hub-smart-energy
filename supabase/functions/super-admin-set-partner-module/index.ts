// Super-Admin pflegt das Modul-Portfolio eines Partners (partner_modules).
// Prüft die Super-Admin-Rolle serverseitig und schreibt mit Service-Rolle.
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "Nicht angemeldet." }, 401);
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "Nicht angemeldet." }, 401);

    const { data: isSuper } = await admin.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
    if (!isSuper) return json({ error: "Nur Portal-Admins dürfen Partner-Module ändern." }, 403);

    const body = await req.json().catch(() => ({}));
    const partnerId = typeof body.partner_id === "string" ? body.partner_id : "";
    const moduleCode = typeof body.module_code === "string" ? body.module_code.trim() : "";
    const enabled = body.enabled === true;
    if (!/^[0-9a-f-]{36}$/i.test(partnerId) || !/^[a-z0-9_]{2,60}$/.test(moduleCode)) {
      return json({ error: "Ungültige Eingabe." }, 400);
    }

    const { error } = enabled
      ? await admin.from("partner_modules").upsert(
          { partner_id: partnerId, module_code: moduleCode, created_by: user.id },
          { onConflict: "partner_id,module_code", ignoreDuplicates: true },
        )
      : await admin.from("partner_modules").delete().eq("partner_id", partnerId).eq("module_code", moduleCode);
    if (error) return json({ error: error.message }, 400);

    await admin.from("audit_logs").insert({
      action: enabled ? "partner_module.enable" : "partner_module.disable",
      entity_type: "partner_module",
      entity_label: moduleCode,
      partner_id: partnerId,
      actor_user_id: user.id,
      actor_email: user.email,
    });
    return json({ success: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
