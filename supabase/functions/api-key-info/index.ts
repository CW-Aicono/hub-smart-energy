/**
 * API Key Info – Gibt den maskierten GATEWAY_API_KEY für authentifizierte Admins zurück
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // Verify JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  // Check admin role
  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: roleData } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["admin", "super_admin"])
    .maybeSingle();

  if (!roleData) return json({ error: "Forbidden – admin role required" }, 403);

  const gatewayApiKey = Deno.env.get("GATEWAY_API_KEY");
  if (!gatewayApiKey) {
    return json({ error: "GATEWAY_API_KEY not configured" }, 500);
  }

  const url = new URL(req.url);
  const reveal = url.searchParams.get("reveal") === "true";

  const endpoint = `${Deno.env.get("SUPABASE_URL")}/functions/v1/gateway-ingest`;

  if (reveal) {
    return json({
      success: true,
      api_key: gatewayApiKey,
      endpoint,
      masked: false,
    });
  }

  // Mask: show last 6 chars
  const masked = "••••••" + gatewayApiKey.slice(-6);
  return json({
    success: true,
    api_key: masked,
    endpoint,
    masked: true,
  });
});
