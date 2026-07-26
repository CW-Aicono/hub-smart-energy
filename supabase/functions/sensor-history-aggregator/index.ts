// Aggregates sensor_readings_raw into 5-minute buckets in sensor_readings_5min.
// Called via pg_cron every 5 minutes. Idempotent (upsert on meter_id+bucket).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(url, serviceKey);
  const startedAt = Date.now();

  try {
    // Kill-switch
    const { data: ks } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "sensor_history_enabled")
      .maybeSingle();
    const enabled = String((ks as any)?.value ?? "true").toLowerCase() !== "false";
    if (!enabled) {
      return new Response(JSON.stringify({ success: true, skipped: "kill_switch_off" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Aggregate the last 15 minutes of raw data into 5-min buckets.
    // Using a single SQL statement executed via RPC would be cheaper, but we
    // stay pure-Supabase-client to avoid needing a new DB function.
    const since = new Date(Date.now() - 15 * 60_000).toISOString();

    // Pull raw rows in chunks (max 5k)
    const { data: raws, error: rErr } = await supabase
      .from("sensor_readings_raw")
      .select("tenant_id, meter_id, value, unit, recorded_at")
      .gte("recorded_at", since)
      .order("recorded_at", { ascending: true })
      .limit(5000);
    if (rErr) throw rErr;
    if (!raws || raws.length === 0) {
      return new Response(JSON.stringify({ success: true, rows: 0, ms: Date.now() - startedAt }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Bucket by (meter_id, floor(recorded_at / 5min))
    type Agg = {
      tenant_id: string;
      meter_id: string;
      bucket: string;
      unit: string | null;
      sum: number;
      min: number;
      max: number;
      last: number;
      lastAt: number;
      count: number;
    };
    const buckets = new Map<string, Agg>();
    for (const r of raws as any[]) {
      const ts = new Date(r.recorded_at).getTime();
      const bucketMs = Math.floor(ts / (5 * 60_000)) * (5 * 60_000);
      const key = `${r.meter_id}|${bucketMs}`;
      const v = Number(r.value);
      const cur = buckets.get(key);
      if (!cur) {
        buckets.set(key, {
          tenant_id: r.tenant_id,
          meter_id: r.meter_id,
          bucket: new Date(bucketMs).toISOString(),
          unit: r.unit ?? null,
          sum: v, min: v, max: v, last: v, lastAt: ts, count: 1,
        });
      } else {
        cur.sum += v;
        if (v < cur.min) cur.min = v;
        if (v > cur.max) cur.max = v;
        if (ts >= cur.lastAt) { cur.last = v; cur.lastAt = ts; }
        cur.count += 1;
        if (r.unit && !cur.unit) cur.unit = r.unit;
      }
    }

    const rows = [...buckets.values()].map((b) => ({
      tenant_id: b.tenant_id,
      meter_id: b.meter_id,
      bucket: b.bucket,
      value_avg: b.sum / b.count,
      value_min: b.min,
      value_max: b.max,
      value_last: b.last,
      sample_count: b.count,
      unit: b.unit,
      updated_at: new Date().toISOString(),
    }));

    const { error: upErr } = await supabase
      .from("sensor_readings_5min")
      .upsert(rows, { onConflict: "meter_id,bucket" });
    if (upErr) throw upErr;

    return new Response(JSON.stringify({
      success: true,
      raw_rows: raws.length,
      buckets: rows.length,
      ms: Date.now() - startedAt,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[sensor-aggregator] failed:", err);
    return new Response(JSON.stringify({ success: false, error: String((err as Error).message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
