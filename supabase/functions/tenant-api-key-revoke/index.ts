/**
 * tenant-api-key-revoke – setzt revoked_at auf now() für einen Key des eigenen Tenants.
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

  let body: { key_id?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  if (!body.key_id) return json({ error: "key_id required" }, 400);

  // Scope-Check: nur eigener Tenant (Super-Admin kann alles)
  let q = svc.from("tenant_api_keys").update({ revoked_at: new Date().toISOString() })
    .eq("id", body.key_id).is("revoked_at", null);
  if (!roleSet.has("super_admin")) {
    q = q.eq("tenant_id", profile?.tenant_id ?? "00000000-0000-0000-0000-000000000000");
  }

  const { error, count } = await q.select("id", { count: "exact" });
  if (error) return json({ error: error.message }, 500);
  if (!count) return json({ error: "Not found" }, 404);
  return json({ success: true });
});
