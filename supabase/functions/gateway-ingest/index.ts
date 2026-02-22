/**
 * Gateway Ingest – Sicherer Proxy-Endpunkt für den Gateway Worker Docker Container
 * ==================================================================================
 * Nimmt Leistungswerte vom externen Gateway Worker entgegen und schreibt sie
 * in meter_power_readings. Authentifizierung via GATEWAY_API_KEY (Bearer Token).
 *
 * POST /functions/v1/gateway-ingest
 * Authorization: Bearer <GATEWAY_API_KEY>
 * Content-Type: application/json
 * Body: { readings: PowerReading[] }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PowerReading {
  meter_id: string;
  tenant_id: string;
  power_value: number;
  energy_type: string;
  recorded_at: string;
}

const SPIKE_THRESHOLDS: Record<string, number> = {
  strom: 10000,
  gas: 5000,
  wasser: 1000,
  wärme: 5000,
  kälte: 2000,
  default: 50000,
};

function isSpike(powerValue: number, energyType: string): boolean {
  if (!isFinite(powerValue) || isNaN(powerValue)) return true;
  const threshold = SPIKE_THRESHOLDS[energyType] ?? SPIKE_THRESHOLDS.default;
  return Math.abs(powerValue) > threshold;
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Route: list-meters (GET ?action=list-meters) ───────────────────────────
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (req.method === "GET" && action === "list-meters") {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const { data, error } = await supabase
      .from("meters")
      .select(`
        id,
        name,
        energy_type,
        sensor_uuid,
        location_integration_id,
        tenant_id,
        location_integration:location_integrations!meters_location_integration_id_fkey (
          id,
          config,
          integration:integrations!location_integrations_integration_id_fkey (
            type
          )
        )
      `)
      .eq("is_archived", false)
      .not("sensor_uuid", "is", null)
      .not("location_integration_id", "is", null);

    if (error) {
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, meters: data || [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── Route: compact-day (POST ?action=compact-day) ──────────────────────────
  // Verdichtet Rohdaten des Vortages in 5-Minuten-Buckets und löscht danach
  // die Roh-Readings. Wird täglich um 00:05 Uhr per pg_cron aufgerufen.
  if (req.method === "POST" && action === "compact-day") {
    // API-Key Validierung (gleicher Key wie für readings)
    const gatewayApiKey = Deno.env.get("GATEWAY_API_KEY");
    if (!gatewayApiKey) {
      return new Response(JSON.stringify({ error: "Service misconfigured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authHeader = req.headers.get("Authorization") || "";
    const providedKey = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!providedKey || providedKey !== gatewayApiKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    // Zeitfenster: Vortag (von 00:00:00 bis 23:59:59 UTC)
    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
    const dayEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    // 1. Rohdaten des Vortages abrufen (mit Paginierung, da >1000 Zeilen)
    const PAGE_SIZE = 1000;
    let rawData: Array<{ meter_id: string; tenant_id: string; energy_type: string; power_value: number; recorded_at: string }> = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error: fetchError } = await supabase
        .from("meter_power_readings")
        .select("meter_id, tenant_id, energy_type, power_value, recorded_at")
        .gte("recorded_at", dayStart.toISOString())
        .lt("recorded_at", dayEnd.toISOString())
        .order("recorded_at", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (fetchError) {
        console.error("[compact-day] Fetch error:", fetchError.message);
        return new Response(JSON.stringify({ error: fetchError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      rawData = rawData.concat(data ?? []);
      hasMore = (data?.length ?? 0) === PAGE_SIZE;
      from += PAGE_SIZE;
    }

    if (rawData.length === 0) {
      console.log("[compact-day] No raw data to compact");
      return new Response(JSON.stringify({ success: true, compacted: 0, deleted: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[compact-day] Fetched ${rawData.length} raw rows to compact`);

    // 2. In 5-Minuten-Buckets aggregieren (in Memory)
    type BucketKey = string; // `${meter_id}::${bucket_iso}`
    const buckets = new Map<BucketKey, {
      meter_id: string; tenant_id: string; energy_type: string;
      bucket: string; sum: number; max: number; count: number;
    }>();

    for (const row of rawData) {
      const d = new Date(row.recorded_at);
      // Bucket-Beginn: auf 5-Minuten abrunden
      const bucketMin = Math.floor(d.getUTCMinutes() / 5) * 5;
      const bucketTs = new Date(Date.UTC(
        d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
        d.getUTCHours(), bucketMin, 0, 0
      )).toISOString();

      const key: BucketKey = `${row.meter_id}::${bucketTs}`;
      const existing = buckets.get(key);
      const v = Number(row.power_value);
      if (existing) {
        existing.sum += v;
        existing.max = Math.max(existing.max, v);
        existing.count += 1;
      } else {
        buckets.set(key, {
          meter_id: row.meter_id,
          tenant_id: row.tenant_id,
          energy_type: row.energy_type,
          bucket: bucketTs,
          sum: v,
          max: v,
          count: 1,
        });
      }
    }

    // 3. Komprimierte Daten in meter_power_readings_5min schreiben (UPSERT)
    const compactedRows = Array.from(buckets.values()).map((b) => ({
      meter_id: b.meter_id,
      tenant_id: b.tenant_id,
      energy_type: b.energy_type,
      bucket: b.bucket,
      power_avg: b.sum / b.count,
      power_max: b.max,
      sample_count: b.count,
    }));

    const { error: upsertError } = await supabase
      .from("meter_power_readings_5min")
      .upsert(compactedRows, { onConflict: "meter_id,bucket" });

    if (upsertError) {
      console.error("[compact-day] Upsert error:", upsertError.message);
      return new Response(JSON.stringify({ error: upsertError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Rohdaten des Vortages löschen
    const { count: deletedCount, error: deleteError } = await supabase
      .from("meter_power_readings")
      .delete({ count: "exact" })
      .gte("recorded_at", dayStart.toISOString())
      .lt("recorded_at", dayEnd.toISOString());

    if (deleteError) {
      console.error("[compact-day] Delete error:", deleteError.message);
      // Verdichtung war erfolgreich, nur Cleanup ist fehlgeschlagen – trotzdem 200
    }

    console.log(`[compact-day] ✓ Compacted ${compactedRows.length} buckets, deleted ${deletedCount ?? "?"} raw rows`);

    return new Response(
      JSON.stringify({
        success: true,
        compacted: compactedRows.length,
        raw_rows_processed: rawData.length,
        deleted: deletedCount ?? 0,
        period: { from: dayStart.toISOString(), to: dayEnd.toISOString() },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── Route: POST readings ────────────────────────────────────────────────────
  // Only accept POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── API Key Validation ──────────────────────────────────────────────────────
  const gatewayApiKey = Deno.env.get("GATEWAY_API_KEY");
  if (!gatewayApiKey) {
    console.error("[gateway-ingest] GATEWAY_API_KEY secret not configured");
    return new Response(JSON.stringify({ error: "Service misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const providedKey = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!providedKey || providedKey !== gatewayApiKey) {
    console.warn("[gateway-ingest] Invalid or missing API key");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Parse Body ──────────────────────────────────────────────────────────────
  let body: { readings?: PowerReading[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const readings = body?.readings;
  if (!Array.isArray(readings) || readings.length === 0) {
    return new Response(
      JSON.stringify({ error: "readings array is required and must not be empty" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // ── Validate & Filter Readings ──────────────────────────────────────────────
  const validReadings: PowerReading[] = [];
  const skipped: string[] = [];

  for (const r of readings) {
    if (!r.meter_id || !r.tenant_id || r.power_value === undefined || !r.energy_type) {
      skipped.push(`${r.meter_id ?? "unknown"}: missing required fields`);
      continue;
    }

    const powerValue = Number(r.power_value);
    if (isSpike(powerValue, r.energy_type)) {
      skipped.push(`${r.meter_id}: spike detected (${powerValue})`);
      continue;
    }

    validReadings.push({
      meter_id: r.meter_id,
      tenant_id: r.tenant_id,
      power_value: powerValue,
      energy_type: r.energy_type,
      recorded_at: r.recorded_at || new Date().toISOString(),
    });
  }

  if (validReadings.length === 0) {
    return new Response(
      JSON.stringify({
        success: true,
        inserted: 0,
        skipped: skipped.length,
        skipped_details: skipped,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // ── Write to Database ───────────────────────────────────────────────────────
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const { error } = await supabase.from("meter_power_readings").insert(validReadings);

  if (error) {
    console.error("[gateway-ingest] DB insert error:", error.message);
    return new Response(
      JSON.stringify({ error: "Database error", details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  console.log(
    `[gateway-ingest] ✓ Inserted ${validReadings.length} readings, skipped ${skipped.length}`
  );

  return new Response(
    JSON.stringify({
      success: true,
      inserted: validReadings.length,
      skipped: skipped.length,
      skipped_details: skipped.length > 0 ? skipped : undefined,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
