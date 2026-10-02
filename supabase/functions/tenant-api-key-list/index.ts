/**
 * tenant-api-key-list – listet alle nicht-widerrufenen Keys des Tenants (nur Metadaten).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), {
    status: s, headers: { ...cors, "Content-Type": "application/json" },
  });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false }, global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data: profile } = await svc
    .from("profiles").select("tenant_id").eq("id", user.id).maybeSingle();
  const { data: roles } = await svc
    .from("user_roles").select("role").eq("user_id", user.id);
  const roleSet = new Set((roles ?? []).map((r: { role: string }) => r.role));
  const isAdmin = roleSet.has("admin") || roleSet.has("super_admin");
  if (!isAdmin) return json({ error: "Forbidden" }, 403);

  const url = new URL(req.url);
  const isSuper = roleSet.has("super_admin");
  const tenantId = isSuper && url.searchParams.get("tenant_id")
    ? url.searchParams.get("tenant_id")!
    : profile?.tenant_id;
  if (!tenantId) return json({ error: "No tenant context" }, 400);

  const { data, error } = await svc
    .from("tenant_api_keys")
    .select("id, key_prefix, label, created_at, last_used_at, revoked_at")
    .eq("tenant_id", tenantId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) return json({ error: error.message }, 500);
  return json({ success: true, keys: data ?? [] });
});
