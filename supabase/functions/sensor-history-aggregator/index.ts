// Aggregates sensor_readings_raw into 5-minute buckets.
// The heavy grouping runs inside Postgres via RPC so the function no longer
// pulls large raw windows through the Data API during backend pressure.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(url, serviceKey);
  const startedAt = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    // By default let the RPC use its internal watermark (sensor_aggregator_last_run_at).
    // Callers may still force an explicit window for manual backfills.
    const since = typeof body.since === "string" ? body.since : null;
    const until = typeof body.until === "string" ? body.until : null;
    const maxRows = Number.isFinite(Number(body.maxRows)) ? Number(body.maxRows) : 20000;

    const { data, error } = await supabase.rpc("aggregate_sensor_readings_5min", {
      _since: since,
      _until: until,
      _max_rows: Math.min(Math.max(maxRows, 1000), 50000),
    });
    if (error) throw error;

    const result = typeof data === "object" && data !== null ? data : { success: true, data };
    return new Response(JSON.stringify({ ...result, edge_ms: Date.now() - startedAt }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[sensor-aggregator] failed:", err);
    return new Response(JSON.stringify({ success: false, error: String((err as Error).message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
