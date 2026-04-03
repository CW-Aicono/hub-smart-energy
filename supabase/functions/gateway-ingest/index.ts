/**
 * Gateway Ingest – Sicherer Proxy-Endpunkt für den Gateway Worker Docker Container
 * ==================================================================================
 * Nimmt Leistungswerte vom externen Gateway Worker entgegen und schreibt sie
 * in meter_power_readings. Authentifizierung via GATEWAY_API_KEY (Bearer Token).
 *
 * Routes:
 *   GET  ?action=list-locations               – Alle aktiven Liegenschaften
 *   GET  ?action=list-meters[&location_id=…]  – Zähler (optional nach Standort)
 *   GET  ?action=get-daily-totals             – Tagessummen pro Zähler
 *   GET  ?action=get-readings                 – 5-Min-Leistungswerte
 *   GET  ?action=get-locations-summary        – Standorte mit Verbrauchsdaten
 *   POST ?action=compact-day                  – Rohdaten verdichten
 *   POST (default)                            – Readings einfügen
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Module-level default for helpers called outside handler context
let corsHeaders: Record<string, string> = getCorsHeaders();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/* ── Auth helper ─────────────────────────────────────────────────────────────── */

function validateApiKey(req: Request): Response | null {
  const gatewayApiKey = Deno.env.get("GATEWAY_API_KEY");
  if (!gatewayApiKey) {
    console.error("[gateway-ingest] GATEWAY_API_KEY secret not configured");
    return json({ error: "Service misconfigured" }, 500);
  }
  const authHeader = req.headers.get("Authorization") || "";
  const providedKey = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!providedKey || providedKey !== gatewayApiKey) {
    return json({ error: "Unauthorized" }, 401);
  }
  return null; // OK
}

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/* ── Spike filter ────────────────────────────────────────────────────────────── */

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

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

function parseDateRange(url: URL): { from: string; to: string } | null {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) return null;

  // Validate ISO date format
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) return null;

  // Max 90 days
  const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays > 90 || diffDays < 0) return null;

  return { from: fromDate.toISOString(), to: toDate.toISOString() };
}

function parseMeterIds(url: URL): string[] {
  const raw = url.searchParams.get("meter_ids");
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/* ── GET Route handlers ──────────────────────────────────────────────────────── */

async function handleListLocations(): Promise<Response> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("locations")
    .select("id, tenant_id, name, address, city, postal_code, country, type, usage_type, energy_sources, latitude, longitude")
    .eq("is_archived", false)
    .order("name");

  if (error) {
    console.error("[gateway-ingest] list-locations error:", error.message);
    return json({ success: false, error: "Internal error" }, 500);
  }
  return json({ success: true, locations: data || [] });
}

