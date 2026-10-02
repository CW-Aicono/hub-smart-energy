/**
 * worker-key-info — Zeigt Super-Admins den aktuellen GATEWAY_API_KEY (Bridge-Worker-Key)
 * der Cloud-Instanz im Klartext. Die self-hosted Supabase-Instanz auf Hetzner ist eine
 * separate Deployment-Umgebung mit eigener Env — dieser Endpoint spiegelt NUR den Wert
 * der Cloud-Umgebung, in der die Function läuft.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
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
    .eq("role", "super_admin").maybeSingle();
  if (!roleData) return json({ error: "Forbidden – super_admin required" }, 403);

  const key = Deno.env.get("GATEWAY_API_KEY") ?? "";
  return json({
    success: true,
    is_set: key.length > 0,
    key: key,
    length: key.length,
    environment: "cloud",
  });
});
