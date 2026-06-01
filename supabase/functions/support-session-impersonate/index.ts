// Edge Function: support-session-impersonate
// Tauscht die Session des Super-Admins gegen die Session eines technischen
// Support-Users des Ziel-Tenants. Erzeugt den Support-User lazy, wenn noch
// nicht vorhanden.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// 15 Minuten Sitzungsdauer
const SESSION_TTL_MS = 15 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomPassword() {
  const arr = new Uint8Array(48);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    // 1) Super-Admin verifizieren
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } =
      await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return json({ error: "Unauthorized" }, 401);
    }
    const callerId = claimsData.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: isSuper } = await admin.rpc("has_role", {
      _user_id: callerId,
      _role: "super_admin",
    });

    // 2) Input (early, needed for partner-scope check)
    const body = await req.json().catch(() => ({}));
    const targetTenantId = String(body.target_tenant_id || "");
    const reason = body.reason ? String(body.reason) : "Remote-Support Sitzung";
    if (!targetTenantId) return json({ error: "target_tenant_id required" }, 400);

    if (!isSuper) {
      // Partner-Admin darf nur eigene Tenants impersonieren
      const { data: isPartnerAdmin } = await admin.rpc("is_partner_admin", {
        _user_id: callerId,
      });
      const { data: partnerOk } = await admin.rpc("partner_has_tenant_access", {
        _user_id: callerId,
        _tenant_id: targetTenantId,
      });
      if (!isPartnerAdmin || !partnerOk) return json({ error: "Forbidden" }, 403);
    }


    // Tenant existiert?
    const { data: tenant, error: tenantErr } = await admin
      .from("tenants")
      .select("id, name")
      .eq("id", targetTenantId)
      .maybeSingle();
    if (tenantErr || !tenant) return json({ error: "Tenant not found" }, 404);

    // 3) Support-User lazy anlegen (oder vorhandenen verwenden)
    let supportUserId: string | null = null;
    let supportEmail: string | null = null;

    const { data: existing } = await admin
      .from("tenant_support_users")
      .select("auth_user_id, support_email")
      .eq("tenant_id", targetTenantId)
      .maybeSingle();

    if (existing) {
      supportUserId = existing.auth_user_id;
      supportEmail = existing.support_email;
    } else {
      const shortId = targetTenantId.replace(/-/g, "").slice(0, 12);
      supportEmail = `support+${shortId}@aicono.internal`;

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: supportEmail,
        password: randomPassword(),
        email_confirm: true,
        user_metadata: { is_support_user: true, tenant_id: targetTenantId },
      });
      if (createErr || !created.user) {
        return json({ error: `createUser failed: ${createErr?.message}` }, 500);
      }
      supportUserId = created.user.id;

      // Profil-Tenant setzen (handle_new_user-Trigger hat Profil schon angelegt)
      await admin
        .from("profiles")
        .update({ tenant_id: targetTenantId })
        .eq("user_id", supportUserId);

      // Rolle admin (handle_new_user_role-Trigger hat 'user' angelegt)
      await admin
        .from("user_roles")
        .update({ role: "admin" })
        .eq("user_id", supportUserId);

      // Mapping speichern
      const { error: mapErr } = await admin
        .from("tenant_support_users")
        .insert({
          tenant_id: targetTenantId,
          auth_user_id: supportUserId,
          support_email: supportEmail,
        });
      if (mapErr) return json({ error: `mapping failed: ${mapErr.message}` }, 500);
    }

    // 4) support_sessions Eintrag
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    const { data: session, error: sessErr } = await admin
      .from("support_sessions")
      .insert({
        super_admin_user_id: callerId,
        tenant_id: targetTenantId,
        impersonated_user_id: supportUserId,
        started_at: new Date().toISOString(),
        expires_at: expiresAt,
        reason,
      })
      .select("id")
      .single();
    if (sessErr || !session) {
      return json({ error: `session insert failed: ${sessErr?.message}` }, 500);
    }

    // 5) Magic-Link generieren und serverseitig gegen Tokens tauschen
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: supportEmail!,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      return json({ error: `generateLink failed: ${linkErr?.message}` }, 500);
    }
    const hashedToken = linkData.properties.hashed_token;

    const verifyClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: verified, error: verifyErr } = await verifyClient.auth.verifyOtp({
      type: "magiclink",
      token_hash: hashedToken,
    });
    if (verifyErr || !verified?.session) {
      return json({ error: `verifyOtp failed: ${verifyErr?.message}` }, 500);
    }

    return json({
      session_id: session.id,
      tenant_id: targetTenantId,
      tenant_name: tenant.name,
      expires_at: expiresAt,
      access_token: verified.session.access_token,
      refresh_token: verified.session.refresh_token,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