async function handleListMeters(url: URL): Promise<Response> {
  const supabase = getSupabase();
  const locationId = url.searchParams.get("location_id");

  // Include ALL meters (manual, automatic, virtual) – no sensor_uuid/integration filter
  let query = supabase
    .from("meters")
    .select(`
      id,
      name,
      energy_type,
      sensor_uuid,
      location_id,
      location_integration_id,
      tenant_id,
      capture_type,
      meter_function,
      is_main_meter,
      parent_meter_id,
      location_integration:location_integrations!meters_location_integration_id_fkey (
        id,
        config,
        integration:integrations!location_integrations_integration_id_fkey (
          type
        )
      )
    `)
    .eq("is_archived", false);

  if (locationId) {
    query = query.eq("location_id", locationId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[gateway-ingest] list-meters error:", error.message);
    return json({ success: false, error: "Internal error" }, 500);
  }
  return json({ success: true, meters: data || [] });
}

async function handleGetDailyTotals(url: URL): Promise<Response> {
  const range = parseDateRange(url);
  if (!range) {
    return json({ error: "Parameters 'from' and 'to' required (ISO date, max 90 days)" }, 400);
  }

  const meterIds = parseMeterIds(url);
  const locationId = url.searchParams.get("location_id");

  if (meterIds.length === 0 && !locationId) {
    return json({ error: "Either 'meter_ids' or 'location_id' parameter required" }, 400);
  }

  const supabase = getSupabase();

  // If location_id provided but no meter_ids, resolve meters first
  let resolvedMeterIds = meterIds;
  if (resolvedMeterIds.length === 0 && locationId) {
    const { data: meters, error: mErr } = await supabase
      .from("meters")
      .select("id")
      .eq("location_id", locationId)
      .eq("is_archived", false);
    if (mErr) return json({ error: "Internal error" }, 500);
    resolvedMeterIds = (meters || []).map((m: { id: string }) => m.id);
  }

  if (resolvedMeterIds.length === 0) {
    return json({ success: true, daily_totals: [] });
  }

  const fromDate = range.from.split("T")[0];
  const toDate = range.to.split("T")[0];

  // 1) Get totals from meter_period_totals (automatic meters)
  const { data: periodData, error } = await supabase.rpc("get_meter_daily_totals", {
    p_meter_ids: resolvedMeterIds,
    p_from_date: fromDate,
    p_to_date: toDate,
  });

  if (error) {
    console.error("[gateway-ingest] get-daily-totals error:", error.message);
    return json({ error: "Internal error" }, 500);
  }

  const results = [...(periodData || [])];
  const coveredMeterIds = new Set((periodData || []).map((r: { meter_id: string }) => r.meter_id));

  // 2) For meters NOT in period_totals, compute daily deltas from meter_readings
  const uncoveredIds = resolvedMeterIds.filter((id: string) => !coveredMeterIds.has(id));

  if (uncoveredIds.length > 0) {
    const { data: readings } = await supabase
      .from("meter_readings")
      .select("meter_id, value, reading_date")
      .in("meter_id", uncoveredIds)
      .gte("reading_date", fromDate)
      .lte("reading_date", toDate)
      .order("reading_date", { ascending: true });

    if (readings && readings.length > 0) {
      // Group by meter_id and compute daily deltas from counter readings
      const byMeter = new Map<string, Array<{ value: number; reading_date: string }>>();
      for (const r of readings) {
        const arr = byMeter.get(r.meter_id) || [];
        arr.push({ value: Number(r.value), reading_date: r.reading_date });
        byMeter.set(r.meter_id, arr);
      }

      for (const [meterId, meterReadings] of byMeter) {
        // Sort by date and compute deltas between consecutive readings
        meterReadings.sort((a, b) => a.reading_date.localeCompare(b.reading_date));
        for (let i = 1; i < meterReadings.length; i++) {
          const delta = meterReadings[i].value - meterReadings[i - 1].value;
          if (delta >= 0) {
            results.push({
              meter_id: meterId,
              day: meterReadings[i].reading_date,
              total_value: delta,
            });
          }
        }
      }
    }
  }

  return json({ success: true, daily_totals: results });
}

async function handleGetReadings(url: URL): Promise<Response> {
  const range = parseDateRange(url);
  if (!range) {
    return json({ error: "Parameters 'from' and 'to' required (ISO date, max 90 days)" }, 400);
  }

  const meterIds = parseMeterIds(url);
  const locationId = url.searchParams.get("location_id");

  if (meterIds.length === 0 && !locationId) {
    return json({ error: "Either 'meter_ids' or 'location_id' parameter required" }, 400);
  }

  const supabase = getSupabase();

  let resolvedMeterIds = meterIds;
  if (resolvedMeterIds.length === 0 && locationId) {
    const { data: meters, error: mErr } = await supabase
      .from("meters")
      .select("id")
      .eq("location_id", locationId)
      .eq("is_archived", false);
    if (mErr) return json({ error: "Internal error" }, 500);
    resolvedMeterIds = (meters || []).map((m: { id: string }) => m.id);
  }

  if (resolvedMeterIds.length === 0) {
    return json({ success: true, readings: [] });
  }

  // Limit to max 1000 rows
  const { data, error } = await supabase.rpc("get_power_readings_5min", {
    p_meter_ids: resolvedMeterIds,
    p_start: range.from,
    p_end: range.to,
  });

  if (error) {
    console.error("[gateway-ingest] get-readings error:", error.message);
    return json({ error: "Internal error" }, 500);
  }

  // Limit output
  const limited = (data || []).slice(0, 1000);

  return json({
    success: true,
    readings: limited,
    truncated: (data || []).length > 1000,
    total_available: (data || []).length,
  });
}

async function handleGetLocationsSummary(url: URL): Promise<Response> {
  const supabase = getSupabase();
  const tenantId = url.searchParams.get("tenant_id");

  let locQuery = supabase
    .from("locations")
    .select("id, tenant_id, name, address, city, type, usage_type, energy_sources, latitude, longitude")
    .eq("is_archived", false)
    .order("name");

  if (tenantId) {
    locQuery = locQuery.eq("tenant_id", tenantId);
  }

  const { data: locations, error: locErr } = await locQuery;
  if (locErr) {
    console.error("[gateway-ingest] get-locations-summary error:", locErr.message);
    return json({ error: "Internal error" }, 500);
  }

  // Get meter counts per location
  const locationIds = (locations || []).map((l: { id: string }) => l.id);
  if (locationIds.length === 0) {
    return json({ success: true, locations: [] });
  }

  const { data: meters } = await supabase
    .from("meters")
    .select("id, location_id, energy_type")
    .in("location_id", locationIds)
    .eq("is_archived", false);

  const metersByLocation = new Map<string, { count: number; types: Set<string> }>();
  for (const m of meters || []) {
    const entry = metersByLocation.get(m.location_id) || { count: 0, types: new Set() };
    entry.count++;
    entry.types.add(m.energy_type);
    metersByLocation.set(m.location_id, entry);
  }

  const result = (locations || []).map((loc: Record<string, unknown>) => ({
    ...loc,
    meter_count: metersByLocation.get(loc.id as string)?.count || 0,
    energy_types: Array.from(metersByLocation.get(loc.id as string)?.types || []),
  }));

  return json({ success: true, locations: result });
}

/* ── POST Route handlers ─────────────────────────────────────────────────────── */

async function handleCompactDay(req: Request): Promise<Response> {
  const authErr = validateApiKey(req);
  if (authErr) return authErr;

  const supabase = getSupabase();

  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const dayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  // 1. Fetch raw data with pagination
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
      console.error("[compact-day] fetch error:", fetchError.message);
      return json({ error: "Internal error" }, 500);
    }
    rawData = rawData.concat(data ?? []);
    hasMore = (data?.length ?? 0) === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  if (rawData.length === 0) {
    return json({ success: true, compacted: 0, deleted: 0 });
  }

  // 2. Aggregate into 5-min buckets
  type BucketKey = string;
  const buckets = new Map<BucketKey, {
    meter_id: string; tenant_id: string; energy_type: string;
    bucket: string; sum: number; max: number; count: number;
  }>();

  for (const row of rawData) {
    const d = new Date(row.recorded_at);
    const bucketMin = Math.floor(d.getUTCMinutes() / 5) * 5;
    const bucketTs = new Date(Date.UTC(
      d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
      d.getUTCHours(), bucketMin, 0, 0,
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
        meter_id: row.meter_id, tenant_id: row.tenant_id,
        energy_type: row.energy_type, bucket: bucketTs,
        sum: v, max: v, count: 1,
      });
    }
  }

  // 3. Upsert compacted rows
  const compactedRows = Array.from(buckets.values()).map((b) => ({
    meter_id: b.meter_id, tenant_id: b.tenant_id, energy_type: b.energy_type,
    bucket: b.bucket, power_avg: b.sum / b.count, power_max: b.max, sample_count: b.count,
  }));

  const { error: upsertError } = await supabase
    .from("meter_power_readings_5min")
    .upsert(compactedRows, { onConflict: "meter_id,bucket" });

  if (upsertError) {
    console.error("[compact-day] upsert error:", upsertError.message);
    return json({ error: "Internal error" }, 500);
  }

  // 4. Delete raw data
  const { count: deletedCount, error: deleteError } = await supabase
    .from("meter_power_readings")
    .delete({ count: "exact" })
    .gte("recorded_at", dayStart.toISOString())
    .lt("recorded_at", dayEnd.toISOString());

  if (deleteError) console.error("[compact-day] Delete error:", deleteError.message);

  return json({
    success: true, compacted: compactedRows.length,
    raw_rows_processed: rawData.length, deleted: deletedCount ?? 0,
    period: { from: dayStart.toISOString(), to: dayEnd.toISOString() },
  });
}

