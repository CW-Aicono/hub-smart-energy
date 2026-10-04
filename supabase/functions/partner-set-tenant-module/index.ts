// Modul-Kaskade: Partner-Admin schaltet ein Modul für einen eigenen Mandanten
// ein/aus. Server-seitige Schranken:
//  1. Aufrufer ist Partner-Admin
//  2. Mandant gehört zum Partner des Aufrufers
//  3. Modul ist im Partner-Portfolio (partner_modules)
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ success: false, error: "Nicht angemeldet." }, 401);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return json({ success: false, error: "Nicht angemeldet." }, 401);

    const body = await req.json().catch(() => ({}));
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    const moduleCode = typeof body.moduleCode === "string" ? body.moduleCode.trim() : "";
    const enabled = body.enabled === true;
    if (!/^[0-9a-f-]{36}$/i.test(tenantId) || !/^[a-z0-9_]{2,64}$/.test(moduleCode)) {
      return json({ success: false, error: "Ungültige Eingabe." }, 400);
    }

    const { data: membership } = await supabase
      .from("partner_members").select("partner_id")
      .eq("user_id", user.id).eq("partner_role", "partner_admin").maybeSingle();
    if (!membership?.partner_id) {
      return json({ success: false, error: "Nur Partner-Admins dürfen Module freigeben." }, 403);
    }

    const { data: tenant } = await supabase
      .from("tenants").select("id").eq("id", tenantId).eq("partner_id", membership.partner_id).maybeSingle();
    if (!tenant) return json({ success: false, error: "Dieser Mandant gehört nicht zu Ihrem Partner-Konto." }, 403);

    if (enabled) {
      const { data: pm } = await supabase
        .from("partner_modules").select("id")
        .eq("partner_id", membership.partner_id).eq("module_code", moduleCode).maybeSingle();
      if (!pm) {
        return json({ success: false, error: "Dieses Modul ist für Ihr Partner-Konto nicht freigeschaltet." }, 403);
      }
    }

    const now = new Date().toISOString();
    const { error } = await supabase.from("tenant_modules").upsert(
      {
        tenant_id: tenantId,
        module_code: moduleCode,
        is_enabled: enabled,
        ...(enabled ? { enabled_at: now, disabled_at: null } : { disabled_at: now }),
      },
      { onConflict: "tenant_id,module_code" },
    );
    if (error) throw error;
    return json({ success: true });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
