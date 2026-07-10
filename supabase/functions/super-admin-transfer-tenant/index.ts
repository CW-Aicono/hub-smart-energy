import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);

  const authClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const admin = createClient(SUPABASE_URL, SERVICE);

  const { data: userRes, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: "Unauthorized" }, 401);
  const user = userRes.user;

  const { data: role } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!role) return json({ error: "Forbidden" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const tenantId = body?.tenant_id as string | undefined;
  const targetPartnerId = (body?.target_partner_id ?? null) as string | null;
  const reason = (body?.reason ?? "").toString().trim();

  if (!tenantId) return json({ error: "tenant_id required" }, 400);
  if (reason.length < 5) return json({ error: "reason (min 5 chars) required" }, 400);

  const { data: tenant, error: tErr } = await admin
    .from("tenants")
    .select("id, partner_id, support_owner, name")
    .eq("id", tenantId)
    .maybeSingle();
  if (tErr || !tenant) return json({ error: "Tenant not found" }, 404);

  if (targetPartnerId) {
    const { data: partner } = await admin
      .from("partners")
      .select("id, is_active")
      .eq("id", targetPartnerId)
      .maybeSingle();
    if (!partner) return json({ error: "Target partner not found" }, 404);
    if (partner.is_active === false) return json({ error: "Target partner inactive" }, 400);
  }

  const newSupportOwner = targetPartnerId ? "partner" : "platform";

  if (tenant.partner_id === targetPartnerId && tenant.support_owner === newSupportOwner) {
    return json({ error: "No change – tenant already assigned to this owner" }, 400);
  }

  const { error: upErr } = await admin
    .from("tenants")
    .update({
      partner_id: targetPartnerId,
      support_owner: newSupportOwner,
    })
    .eq("id", tenantId);
  if (upErr) return json({ error: upErr.message }, 500);

  await admin.from("tenant_partner_transfers").insert({
    tenant_id: tenantId,
    from_partner_id: tenant.partner_id,
    to_partner_id: targetPartnerId,
    from_support_owner: tenant.support_owner,
    to_support_owner: newSupportOwner,
    reason,
    performed_by: user.id,
  });

  await admin.from("audit_logs").insert({
    action: "tenant.partner_transfer",
    entity_type: "tenant",
    entity_id: tenantId,
    tenant_id: tenantId,
    user_id: user.id,
    before: { partner_id: tenant.partner_id, support_owner: tenant.support_owner },
    after: { partner_id: targetPartnerId, support_owner: newSupportOwner },
    metadata: { reason },
  } as any);

  return json({
    success: true,
    tenant_id: tenantId,
    partner_id: targetPartnerId,
    support_owner: newSupportOwner,
  });
});
