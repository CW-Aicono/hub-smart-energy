// Entfernt eine Person aus einem Mandanten, OHNE das Konto zu löschen.
// Super-Admin- und Partner-Rollen bleiben erhalten (Mehrrollen-Modell).
// Erlaubt: Admin desselben Mandanten, Partner-Admin des Mandanten-Partners, Super-Admin.
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

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

    const body = await req.json().catch(() => ({}));
    const userId = typeof body.userId === "string" ? body.userId : "";
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    const uuid = /^[0-9a-f-]{36}$/i;
    if (!uuid.test(userId) || !uuid.test(tenantId)) return json({ success: false, error: "Ungültige Eingabe." }, 400);
    if (userId === user.id) return json({ success: false, error: "Sie können sich nicht selbst aus dem Mandanten entfernen." }, 400);

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const r = (roles ?? []).map((x: { role: string }) => x.role);
    let allowed = r.includes("super_admin");
    if (!allowed && r.includes("admin")) {
      const { data: p } = await admin.from("profiles").select("tenant_id").eq("user_id", user.id).maybeSingle();
      allowed = p?.tenant_id === tenantId;
    }
    if (!allowed) {
      const { data: t } = await admin.from("tenants").select("partner_id").eq("id", tenantId).maybeSingle();
      if (t?.partner_id) {
        const { data: m } = await admin.from("partner_members").select("id")
          .eq("user_id", user.id).eq("partner_id", t.partner_id).eq("partner_role", "partner_admin").maybeSingle();
        allowed = !!m;
      }
    }
    if (!allowed) return json({ success: false, error: "Keine Berechtigung für diesen Mandanten." }, 403);

    const { data: target } = await admin.from("profiles").select("tenant_id, email").eq("user_id", userId).maybeSingle();
    if (!target || target.tenant_id !== tenantId) {
      return json({ success: false, error: "Diese Person gehört nicht zu diesem Mandanten." }, 400);
    }

    // Letzten Admin schützen
    const { data: targetRoles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    if ((targetRoles ?? []).some((x: { role: string }) => x.role === "admin")) {
      const { data: members } = await admin.from("profiles").select("user_id").eq("tenant_id", tenantId);
      const ids = (members ?? []).map((m: { user_id: string }) => m.user_id).filter((id: string) => id !== userId);
      const { count } = ids.length
        ? await admin.from("user_roles").select("user_id", { count: "exact", head: true }).in("user_id", ids).eq("role", "admin")
        : { count: 0 };
      if (!count) return json({ success: false, error: "Der letzte Administrator eines Mandanten kann nicht entfernt werden." }, 400);
    }

    const { error: pErr } = await admin.from("profiles").update({ tenant_id: null }).eq("user_id", userId);
    if (pErr) return json({ success: false, error: pErr.message }, 400);
    await admin.from("user_roles").delete().eq("user_id", userId).in("role", ["admin"]);

    await admin.from("audit_logs").insert({
      action: "tenant_member.remove",
      entity_type: "profile",
      entity_label: target.email,
      tenant_id: tenantId,
      actor_user_id: user.id,
      actor_email: user.email,
    });
    return json({ success: true });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
