// Ingest Hetzner node metrics (CPU/Memory/Disk/Load/Uptime)
// Auth: header `x-node-token` must equal NODE_METRICS_TOKEN secret
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders } from "../_shared/cors.ts";

// Constant-time string compare (avoids timing side-channels on token).
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

const MAX_INSERTS_PER_MIN = 20;

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const expected = Deno.env.get("NODE_METRICS_TOKEN");
  const provided = req.headers.get("x-node-token") ?? "";
  if (!expected || !timingSafeEqual(provided, expected)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const node_name = String(body.node_name ?? "").slice(0, 100);
  if (!node_name) {
    return new Response(JSON.stringify({ error: "missing_node_name" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const num = (v: any) => (v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));

  const row = {
    node_name,
    cpu_percent: num(body.cpu_percent),
    mem_percent: num(body.mem_percent),
    disk_percent: num(body.disk_percent),
    load_avg_1m: num(body.load_avg_1m),
    uptime_seconds: body.uptime_seconds != null ? Math.floor(Number(body.uptime_seconds)) : null,
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
  };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Simples Rate-Limit: max. 20 Inserts pro Minute pro node_name
  const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
  const { count: recentCount, error: countErr } = await supabase
    .from("node_metrics")
    .select("id", { count: "exact", head: true })
    .eq("node_name", node_name)
    .gte("recorded_at", oneMinAgo);

  if (!countErr && (recentCount ?? 0) >= MAX_INSERTS_PER_MIN) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
    });
  }

  const { error } = await supabase.from("node_metrics").insert(row);
  if (error) {
    console.error("insert error", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