async function handlePostReadings(req: Request): Promise<Response> {
  const authErr = validateApiKey(req);
  if (authErr) return authErr;

  let body: { readings?: PowerReading[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const readings = body?.readings;
  if (!Array.isArray(readings) || readings.length === 0) {
    return json({ error: "readings array is required and must not be empty" }, 400);
  }

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
      meter_id: r.meter_id, tenant_id: r.tenant_id, power_value: powerValue,
      energy_type: r.energy_type, recorded_at: r.recorded_at || new Date().toISOString(),
    });
  }

  if (validReadings.length === 0) {
    return json({ success: true, inserted: 0, skipped: skipped.length, skipped_details: skipped });
  }

  const supabase = getSupabase();
  const { error } = await supabase.from("meter_power_readings").insert(validReadings);

  if (error) {
    console.error("[gateway-ingest] DB insert error:", error.message);
    return json({ error: "Database error" }, 500);
  }

  return json({
    success: true, inserted: validReadings.length,
    skipped: skipped.length,
    skipped_details: skipped.length > 0 ? skipped : undefined,
  });
}

/* ── Schneider Panel Server Push handler ──────────────────────────────────────── */

interface SchneiderMeasurement {
  deviceId?: string;
  deviceName?: string;
  values?: Array<{ name: string; timestamp?: string; value: number }>;
}

