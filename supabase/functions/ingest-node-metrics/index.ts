// Ingest Hetzner node metrics (CPU/Memory/Disk/Load/Uptime)
// Auth: header `x-node-token` must equal NODE_METRICS_TOKEN secret
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-node-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const expected = Deno.env.get("NODE_METRICS_TOKEN");
  const provided = req.headers.get("x-node-token");
  if (!expected || provided !== expected) {
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
