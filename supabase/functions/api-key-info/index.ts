/**
 * api-key-info – Endpoint- und Tenant-Info für authentifizierte Admins.
 * Der frühere globale GATEWAY_API_KEY wird NICHT mehr an Tenants ausgeliefert.
 * Tenants verwalten stattdessen ihre eigenen Keys via tenant-api-key-* Funktionen.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false }, global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data: roleData } = await svc
    .from("user_roles").select("role").eq("user_id", user.id)
    .in("role", ["admin", "super_admin"]).maybeSingle();
  if (!roleData) return json({ error: "Forbidden – admin role required" }, 403);

  const endpoint = `${Deno.env.get("SUPABASE_URL")}/functions/v1/gateway-ingest`;
  return json({ success: true, endpoint });
});