interface SchneiderPayload {
  header?: { senderId?: string; timestamp?: string };
  measurements?: SchneiderMeasurement[];
}

/**
 * Parses a device_mapping string like "modbus:2=uuid1,modbus:3=uuid2"
 * into a Map<deviceId, meterUuid>.
 */
function parseDeviceMapping(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw) return map;
  for (const pair of raw.split(",")) {
    const [deviceId, meterUuid] = pair.split("=").map((s) => s.trim());
    if (deviceId && meterUuid) map.set(deviceId, meterUuid);
  }
  return map;
}

/** Power-related measurement names from Schneider devices (kW values) */
const SCHNEIDER_POWER_FIELDS = new Set([
  "PkWD",     // Active power demand (total)
  "PkWDA",    // Active power phase A
  "PkWDB",    // Active power phase B
  "PkWDC",    // Active power phase C
  "TotPF",    // Total power factor
]);

/**
 * Validates Basic Auth credentials against stored push_username/push_password
 * in the location_integration config for schneider_panel_server integrations.
 */
async function validateBasicAuth(
  req: Request,
  tenantId: string,
): Promise<{ config: Record<string, unknown> } | Response> {
  const authHeader = req.headers.get("Authorization") || "";
  const supabase = getSupabase();

  // Helper: find schneider location_integrations for this tenant
  async function findSchneiderIntegrations() {
    // First get schneider integrations for this tenant
    const { data: integrations, error: intErr } = await supabase
      .from("integrations")
      .select("id")
      .eq("type", "schneider_panel_server")
      .eq("tenant_id", tenantId);

    if (intErr || !integrations?.length) {
      if (intErr) console.error("[schneider-push] integrations lookup error:", intErr.message);
      return [];
    }

    const integrationIds = integrations.map((i: { id: string }) => i.id);

    const { data: locIntegrations, error: liErr } = await supabase
      .from("location_integrations")
      .select("config")
      .in("integration_id", integrationIds)
      .eq("is_enabled", true);

    if (liErr) {
      console.error("[schneider-push] location_integrations lookup error:", liErr.message);
      return [];
    }
    return locIntegrations || [];
  }

  const wwwAuthHeader = { "WWW-Authenticate": 'Basic realm="Schneider"' };

  // Try Basic Auth first (case-insensitive scheme)
  if (/^basic\s/i.test(authHeader)) {
    let decoded: string;
    try {
      decoded = atob(authHeader.replace(/^basic\s+/i, ""));
    } catch {
      console.warn(`[schneider-push] Invalid base64 in Basic Auth for tenant ${tenantId}`);
      return new Response(JSON.stringify({ error: "Invalid Basic Auth encoding" }), {
        status: 401,
        headers: { ...corsHeaders, ...wwwAuthHeader, "Content-Type": "application/json" },
      });
    }

    const colonIdx = decoded.indexOf(":");
    if (colonIdx === -1) {
      return new Response(JSON.stringify({ error: "Invalid Basic Auth format" }), {
        status: 401,
        headers: { ...corsHeaders, ...wwwAuthHeader, "Content-Type": "application/json" },
      });
    }

    const username = decoded.slice(0, colonIdx).trim();
    const password = decoded.slice(colonIdx + 1).trim();

    const locIntegrations = await findSchneiderIntegrations();

    for (const li of locIntegrations) {
      const cfg = (li.config || {}) as Record<string, unknown>;
      if (
        String(cfg.push_username || "").trim() === username &&
        String(cfg.push_password || "").trim() === password
      ) {
        return { config: cfg };
      }
    }

    console.warn(`[schneider-push] Basic Auth failed for tenant ${tenantId}, user="${username}", found ${locIntegrations.length} integration(s)`);
    return new Response(JSON.stringify({ error: "Invalid credentials" }), {
      status: 401,
      headers: { ...corsHeaders, ...wwwAuthHeader, "Content-Type": "application/json" },
    });
  }

  // Fall back to API key auth
  const apiKeyErr = validateApiKey(req);
  if (apiKeyErr) return apiKeyErr;

  // If using API key, load config from any matching integration for this tenant
  const locIntegrations = await findSchneiderIntegrations();
  const cfg = locIntegrations.length > 0
    ? (locIntegrations[0].config || {}) as Record<string, unknown>
    : {};

  return { config: cfg };
}

