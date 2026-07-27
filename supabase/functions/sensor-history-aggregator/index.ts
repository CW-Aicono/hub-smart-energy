// Aggregates sensor_readings_raw into 5-minute buckets using a
// TIME-WEIGHTED average (trapezoidal integration over recorded_at).
// Called via pg_cron every 5 minutes. Idempotent (upsert on meter_id+bucket).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BUCKET_MS = 5 * 60_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(url, serviceKey);
  const startedAt = Date.now();

  try {
    const { data: ks } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "sensor_history_enabled")
      .maybeSingle();
    const raw = String((ks as any)?.value ?? "true").toLowerCase();
    const enabled = raw !== "false" && raw !== "0" && raw !== "off";
    if (!enabled) {
      return new Response(JSON.stringify({ success: true, skipped: "kill_switch_off" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fenster: letzte 15 Min (drei 5-Min-Buckets) idempotent nachbauen.
    const since = new Date(Date.now() - 15 * 60_000).toISOString();

    const { data: raws, error: rErr } = await supabase
      .from("sensor_readings_raw")
      .select("tenant_id, meter_id, value, unit, recorded_at")
      .gte("recorded_at", since)
      .order("recorded_at", { ascending: true })
      .limit(20000);
    if (rErr) throw rErr;
    if (!raws || raws.length === 0) {
      return new Response(JSON.stringify({ success: true, rows: 0, ms: Date.now() - startedAt }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sammle Samples je (meter_id, bucketMs) und berechne zeit-gewichteten Mittelwert.
    type Sample = { ts: number; value: number };
    type Bucket = {
      tenant_id: string;
      meter_id: string;
      bucketMs: number;
      unit: string | null;
      samples: Sample[];
      min: number;
      max: number;
    };
    const buckets = new Map<string, Bucket>();

    for (const r of raws as any[]) {
      const ts = new Date(r.recorded_at).getTime();
      const bucketMs = Math.floor(ts / BUCKET_MS) * BUCKET_MS;
      const key = `${r.meter_id}|${bucketMs}`;
      const v = Number(r.value);
      if (!Number.isFinite(v)) continue;
      let b = buckets.get(key);
      if (!b) {
        b = {
          tenant_id: r.tenant_id,
          meter_id: r.meter_id,
          bucketMs,
          unit: r.unit ?? null,
          samples: [],
          min: v,
          max: v,
        };
        buckets.set(key, b);
      }
      b.samples.push({ ts, value: v });
      if (v < b.min) b.min = v;
      if (v > b.max) b.max = v;
      if (r.unit && !b.unit) b.unit = r.unit;
    }

    const rows = [...buckets.values()].map((b) => {
      // ts-sortiert
      b.samples.sort((a, z) => a.ts - z.ts);
      const first = b.samples[0];
      const last = b.samples[b.samples.length - 1];
      const bucketEnd = b.bucketMs + BUCKET_MS;

      let twavg: number;
      if (b.samples.length === 1) {
        twavg = first.value;
      } else {
        // Trapez-Integral über die Sample-Zeitreihe, letzter Wert hält bis bucketEnd.
        let integral = 0;
        for (let i = 0; i < b.samples.length - 1; i++) {
          const a = b.samples[i];
          const c = b.samples[i + 1];
          const dt = (c.ts - a.ts) / 1000;
          if (dt > 0) integral += ((a.value + c.value) / 2) * dt;
        }
        // Hold vom letzten Sample bis Bucket-Ende
        const dtHold = (bucketEnd - last.ts) / 1000;
        if (dtHold > 0) integral += last.value * dtHold;
        const totalSpan = (bucketEnd - first.ts) / 1000;
        twavg = totalSpan > 0 ? integral / totalSpan : last.value;
      }

      return {
        tenant_id: b.tenant_id,
        meter_id: b.meter_id,
        bucket: new Date(b.bucketMs).toISOString(),
        value_avg: twavg,
        value_min: b.min,
        value_max: b.max,
        value_last: last.value,
        sample_count: b.samples.length,
        unit: b.unit,
        updated_at: new Date().toISOString(),
      };
    });

    // Upsert in Chunks à 500
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error: upErr } = await supabase
        .from("sensor_readings_5min")
        .upsert(chunk, { onConflict: "meter_id,bucket" });
      if (upErr) throw upErr;
    }

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
