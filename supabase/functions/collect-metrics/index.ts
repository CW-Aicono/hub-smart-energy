import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1. Collect DB metrics via SQL function
    const { data: dbMetrics, error: dbErr } = await supabase.rpc(
      "collect_db_metrics"
    );

    if (dbErr) {
      console.error("Error collecting DB metrics:", dbErr);
    }

    // 2. Collect edge function boot/execution metrics from recent activity
    // We track how many edge functions are configured as a basic metric
    const { count: edgeFunctionCount } = await supabase
      .from("infrastructure_metrics")
      .select("id", { count: "exact", head: true })
      .eq("metric_type", "edge_function")
      .gte(
        "recorded_at",
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      );

    // 3. Collect application-level metrics
    const [tenantCount, userCount, locationCount, meterCount] =
      await Promise.all([
        supabase
          .from("tenants")
          .select("id", { count: "exact", head: true })
          .then((r) => r.count ?? 0),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .then((r) => r.count ?? 0),
        supabase
          .from("locations")
          .select("id", { count: "exact", head: true })
          .then((r) => r.count ?? 0),
        supabase
          .from("meters")
          .select("id", { count: "exact", head: true })
          .then((r) => r.count ?? 0),
      ]);

    // Insert application metrics
    const appMetrics = [
      {
        metric_type: "app_counts",
        metric_name: "tenants",
        metric_value: tenantCount,
      },
      {
        metric_type: "app_counts",
        metric_name: "users",
        metric_value: userCount,
      },
      {
        metric_type: "app_counts",
        metric_name: "locations",
        metric_value: locationCount,
      },
      {
        metric_type: "app_counts",
        metric_name: "meters",
        metric_value: meterCount,
      },
    ];

    const { error: insertErr } = await supabase
      .from("infrastructure_metrics")
      .insert(appMetrics);

    if (insertErr) {
      console.error("Error inserting app metrics:", insertErr);
    }

    // 4. Check system health
    const healthChecks: Record<string, string> = {};

    // DB health - already confirmed by successful rpc call
    healthChecks.database = dbErr ? "error" : "healthy";

    // Auth health - try a simple query
    try {
      await supabase.from("profiles").select("id").limit(1);
      healthChecks.auth = "healthy";
    } catch {
      healthChecks.auth = "error";
    }

    // Storage health
    try {
      const { error: storageErr } = await supabase.storage.listBuckets();
      healthChecks.storage = storageErr ? "error" : "healthy";
    } catch {
      healthChecks.storage = "error";
    }

    // Insert health status
    const { error: healthErr } = await supabase
      .from("infrastructure_metrics")
      .insert({
        metric_type: "system_health",
        metric_name: "health_check",
        metric_value: Object.values(healthChecks).every((v) => v === "healthy")
          ? 1
          : 0,
        metadata: healthChecks,
      });

    if (healthErr) {
      console.error("Error inserting health metrics:", healthErr);
    }

    const result = {
      success: true,
      db_metrics: dbMetrics,
      app_metrics: { tenantCount, userCount, locationCount, meterCount },
      health: healthChecks,
      collected_at: new Date().toISOString(),
    };

    console.log("Metrics collected successfully:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("collect-metrics error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