async function handleSchneiderPush(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenant_id");

  if (!tenantId) {
    return json({ error: "tenant_id query parameter required" }, 400);
  }

  // Authenticate via Basic Auth (Panel Server) or API key
  const authResult = await validateBasicAuth(req, tenantId);
  if (authResult instanceof Response) return authResult;
  const storedConfig = authResult.config;

  let payload: SchneiderPayload;
  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      // Panel Server sends JSON inside 'datafile1' form field
      const formData = await req.formData();
      const datafile = formData.get("datafile1");
      if (!datafile) {
        return json({ error: "Missing 'datafile1' field in multipart form data" }, 400);
      }
      const raw = typeof datafile === "string" ? datafile : await (datafile as File).text();
      payload = JSON.parse(raw);
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      // Some firmware versions may send URL-encoded with datafile1 field
      const formData = await req.formData();
      const datafile = formData.get("datafile1");
      if (!datafile) {
        return json({ error: "Missing 'datafile1' field in form data" }, 400);
      }
      payload = JSON.parse(String(datafile));
    } else {
      // Direct JSON body (API key auth, testing, newer firmware)
      payload = await req.json();
    }
  } catch (e) {
    console.error("[schneider-push] Payload parse error:", e);
    return json({ error: "Invalid payload – expected JSON or multipart form with 'datafile1' field" }, 400);
  }

  const measurements = payload?.measurements;
  if (!Array.isArray(measurements) || measurements.length === 0) {
    return json({ error: "No measurements in payload" }, 400);
  }

  const senderId = payload?.header?.senderId || "unknown";
  console.log(`[schneider-push] Received ${measurements.length} device(s) from ${senderId}`);

  // Device mapping: from stored config or query param
  const deviceMappingRaw = url.searchParams.get("device_mapping") || String(storedConfig.device_mapping || "");
  const deviceMapping = parseDeviceMapping(deviceMappingRaw);

  const supabase = getSupabase();
  const readings: PowerReading[] = [];
  const skipped: string[] = [];

  for (const measurement of measurements) {
    const deviceId = measurement.deviceId || "unknown";
    const meterId = deviceMapping.get(deviceId);

    if (!meterId) {
      skipped.push(`${deviceId}: no meter mapping found`);
      continue;
    }

    for (const val of measurement.values || []) {
      // Only ingest power-related fields
      if (!SCHNEIDER_POWER_FIELDS.has(val.name)) continue;

      const powerValue = Number(val.value);
      if (isSpike(powerValue, "strom")) {
        skipped.push(`${deviceId}/${val.name}: spike (${powerValue})`);
        continue;
      }

      readings.push({
        meter_id: meterId,
        tenant_id: tenantId,
        power_value: powerValue,
        energy_type: "strom",
        recorded_at: val.timestamp || payload?.header?.timestamp || new Date().toISOString(),
      });
    }
  }

  if (readings.length === 0) {
    return json({ success: true, inserted: 0, skipped: skipped.length, skipped_details: skipped });
  }

  const { error } = await supabase.from("meter_power_readings").insert(readings);
  if (error) {
    console.error("[schneider-push] DB insert error:", error.message);
    return json({ error: "Database error" }, 500);
  }

  return json({
    success: true,
    inserted: readings.length,
    skipped: skipped.length,
    skipped_details: skipped.length > 0 ? skipped : undefined,
    sender: senderId,
  });
}

