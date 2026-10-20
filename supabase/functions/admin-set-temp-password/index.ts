// admin-set-temp-password
// Ein berechtigter Admin vergibt ein Startpasswort. Der Nutzer muss es bei der
// ersten Anmeldung ändern (user_metadata.must_change_password = true).
// Berechtigung wird hier serverseitig geprüft – UI-Checks sind nur Navigation.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import { getCorsHeaders } from "../_shared/cors.ts";

const BodySchema = z.object({
  userId: z.string().uuid().optional(),
  email: z.string().email().max(254).optional(),
  password: z.string().min(8).max(128),
}).refine((b) => !!b.userId || !!b.email, { message: "userId oder email erforderlich" });

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const authH = req.headers.get("Authorization");
    if (!authH) return json({ success: false, error: "Nicht angemeldet." }, 401);
    const { data: { user: caller } } = await supabase.auth.getUser(authH.replace("Bearer ", ""));
    if (!caller) return json({ success: false, error: "Nicht angemeldet." }, 401);

    let raw: unknown;
    try { raw = await req.json(); } catch { return json({ success: false, error: "Ungültige Anfrage." }, 400); }
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) return json({ success: false, error: "Ungültige Eingabe (Passwort mind. 8 Zeichen)." }, 400);
    const { password } = parsed.data;

    if (!/[A-Za-zÄÖÜäöüß]/.test(password) || !/\d/.test(password)) {
      return json({ success: false, error: "Das Passwort muss mindestens einen Buchstaben und eine Ziffer enthalten." }, 400);
    }

    // Zielperson ermitteln
    let targetQuery = supabase.from("profiles").select("user_id, email, tenant_id");
    targetQuery = parsed.data.userId ? targetQuery.eq("user_id", parsed.data.userId) : targetQuery.ilike("email", parsed.data.email!.trim());
    const { data: target } = await targetQuery.maybeSingle();
    if (!target?.user_id) return json({ success: false, error: "Benutzer nicht gefunden." }, 404);
    if (target.user_id === caller.id) return json({ success: false, error: "Für das eigene Konto bitte „Profil & Passwort“ nutzen." }, 403);

    const rolesOf = async (uid: string) => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      return (data ?? []).map((r: { role: string }) => r.role);
    };
    const callerRoles = await rolesOf(caller.id);
    const targetRoles = await rolesOf(target.user_id);
    const callerIsPortalAdmin = callerRoles.includes("super_admin");

    // Portal-Admins dürfen nur von Portal-Admins ein Passwort bekommen
    if (targetRoles.includes("super_admin") && !callerIsPortalAdmin) {
      return json({ success: false, error: "Nur Portal-Admins dürfen das für Portal-Admins tun." }, 403);
    }

    let allowed = callerIsPortalAdmin;
    let auditTenantId: string | null = target.tenant_id ?? null;
    let auditPartnerId: string | null = null;

    // Kunden-Admin: nur Nutzer des eigenen Kunden
    if (!allowed && callerRoles.includes("admin")) {
      const { data: cp } = await supabase.from("profiles").select("tenant_id").eq("user_id", caller.id).maybeSingle();
      const callerTenant = cp?.tenant_id as string | null;
      if (callerTenant) {
        if (target.tenant_id === callerTenant) allowed = true;
        else {
          const { data: m } = await supabase.rpc("is_tenant_member", { _user_id: target.user_id, _tenant_id: callerTenant });
          allowed = m === true;
        }
        if (allowed) auditTenantId = callerTenant;
      }
    }

    // Partner-Admin (bzw. Partner-User mit Mitgliederverwaltung): eigene Partner-Mitglieder
    if (!allowed) {
      const { data: memberships } = await supabase.from("partner_members")
        .select("partner_id, partner_role, can_manage_members").eq("user_id", caller.id);
      const managed = (memberships ?? [])
        .filter((m: any) => m.partner_role === "partner_admin" || m.can_manage_members)
        .map((m: any) => m.partner_id as string);
      if (managed.length) {
        const { data: tm } = await supabase.from("partner_members")
          .select("partner_id").eq("user_id", target.user_id).in("partner_id", managed).limit(1);
        if (tm && tm.length) { allowed = true; auditPartnerId = tm[0].partner_id; }
      }
      // Partner-Admin: Nutzer der eigenen Kunden
      const isPartnerAdmin = (memberships ?? []).some((m: any) => m.partner_role === "partner_admin");
      if (!allowed && isPartnerAdmin && target.tenant_id) {
        const { data: ok } = await supabase.rpc("partner_has_tenant_access", { _user_id: caller.id, _tenant_id: target.tenant_id });
        allowed = ok === true;
      }
    }

    if (!allowed) return json({ success: false, error: "Keine Berechtigung für diesen Benutzer." }, 403);

    const { data: authUser } = await supabase.auth.admin.getUserById(target.user_id);
    const meta = (authUser?.user?.user_metadata ?? {}) as Record<string, unknown>;
    const { error: updErr } = await supabase.auth.admin.updateUserById(target.user_id, {
      password,
      email_confirm: true,
      user_metadata: { ...meta, must_change_password: true },
    });
    if (updErr) {
      const m = updErr.message ?? "";
      const weak = /pwned|leak|weak|known/i.test(m) || (updErr as any).code === "weak_password";
      return json({
        success: false,
        error: weak ? "Dieses Passwort ist aus bekannten Datenlecks bekannt oder zu schwach. Bitte ein anderes wählen." : `Passwort konnte nicht gesetzt werden: ${m}`,
      }, 400);
    }

    const email = (target.email ?? authUser?.user?.email ?? "").toLowerCase();
    if (email) {
      // Offene Einladungslinks sperren, Einladungen als angenommen markieren
      await supabase.from("invite_tokens").update({ used_at: new Date().toISOString() }).ilike("email", email).is("used_at", null);
      await supabase.from("user_invitations").update({ accepted_at: new Date().toISOString() }).ilike("email", email).is("accepted_at", null);
    }

    // Protokoll (ohne Passwort)
    await supabase.from("audit_logs").insert({
      actor_user_id: caller.id,
      actor_email: caller.email ?? null,
      actor_role: callerIsPortalAdmin ? "super_admin" : callerRoles[0] ?? null,
      tenant_id: auditTenantId,
      partner_id: auditPartnerId,
      action: "set_temp_password",
      entity_type: "user",
      entity_id: target.user_id,
      entity_label: email || null,
      metadata: { must_change_password: true },
    }).then(({ error }: { error: unknown }) => { if (error) console.warn("[admin-set-temp-password] audit insert failed", error); });

    return json({ success: true });
  } catch (e) {
    console.error("[admin-set-temp-password]", e);
    return json({ success: false, error: e instanceof Error ? e.message : "Unbekannter Fehler" }, 500);
  }
});
