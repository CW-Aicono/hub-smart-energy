// Partner-Rabatte: Partner-Admin legt Rabatte für eigene Mandanten an / beendet / löscht sie.
// Server-seitige Schranken:
//  1. Aufrufer ist Partner-Admin
//  2. Mandant gehört zum Partner des Aufrufers
//  3. Modul (falls angegeben) ist im Partner-Portfolio (partner_modules)
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

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
    const action = body.action as "create" | "end" | "delete";
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    if (!["create", "end", "delete"].includes(action) || !UUID.test(tenantId)) {
      return json({ success: false, error: "Ungültige Eingabe." }, 400);
    }

    const { data: membership } = await supabase
      .from("partner_members").select("partner_id")
      .eq("user_id", user.id).eq("partner_role", "partner_admin").maybeSingle();
    if (!membership?.partner_id) return json({ success: false, error: "Nur Partner-Admins dürfen Rabatte vergeben." }, 403);

    const { data: tenant } = await supabase
      .from("tenants").select("id").eq("id", tenantId).eq("partner_id", membership.partner_id).maybeSingle();
    if (!tenant) return json({ success: false, error: "Dieser Mandant gehört nicht zu Ihrem Partner-Konto." }, 403);

    if (action === "create") {
      const moduleCode = body.moduleCode ? String(body.moduleCode) : null;
      const type = body.discountType;
      const value = Number(body.value);
      const validFrom = String(body.validFrom ?? "");
      const validUntil = body.validUntil ? String(body.validUntil) : null;
      if (
        (moduleCode !== null && !/^[a-z0-9_]{2,64}$/.test(moduleCode)) ||
        !["percent", "absolute"].includes(type) ||
        !(value > 0) || (type === "percent" && value > 100) ||
        !DATE.test(validFrom) || (validUntil && (!DATE.test(validUntil) || validUntil < validFrom))
      ) return json({ success: false, error: "Ungültige Rabattangaben." }, 400);

      if (moduleCode) {
        const { data: pm } = await supabase.from("partner_modules").select("id")
          .eq("partner_id", membership.partner_id).eq("module_code", moduleCode).maybeSingle();
        if (!pm) return json({ success: false, error: "Dieses Modul ist für Ihr Partner-Konto nicht freigeschaltet." }, 403);
      }
      const { error } = await supabase.from("tenant_module_discounts").insert({
        tenant_id: tenantId, module_code: moduleCode, discount_type: type, value,
        valid_from: validFrom, valid_until: validUntil,
        note: typeof body.note === "string" ? body.note.slice(0, 200) : null,
        created_by: user.id, updated_by: user.id,
      });
      if (error) throw error;
      return json({ success: true });
    }

    const discountId = typeof body.discountId === "string" ? body.discountId : "";
    if (!UUID.test(discountId)) return json({ success: false, error: "Ungültige Eingabe." }, 400);

    if (action === "end") {
      const today = new Date().toISOString().slice(0, 10);
      const { data: d } = await supabase.from("tenant_module_discounts").select("valid_from")
        .eq("id", discountId).eq("tenant_id", tenantId).maybeSingle();
      if (!d) return json({ success: false, error: "Rabatt nicht gefunden." }, 404);
      const end = d.valid_from > today ? d.valid_from : today;
      const { error } = await supabase.from("tenant_module_discounts")
        .update({ valid_until: end, updated_by: user.id, updated_at: new Date().toISOString() })
        .eq("id", discountId).eq("tenant_id", tenantId);
      if (error) throw error;
      return json({ success: true });
    }

    const { error } = await supabase.from("tenant_module_discounts").delete()
      .eq("id", discountId).eq("tenant_id", tenantId);
    if (error) throw error;
    return json({ success: true });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