/* ── Heartbeat handler ────────────────────────────────────────────────────────── */

async function handleHeartbeat(req: Request): Promise<Response> {
  const authErr = validateApiKey(req);
  if (authErr) return authErr;

  let body: {
    device_name?: string;
    device_type?: string;
    tenant_id?: string;
    location_integration_id?: string;
    local_ip?: string;
    ha_version?: string;
    addon_version?: string;
    offline_buffer_count?: number;
    local_time?: string;
    config?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.tenant_id || !body.device_name) {
    return json({ error: "tenant_id and device_name are required" }, 400);
  }

  const supabase = getSupabase();

  // Upsert by tenant_id + device_name
  const { data: existing } = await supabase
    .from("gateway_devices")
    .select("id")
    .eq("tenant_id", body.tenant_id)
    .eq("device_name", body.device_name)
    .maybeSingle();

  const deviceData = {
    tenant_id: body.tenant_id,
    device_name: body.device_name,
    device_type: body.device_type || "ha-addon",
    local_ip: body.local_ip || null,
    ha_version: body.ha_version || null,
    addon_version: body.addon_version || null,
    offline_buffer_count: body.offline_buffer_count ?? 0,
    local_time: body.local_time || null,
    status: "online",
    last_heartbeat_at: new Date().toISOString(),
    location_integration_id: body.location_integration_id || null,
    config: body.config || {},
  };

  let result;
  if (existing?.id) {
    const { error } = await supabase
      .from("gateway_devices")
      .update(deviceData)
      .eq("id", existing.id);
    if (error) {
      console.error("[gateway-ingest] heartbeat update error:", error.message);
      return json({ error: "Database error" }, 500);
    }
    result = { id: existing.id, action: "updated" };
  } else {
    const { data: inserted, error } = await supabase
      .from("gateway_devices")
      .insert(deviceData)
      .select("id")
      .single();
    if (error) {
      console.error("[gateway-ingest] heartbeat insert error:", error.message);
      return json({ error: "Database error" }, 500);
    }
    result = { id: inserted.id, action: "created" };
  }

  // Return current latest_available_version for update check
  const { data: device } = await supabase
    .from("gateway_devices")
    .select("latest_available_version")
    .eq("id", result.id)
    .single();

  return json({
    success: true,
    ...result,
    latest_available_version: device?.latest_available_version || null,
  });
}

/* ── Gateway backup handler ──────────────────────────────────────────────────── */

