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

  // Authenticate via PITCH_API_KEY (header or query param)
  const pitchKey = Deno.env.get("PITCH_API_KEY");
  if (!pitchKey) return json({ error: "PITCH_API_KEY not configured" }, 500);

  const url = new URL(req.url);
  const providedKey =
    req.headers.get("x-pitch-api-key") ||
    url.searchParams.get("key");

  if (providedKey !== pitchKey) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Fetch all counts in parallel
    const [tenants, locations, meters, chargePoints, integrations] =
      await Promise.all([
        supabase.from("tenants").select("id", { count: "exact", head: true }),
        supabase.from("locations").select("id", { count: "exact", head: true }),
        supabase.from("meters").select("id", { count: "exact", head: true }),
        supabase.from("charge_points").select("id", { count: "exact", head: true }),
        supabase.from("integrations").select("id", { count: "exact", head: true }),
      ]);

    return json({
      tenants: tenants.count ?? 0,
      locations: locations.count ?? 0,
      meters: meters.count ?? 0,
      charge_points: chargePoints.count ?? 0,
      integrations: integrations.count ?? 0,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("pitch-stats error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