async function handleGatewayBackup(req: Request): Promise<Response> {
  const authErr = validateApiKey(req);
  if (authErr) return authErr;

  let body: {
    tenant_id?: string;
    device_name?: string;
    backup_data?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.tenant_id || !body.device_name || !body.backup_data) {
    return json({ error: "tenant_id, device_name, and backup_data are required" }, 400);
  }

  const supabase = getSupabase();
  const jsonStr = JSON.stringify(body.backup_data);
  const sizeBytes = new TextEncoder().encode(jsonStr).length;

  const { error } = await supabase.from("backup_snapshots").insert({
    tenant_id: body.tenant_id,
    backup_type: "gateway",
    status: "completed",
    tables_count: 0,
    rows_count: 0,
    size_bytes: sizeBytes,
    data: {
      version: "1.0",
      type: "gateway-backup",
      device_name: body.device_name,
      created_at: new Date().toISOString(),
      ...body.backup_data,
    },
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });

  if (error) {
    console.error("[gateway-ingest] gateway-backup error:", error.message);
    return json({ error: "Database error" }, 500);
  }

  return json({ success: true, size_bytes: sizeBytes });
}

/* ── Addon version handler ───────────────────────────────────────────────────── */

async function handleAddonVersion(): Promise<Response> {
  // Returns the latest recommended add-on version (could be a secret or config)
  const latestVersion = Deno.env.get("HA_ADDON_LATEST_VERSION") || "1.0.0";
  return json({ success: true, latest_version: latestVersion });
}

/* ── Gateway command relay ───────────────────────────────────────────────────── */

/**
 * Validates either GATEWAY_API_KEY or an authenticated admin user JWT.
 * Returns null on success or a Response on failure.
 */
async function validateApiKeyOrAdmin(req: Request): Promise<Response | null> {
  // Try API key first
  const apiKeyResult = validateApiKey(req);
  if (!apiKeyResult) return null; // API key is valid

  // Fall back to JWT auth for admin users
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return apiKeyResult;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false }, global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  // Check admin role
  const serviceClient = getSupabase();
  const { data: roleData } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["admin", "super_admin"])
    .maybeSingle();

  if (!roleData) return json({ error: "Forbidden – admin role required" }, 403);

  return null; // Authenticated admin
}

async function handleGatewayCommand(req: Request): Promise<Response> {
  const authErr = await validateApiKeyOrAdmin(req);
  if (authErr) return authErr;

  let body: { device_id?: string; command?: string; params?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.device_id || !body.command) {
    return json({ error: "device_id and command are required" }, 400);
  }

  const allowedCommands = ["backup", "update", "restart"];
  if (!allowedCommands.includes(body.command)) {
    return json({ error: `Unknown command. Allowed: ${allowedCommands.join(", ")}` }, 400);
  }

  const supabase = getSupabase();

  // Store command in device config for the add-on to pick up on next heartbeat
  const { data: device, error: fetchErr } = await supabase
    .from("gateway_devices")
    .select("id, config")
    .eq("id", body.device_id)
    .single();

  if (fetchErr || !device) {
    return json({ error: "Device not found" }, 404);
  }

  const currentConfig = (device.config || {}) as Record<string, unknown>;
  const { error } = await supabase
    .from("gateway_devices")
    .update({
      config: {
        ...currentConfig,
        pending_command: body.command,
        pending_command_params: body.params || {},
        pending_command_at: new Date().toISOString(),
      },
    })
    .eq("id", device.id);

  if (error) {
    console.error("[gateway-ingest] gateway-command error:", error.message);
    return json({ error: "Database error" }, 500);
  }

  return json({ success: true, command: body.command, device_id: device.id });
}

/* ── Sync Automations handler (Cloud → Hub) ──────────────────────────────────── */

async function handleSyncAutomations(url: URL): Promise<Response> {
  const tenantId = url.searchParams.get("tenant_id");
  if (!tenantId) {
    return json({ error: "tenant_id parameter required" }, 400);
  }

  const since = url.searchParams.get("since");
  const supabase = getSupabase();

  let query = supabase
    .from("location_automations")
    .select("*, locations!location_automations_location_id_fkey(timezone)")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  if (since) {
    query = query.gt("updated_at", since);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[gateway-ingest] sync-automations error:", error.message);
    return json({ error: "Internal error" }, 500);
  }

  const automations = (data || []).map((auto: any) => ({
    id: auto.id,
    name: auto.name,
    tenant_id: auto.tenant_id,
    location_id: auto.location_id,
    location_integration_id: auto.location_integration_id,
    conditions: auto.conditions,
    actions: auto.actions,
    logic_operator: auto.logic_operator || "AND",
    is_active: auto.is_active,
    actuator_uuid: auto.actuator_uuid,
    action_value: auto.action_value,
    action_type: auto.action_type,
    last_executed_at: auto.last_executed_at,
    updated_at: auto.updated_at,
    location_timezone: auto.locations?.timezone || "Europe/Berlin",
  }));

  return json({ success: true, automations, count: automations.length });
}

/* ── Push Execution Logs handler (Hub → Cloud) ────────────────────────────────── */

async function handlePushExecutionLogs(req: Request): Promise<Response> {
  const authErr = validateApiKey(req);
  if (authErr) return authErr;

  let body: {
    logs?: Array<{
      automation_id: string;
      tenant_id: string;
      status: string;
      error_message?: string;
      actions_executed?: unknown;
      duration_ms?: number;
      trigger_type?: string;
      execution_source?: string;
      executed_at?: string;
    }>;
  };

  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!Array.isArray(body?.logs) || body.logs.length === 0) {
    return json({ error: "logs array is required" }, 400);
  }

  const supabase = getSupabase();

  const rows = body.logs.map((log) => ({
    automation_id: log.automation_id,
    tenant_id: log.tenant_id,
    trigger_type: log.trigger_type || "scheduled",
    status: log.status,
    error_message: log.error_message || null,
    actions_executed: log.actions_executed || null,
    duration_ms: log.duration_ms || null,
    executed_at: log.executed_at || new Date().toISOString(),
  }));

  const { error } = await supabase.from("automation_execution_log").insert(rows);
  if (error) {
    console.error("[gateway-ingest] push-execution-logs error:", error.message);
    return json({ error: "Database error" }, 500);
  }

  return json({ success: true, inserted: rows.length });
}

/* ── Main router ─────────────────────────────────────────────────────────────── */

Deno.serve(async (req) => {
  corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // GET routes
  if (req.method === "GET") {
    const authErr = validateApiKey(req);
    if (authErr) return authErr;
    if (action === "list-locations") return handleListLocations();
    if (action === "list-meters") return handleListMeters(url);
    if (action === "get-daily-totals") return handleGetDailyTotals(url);
    if (action === "get-readings") return handleGetReadings(url);
    if (action === "get-locations-summary") return handleGetLocationsSummary(url);
    if (action === "addon-version") return handleAddonVersion();
    if (action === "sync-automations") return handleSyncAutomations(url);
  }

  // POST routes
  if (req.method === "POST") {
    if (action === "compact-day") return handleCompactDay(req);
    if (action === "schneider-push") return handleSchneiderPush(req);
    if (action === "heartbeat") return handleHeartbeat(req);
    if (action === "gateway-backup") return handleGatewayBackup(req);
    if (action === "gateway-command") return handleGatewayCommand(req);
    if (action === "push-execution-logs") return handlePushExecutionLogs(req);
    if (action === "sync-automations") return handleSyncAutomations(url);

    // Check if the body contains a getSensors action (called by frontend for all integration types).
    // Push-based gateways don't support sensor discovery — return empty list gracefully.
    try {
      const clonedReq = req.clone();
      const body = await clonedReq.json();
      if (body?.action === "getSensors") {
        return json({ success: true, sensors: [], push_gateway: true });
      }
    } catch { /* not JSON or no body – continue to normal routing */ }

    // Fallback: if tenant_id is present and Basic Auth is used, route to Schneider handler
    const hasTenantId = url.searchParams.has("tenant_id");
    const hasBasicAuth = /^basic\s/i.test(req.headers.get("Authorization") || "");
    if (hasTenantId && hasBasicAuth) {
      console.log("[gateway-ingest] Fallback routing to schneider-push (Basic Auth + tenant_id, no action)");
      return handleSchneiderPush(req);
    }

    return handlePostReadings(req);
  }

  return json({ error: "Method not allowed" }, 405);
});
