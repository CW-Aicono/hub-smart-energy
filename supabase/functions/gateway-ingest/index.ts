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
import { recordWorkerHeartbeat } from "../_shared/workerStatus.ts";

// Module-level default for helpers called outside handler context
let corsHeaders: Record<string, string> = getCorsHeaders();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/* ── Auth helper ─────────────────────────────────────────────────────────────── */

/**
 * Hash a string using SHA-256.
 * Kept as utility for future use; no per-device API keys anymore.
 */
async function sha256Hex(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Validates the request authentication.
 * Supports Basic Auth (username/password) and the global GATEWAY_API_KEY.
 * Per-device API keys have been removed.
 *
 * Returns { tenantId } context for Basic Auth requests (used to scope GET
 * routes to the device's own tenant). For the global GATEWAY_API_KEY
 * tenantId is null and the caller is treated as trusted server-to-server.
 */
export interface GatewayAuthContext { tenantId: string | null }

async function validateApiKey(req: Request): Promise<Response | GatewayAuthContext> {
  const gatewayApiKey = Deno.env.get("GATEWAY_API_KEY");
  if (!gatewayApiKey) {
    console.error("[gateway-ingest] GATEWAY_API_KEY secret not configured");
    return json({ error: "Service misconfigured" }, 500);
  }
  const authHeader = req.headers.get("Authorization") || "";

  // 1) Basic Auth (username + password against gateway_devices)
  if (/^Basic\s+/i.test(authHeader)) {
    const ctx = await getDeviceFromBasicAuth(req);
    if (ctx) return { tenantId: ctx.tenant_id };
    return json({ error: "Unauthorized" }, 401);
  }

  const providedKey = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!providedKey) {
    return json({ error: "Unauthorized" }, 401);
  }

  // 2) Global GATEWAY_API_KEY (legacy server-to-server)
  if (providedKey === gatewayApiKey) {
    return { tenantId: null };
  }

  return json({ error: "Unauthorized" }, 401);
}

function isAuthError(v: Response | GatewayAuthContext): v is Response {
  return v instanceof Response;
}

/**
 * Parses Basic-Auth header → { username, password }.
 */
function parseBasicAuth(req: Request): { username: string; password: string } | null {
  const h = req.headers.get("Authorization") || "";
  const m = h.match(/^Basic\s+(.+)$/i);
  if (!m) return null;
  try {
    const decoded = atob(m[1].trim());
    const idx = decoded.indexOf(":");
    if (idx < 0) return null;
    return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
  } catch {
    return null;
  }
}

function normalizeMac(input: string | null): string {
  return (input || "").toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 12);
}

/**
 * bcrypt verify – uses bcryptjs (pure JS) via npm: specifier.
 */
async function bcryptVerify(plain: string, hash: string): Promise<boolean> {
  try {
    const bcrypt: any = await import("npm:bcryptjs@2.4.3");
    const compare = bcrypt.compare ?? bcrypt.default?.compare;
    return await compare(plain, hash);
  } catch (e) {
    console.error("[gateway-ingest] bcrypt verify error:", e);
    return false;
  }
}

/**
 * Looks up a gateway_devices row by Basic-Auth username + verified password.
 * Returns device context (may have tenant_id=null when pending_assignment).
 */
async function getDeviceFromBasicAuth(req: Request): Promise<
  { device_id: string; tenant_id: string | null; mac_address: string | null; assignment_status: "assigned" | "pending_assignment" } | null
> {
  const creds = parseBasicAuth(req);
  if (!creds || !creds.username || !creds.password) return null;
  const requestMac = normalizeMac(req.headers.get("x-gateway-mac"));
  const supabase = getSupabase();
  const { data: devices } = await supabase
    .from("gateway_devices")
    .select("id, tenant_id, mac_address, gateway_password_hash")
    .eq("gateway_username", creds.username)
    .limit(requestMac ? 10 : 2);
  const device = (devices || []).find((row) => {
    if (!requestMac) return true;
    return normalizeMac(row.mac_address) === requestMac;
  });
  if (!device || !device.gateway_password_hash) return null;
  const ok = await bcryptVerify(creds.password, device.gateway_password_hash);
  if (!ok) return null;
  return {
    device_id: device.id,
    tenant_id: device.tenant_id,
    mac_address: device.mac_address,
    assignment_status: device.tenant_id ? "assigned" : "pending_assignment",
  };
}

/**
 * Extracts device context from Basic-Auth only.
 * Per-device API keys are no longer supported.
 */
async function getDeviceFromApiKey(req: Request): Promise<{ device_id: string; tenant_id: string | null } | null> {
  const basic = await getDeviceFromBasicAuth(req);
  if (basic) return { device_id: basic.device_id, tenant_id: basic.tenant_id };
  return null;
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

async function handleListLocations(scopeTenantId: string | null): Promise<Response> {
  const supabase = getSupabase();
  let query = supabase
    .from("locations")
    .select("id, tenant_id, name, address, city, postal_code, country, type, usage_type, energy_sources, latitude, longitude")
    .eq("is_archived", false)
    .order("name");

  if (scopeTenantId) query = query.eq("tenant_id", scopeTenantId);

  const { data, error } = await query;
  if (error) {
    console.error("[gateway-ingest] list-locations error:", error.message);
    return json({ success: false, error: "Internal error" }, 500);
  }
  return json({ success: true, locations: data || [] });
}

async function handleListMeters(url: URL, scopeTenantId: string | null): Promise<Response> {
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

  if (scopeTenantId) query = query.eq("tenant_id", scopeTenantId);
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

async function handleGetDailyTotals(url: URL, scopeTenantId: string | null): Promise<Response> {
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

  // If explicit meter_ids supplied, restrict them to scope tenant
  let resolvedMeterIds = meterIds;
  if (resolvedMeterIds.length > 0 && scopeTenantId) {
    const { data: own } = await supabase
      .from("meters")
      .select("id")
      .eq("tenant_id", scopeTenantId)
      .in("id", resolvedMeterIds);
    resolvedMeterIds = (own || []).map((m: { id: string }) => m.id);
  }

  if (resolvedMeterIds.length === 0 && locationId) {
    let q = supabase
      .from("meters")
      .select("id")
      .eq("location_id", locationId)
      .eq("is_archived", false);
    if (scopeTenantId) q = q.eq("tenant_id", scopeTenantId);
    const { data: meters, error: mErr } = await q;
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

async function handleGetReadings(url: URL, scopeTenantId: string | null): Promise<Response> {
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
  if (resolvedMeterIds.length > 0 && scopeTenantId) {
    const { data: own } = await supabase
      .from("meters")
      .select("id")
      .eq("tenant_id", scopeTenantId)
      .in("id", resolvedMeterIds);
    resolvedMeterIds = (own || []).map((m: { id: string }) => m.id);
  }
  if (resolvedMeterIds.length === 0 && locationId) {
    let q = supabase
      .from("meters")
      .select("id")
      .eq("location_id", locationId)
      .eq("is_archived", false);
    if (scopeTenantId) q = q.eq("tenant_id", scopeTenantId);
    const { data: meters, error: mErr } = await q;
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


async function handleGetLocationsSummary(url: URL, scopeTenantId: string | null): Promise<Response> {
  const supabase = getSupabase();
  const tenantId = scopeTenantId ?? url.searchParams.get("tenant_id");

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
  const _auth = await validateApiKey(req);
  if (isAuthError(_auth)) return _auth;

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
  const _auth = await validateApiKey(req);
  if (isAuthError(_auth)) return _auth;

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
  const _auth = await validateApiKey(req);
  if (isAuthError(_auth)) return _auth;

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
  const _auth = await validateApiKey(req);
  if (isAuthError(_auth)) return _auth;

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

  // Either MAC or (tenant_id + device_name) is required (legacy support)
  if (!(body as any).mac_address && (!body.tenant_id || !body.device_name)) {
    return json({ error: "mac_address or (tenant_id + device_name) required" }, 400);
  }

  // Per-device key tenant_id cross-check
  const deviceCtx = await getDeviceFromApiKey(req);
  if (deviceCtx && deviceCtx.tenant_id && body.tenant_id && deviceCtx.tenant_id !== body.tenant_id) {
    console.warn(`[gateway-ingest] Per-device key tenant mismatch: key=${deviceCtx.tenant_id}, body=${body.tenant_id}`);
    return json({ error: "Tenant mismatch – API key does not belong to this tenant" }, 403);
  }

  const supabase = getSupabase();

  // Normalize MAC (lowercase 12 hex)
  const macRaw = (body as any).mac_address as string | undefined;
  const mac = macRaw ? macRaw.toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 12) : "";
  const macValid = mac.length === 12;

  // Lookup existing device: prefer MAC, fallback to (tenant_id + device_name) for legacy
  let existing: { id: string; tenant_id: string | null; config: any; latest_available_version: any; location_integration_id: string | null } | null = null;
  if (macValid) {
    const { data } = await supabase
      .from("gateway_devices")
      .select("id, tenant_id, config, latest_available_version, location_integration_id")
      .eq("mac_address", mac)
      .maybeSingle();
    existing = data as any;
  }
  if (!existing && body.tenant_id && body.device_name) {
    const { data } = await supabase
      .from("gateway_devices")
      .select("id, tenant_id, config, latest_available_version, location_integration_id")
      .eq("tenant_id", body.tenant_id)
      .eq("device_name", body.device_name)
      .maybeSingle();
    existing = data as any;
  }

  // Pending assignment check: device known by MAC but no tenant_id assigned
  const effectiveTenantId = existing?.tenant_id ?? body.tenant_id ?? null;
  const isPending = !effectiveTenantId;

  // Extract pending command BEFORE overwriting config
  const existingConfig = (existing?.config || {}) as Record<string, unknown>;
  const pendingCommand = existingConfig.pending_command as string | undefined;
  const pendingCommandParams = existingConfig.pending_command_params as Record<string, unknown> | undefined;

  const mergedConfig = { ...(body.config || {}) };

  // Auto-resolve location_integration_id (skip when pending)
  let resolvedLiId: string | null = body.location_integration_id || existing?.location_integration_id || null;
  if (!resolvedLiId && effectiveTenantId) {
    const { data: locations } = await supabase
      .from("locations")
      .select("id")
      .eq("tenant_id", effectiveTenantId);
    if (locations && locations.length > 0) {
      const locationIds = locations.map((l: any) => l.id);
      const { data: lis } = await supabase
        .from("location_integrations")
        .select("id, integration_id, integrations!inner(type)")
        .in("location_id", locationIds)
        .eq("is_enabled", true);
      if (lis) {
        const haLi = lis.find((li: any) => li.integrations?.type === "home_assistant");
        if (haLi) {
          resolvedLiId = haLi.id;
          console.log(`[heartbeat] Auto-resolved location_integration_id=${resolvedLiId} for device ${body.device_name}`);
        }
      }
    }
  }

  const deviceData: Record<string, unknown> = {
    tenant_id: effectiveTenantId,
    device_name: body.device_name || "aicono-ems",
    device_type: body.device_type || "ha-addon",
    local_ip: body.local_ip || null,
    ha_version: body.ha_version || null,
    addon_version: body.addon_version || null,
    offline_buffer_count: body.offline_buffer_count ?? 0,
    local_time: body.local_time || null,
    status: isPending ? "pending_assignment" : "online",
    last_heartbeat_at: new Date().toISOString(),
    location_integration_id: resolvedLiId,
    config: mergedConfig,
  };
  if (macValid) deviceData.mac_address = mac;
  const usernameRaw = (body as any).gateway_username as string | undefined;
  if (usernameRaw) deviceData.gateway_username = usernameRaw;

  // Upsert: prefer mac_address as conflict target when MAC is set
  let upserted: { id: string } | null = null;
  let upsertErr: any = null;
  if (existing?.id) {
    const { data, error } = await supabase
      .from("gateway_devices")
      .update(deviceData)
      .eq("id", existing.id)
      .select("id")
      .single();
    upserted = data as any; upsertErr = error;
  } else if (macValid) {
    const { data, error } = await supabase
      .from("gateway_devices")
      .upsert({ ...deviceData, mac_address: mac }, { onConflict: "mac_address" })
      .select("id")
      .single();
    upserted = data as any; upsertErr = error;
  } else if (effectiveTenantId && body.device_name) {
    const { data, error } = await supabase
      .from("gateway_devices")
      .insert(deviceData)
      .select("id")
      .single();
    upserted = data as any; upsertErr = error;
  } else {
    return json({ error: "mac_address or (tenant_id + device_name) required" }, 400);
  }
  if (upsertErr) {
    console.error("[gateway-ingest] heartbeat upsert error:", upsertErr.message);
    return json({ error: "Database error" }, 500);
  }
  const result = {
    id: upserted!.id,
    action: existing?.id ? "updated" : "created",
  };

  const responseData: Record<string, unknown> = {
    success: true,
    ...result,
    latest_available_version: existing?.latest_available_version || null,
    assignment_status: isPending ? "pending_assignment" : "assigned",
  };

  // Deliver ui_pin_hash to the gateway for local PIN protection
  if (existingConfig.ui_pin_hash) {
    responseData.ui_pin_hash = existingConfig.ui_pin_hash;
  }

  // Deliver pending command to the gateway
  if (pendingCommand) {
    responseData.pending_command = pendingCommand;
    responseData.pending_command_params = pendingCommandParams || {};
    console.log(`[gateway-ingest] Delivering pending command '${pendingCommand}' to device ${result.id}`);
  }

  // Also bump the global worker heartbeat so the WORKER_ACTIVE feature flag
  // in loxone-api/shelly-api knows a writer is alive.
  try { await recordWorkerHeartbeat(supabase); } catch (e) { console.warn("[heartbeat] worker-heartbeat upsert failed:", e); }

  return json(responseData);
}

/* ── Dedicated worker heartbeat (Hetzner gateway-worker) ─────────────────────── */
/**
 * Lightweight endpoint for the central Hetzner gateway worker that doesn't have
 * a per-device gateway_devices row. Just bumps system_settings.worker_last_heartbeat
 * so loxone-api can defer the write path to the worker.
 *
 * POST ?action=worker-heartbeat   Body: { worker_id?: string, version?: string }
 */
async function handleWorkerHeartbeat(req: Request): Promise<Response> {
  const _auth = await validateApiKey(req);
  if (isAuthError(_auth)) return _auth;

  let body: { worker_id?: string; version?: string } = {};
  try { body = await req.json(); } catch { /* body optional */ }

  const supabase = getSupabase();
  await recordWorkerHeartbeat(supabase);

  // Optional: also persist worker metadata for the admin widget
  if (body.worker_id || body.version) {
    await supabase
      .from("system_settings")
      .upsert(
        { key: "worker_meta", value: JSON.stringify({ worker_id: body.worker_id, version: body.version, last_seen: new Date().toISOString() }) },
        { onConflict: "key" },
      );
  }

  return json({ success: true, recorded_at: new Date().toISOString() });
}

/* ── Bridge-Worker (Variante B): Heartbeat & Event-Log ─────────────────────── */

/**
 * POST ?action=bridge-heartbeat
 * Body: { worker_name: string, version?: string, host?: string,
 *         status?: "online"|"degraded"|"offline", last_error?: string|null,
 *         links_state?: Array<{ miniserver_serial: string,
 *                               last_connected_at?: string, last_event_at?: string }> }
 *
 * Aktualisiert `bridge_workers.last_heartbeat_at` (anhand worker_name) und
 * optional die Zeitstempel der zugehörigen `bridge_miniserver_links`.
 */
async function handleBridgeHeartbeat(req: Request): Promise<Response> {
  const _auth = await validateApiKey(req);
  if (isAuthError(_auth)) return _auth;

  let body: {
    worker_name?: string;
    version?: string;
    host?: string;
    status?: string;
    last_error?: string | null;
    links_state?: Array<{
      miniserver_serial: string;
      last_connected_at?: string;
      last_event_at?: string;
    }>;
  };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  if (!body.worker_name) return json({ error: "worker_name required" }, 400);

  const supabase = getSupabase();
  const nowIso = new Date().toISOString();

  const patch: Record<string, unknown> = {
    last_heartbeat_at: nowIso,
    status: body.status ?? "online",
  };
  if (body.version !== undefined) patch.version = body.version;
  if (body.host !== undefined) patch.host = body.host;
  if (body.last_error !== undefined) patch.last_error = body.last_error;

  const { data: worker, error } = await supabase
    .from("bridge_workers")
    .update(patch)
    .eq("name", body.worker_name)
    .select("id")
    .maybeSingle();

  if (error || !worker) {
    return json({ success: false, error: error?.message ?? "worker not found" }, 404);
  }

  // Optional: pro Miniserver Zeitstempel nachziehen
  if (Array.isArray(body.links_state) && body.links_state.length > 0) {
    for (const link of body.links_state) {
      if (!link.miniserver_serial) continue;
      const linkPatch: Record<string, unknown> = {};
      if (link.last_connected_at) linkPatch.last_connected_at = link.last_connected_at;
      if (link.last_event_at) linkPatch.last_event_at = link.last_event_at;
      if (Object.keys(linkPatch).length === 0) continue;
      await supabase
        .from("bridge_miniserver_links")
        .update(linkPatch)
        .eq("worker_id", worker.id)
        .eq("miniserver_serial", link.miniserver_serial);
    }
  }

  return json({ success: true, worker_id: worker.id, recorded_at: nowIso });
}

/**
 * POST ?action=bridge-log-event
 * Body: { worker_name: string, severity?: "debug"|"info"|"warn"|"error",
 *         event_type: string, message?: string, details?: any,
 *         miniserver_serial?: string }
 *
 * Schreibt einen Eintrag in `bridge_event_log` (Retention: 7 Tage).
 * Dient als Diagnose-Quelle für stille WebSocket-Abbrüche / Token-Refresh-Fehler.
 */
async function handleBridgeLogEvent(req: Request): Promise<Response> {
  const _auth = await validateApiKey(req);
  if (isAuthError(_auth)) return _auth;

  let body: {
    worker_name?: string;
    severity?: "debug" | "info" | "warn" | "error";
    event_type?: string;
    message?: string;
    details?: unknown;
    miniserver_serial?: string;
  };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  if (!body.worker_name || !body.event_type) {
    return json({ error: "worker_name and event_type required" }, 400);
  }

  const supabase = getSupabase();

  // Worker + (optional) Link auflösen
  const { data: worker } = await supabase
    .from("bridge_workers")
    .select("id")
    .eq("name", body.worker_name)
    .maybeSingle();

  let linkId: string | null = null;
  let tenantId: string | null = null;
  if (worker && body.miniserver_serial) {
    const { data: link } = await supabase
      .from("bridge_miniserver_links")
      .select("id, tenant_id")
      .eq("worker_id", worker.id)
      .eq("miniserver_serial", body.miniserver_serial)
      .maybeSingle();
    if (link) { linkId = link.id; tenantId = link.tenant_id ?? null; }
  }

  const { error } = await supabase.from("bridge_event_log").insert({
    worker_id: worker?.id ?? null,
    link_id: linkId,
    tenant_id: tenantId,
    severity: body.severity ?? "info",
    event_type: body.event_type,
    message: body.message ?? null,
    details: body.details ?? null,
  });

  if (error) return json({ success: false, error: error.message }, 500);
  return json({ success: true });
}

/**
 * POST ?action=bridge-readings
 * Body: {
 *   worker_name: string,
 *   readings: [{ miniserver_serial, sensor_uuid, value, recorded_at? }]
 * }
 * Schreibt die Roh-Werte in `bridge_raw_samples` (Ringpuffer, 24 h).
 * Aggregation in die Schatten-Tabellen passiert separat in der
 * Edge-Function `bridge-aggregator` (pg_cron, alle 5 Min).
 */
async function handleBridgeReadings(req: Request): Promise<Response> {
  const _auth = await validateApiKey(req);
  if (isAuthError(_auth)) return _auth;

  let body: {
    worker_name?: string;
    readings?: Array<{
      miniserver_serial?: string;
      sensor_uuid?: string;
      value?: number;
      recorded_at?: string;
      role?: "pwr" | "today" | "total" | "month" | "year" | "soc";
    }>;
  };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  if (!body.worker_name || !Array.isArray(body.readings) || body.readings.length === 0) {
    return json({ error: "worker_name and non-empty readings[] required" }, 400);
  }

  const supabase = getSupabase();

  const { data: worker } = await supabase
    .from("bridge_workers")
    .select("id")
    .eq("name", body.worker_name)
    .maybeSingle();
  if (!worker) return json({ error: "unknown worker_name" }, 404);

  // Link-Cache pro Aufruf (1 DB-Query je Miniserver, nicht je Reading)
  const linkCache = new Map<string, { id: string; tenant_id: string | null }>();
  const serials = [...new Set(body.readings.map(r => r.miniserver_serial).filter(Boolean) as string[])];
  if (serials.length > 0) {
    const { data: links } = await supabase
      .from("bridge_miniserver_links")
      .select("id, tenant_id, miniserver_serial")
      .eq("worker_id", worker.id)
      .in("miniserver_serial", serials);
    for (const l of links ?? []) {
      linkCache.set(l.miniserver_serial, { id: l.id, tenant_id: l.tenant_id ?? null });
    }
  }

  // Phase 7: rollenbasiertes Routing
  //  - role="pwr" (Default)  → bridge_raw_samples (für 5-Min-Aggregator) + Broadcast
  //  - role="soc"            → energy_storages.current_soc_pct + Broadcast
  //  - andere Rollen          → nur Broadcast (kein DB-Write); UI nutzt den Wert live in KPI-Kacheln
  type Role = "pwr" | "today" | "total" | "month" | "year" | "soc";
  const rawRows: any[] = [];
  const broadcastRows: Array<{ tenant_id: string | null; uuid: string; value: number; at: string; role: Role }> = [];
  const socRows: Array<{ tenant_id: string; uuid: string; value: number; at: string }> = [];
  const socReadingRows: Array<{ storage_id: string; tenant_id: string; sensor_uuid: string; soc_pct: number; recorded_at: string; source: string }> = [];
  let skipped = 0;
  for (const r of body.readings) {
    if (!r.miniserver_serial || !r.sensor_uuid || typeof r.value !== "number" || !isFinite(r.value)) {
      skipped++;
      continue;
    }
    const role: Role = (r.role as Role) ?? "pwr";
    const link = linkCache.get(r.miniserver_serial);
    const uuid = r.sensor_uuid.toLowerCase();
    const at = r.recorded_at ?? new Date().toISOString();
    broadcastRows.push({ tenant_id: link?.tenant_id ?? null, uuid, value: r.value, at, role });
    if (role === "pwr") {
      rawRows.push({
        worker_id: worker.id,
        link_id: link?.id ?? null,
        tenant_id: link?.tenant_id ?? null,
        miniserver_serial: r.miniserver_serial,
        uuid,
        value: r.value,
        received_at: at,
      });
    } else if (role === "soc") {
      if (link?.tenant_id && r.value >= 0 && r.value <= 100) {
        socRows.push({ tenant_id: link.tenant_id, uuid, value: r.value, at });
      }
    }
  }

  // Power-Werte in bridge_raw_samples persistieren (für 5-Min-Aggregator).
  if (rawRows.length > 0) {
    const { error } = await supabase.from("bridge_raw_samples").insert(rawRows);
    if (error) return json({ success: false, error: error.message }, 500);
  }

  // SOC-Werte persistieren: Loxone liefert Slvl am Speicher-Zählerblock. Der Worker
  // sendet deshalb die Speicher-Block-UUID; hier wird sie auf meter → storage gemappt.
  let socUpdated = 0;
  if (socRows.length > 0) {
    const tenants = [...new Set(socRows.map((r) => r.tenant_id))];
    const uuids = [...new Set(socRows.map((r) => r.uuid))];
    const { data: meters } = await supabase
      .from("meters")
      .select("id, tenant_id, location_id, sensor_uuid")
      .in("tenant_id", tenants)
      .in("sensor_uuid", uuids)
      .eq("is_archived", false);

    for (const row of socRows) {
      const meter = (meters ?? []).find((m: any) => m.tenant_id === row.tenant_id && String(m.sensor_uuid).toLowerCase() === row.uuid);
      if (!meter?.location_id) continue;

      const { data: storages } = await supabase
        .from("energy_storages")
        .select("id, power_meter_id, soc_sensor_uuid")
        .eq("tenant_id", row.tenant_id)
        .eq("location_id", meter.location_id);

      const storage = (storages ?? []).find((s: any) => s.power_meter_id === meter.id)
        ?? (storages ?? []).find((s: any) => String(s.soc_sensor_uuid ?? "").toLowerCase() === row.uuid)
        ?? (storages ?? []).find((s: any) => !s.power_meter_id);
      if (!storage) continue;

      const patch: Record<string, unknown> = {
        current_soc_pct: row.value,
        soc_updated_at: row.at,
      };
      if (storage.soc_sensor_uuid !== row.uuid) patch.soc_sensor_uuid = row.uuid;
      if (storage.power_meter_id !== meter.id) patch.power_meter_id = meter.id;

      const { error: socErr } = await supabase
        .from("energy_storages")
        .update(patch)
        .eq("id", storage.id);
      if (socErr) {
        console.warn(`[bridge-readings] SOC update failed for ${row.uuid}: ${socErr.message}`);
      } else {
        socReadingRows.push({
          storage_id: storage.id,
          tenant_id: row.tenant_id,
          sensor_uuid: row.uuid,
          soc_pct: row.value,
          recorded_at: row.at,
          source: "bridge_readings",
        });
        socUpdated++;
      }
    }
  }

  if (socReadingRows.length > 0) {
    const { error: socReadingsErr } = await supabase
      .from("storage_soc_readings")
      .insert(socReadingRows);
    if (socReadingsErr) {
      console.warn(`[bridge-readings] SOC history insert failed: ${socReadingsErr.message}`);
    }
  }

  // Realtime-Broadcast pro Tenant: Power + Energiestände (today/total/...) zusammen.
  // UI unterscheidet anhand der `role`, welches Feld zu aktualisieren ist.
  try {
    const byTenant = new Map<string, Array<{ uuid: string; value: number; at: string; role: Role }>>();
    for (const r of broadcastRows) {
      if (!r.tenant_id) continue;
      const arr = byTenant.get(r.tenant_id) ?? [];
      arr.push({ uuid: r.uuid, value: r.value, at: r.at, role: r.role });
      byTenant.set(r.tenant_id, arr);
    }
    if (byTenant.size > 0) {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const messages = [...byTenant.entries()].map(([tenantId, events]) => ({
        topic: `loxone-live-${tenantId}`,
        event: "readings",
        payload: { events },
        private: false,
      }));
      fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
        },
        body: JSON.stringify({ messages }),
      }).then(async (r) => {
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          console.error(`[bridge-readings] broadcast HTTP ${r.status}: ${txt}`);
        } else {
          console.log(`[bridge-readings] broadcast ok: ${messages.length} topic(s), ${broadcastRows.length} event(s) (raw_inserted=${rawRows.length}, soc_updated=${socUpdated})`);
        }
      }).catch((e) => console.error("[bridge-readings] broadcast failed:", e?.message ?? e));
    }
  } catch (e) {
    console.error("[bridge-readings] broadcast prep error:", (e as Error).message);
  }

  return json({ success: true, inserted: rawRows.length, broadcast: broadcastRows.length, soc_updated: socUpdated, skipped });
}

/* ── Loxone Remote-Connect WebSocket Feldtest ───────────────────────────────── */


/**
 * GET ?action=list-loxone-ws-meters
 * Liefert ausschließlich Loxone-Zähler an Standort-Integrationen mit
 * loxone_remote_connect_ws_enabled = TRUE. Wird vom Loxone-WS-Worker
 * auf Hetzner gepollt (alle 5 Min), um die Test-Tenants zu kennen.
 */
async function handleListLoxoneWsMeters(): Promise<Response> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("meters")
    .select(`
      id, name, energy_type, sensor_uuid, tenant_id, location_integration_id,
      location_integration:location_integrations!meters_location_integration_id_fkey (
        id, config, loxone_remote_connect_ws_enabled,
        integration:integrations!location_integrations_integration_id_fkey ( type )
      )
    `)
    .eq("is_archived", false)
    .not("sensor_uuid", "is", null);

  if (error) {
    console.error("[gateway-ingest] list-loxone-ws-meters error:", error.message);
    return json({ success: false, error: "Internal error" }, 500);
  }

  const filtered = (data || []).filter((m: any) => {
    const li = m.location_integration;
    if (!li || li.loxone_remote_connect_ws_enabled !== true) return false;
    const type = li.integration?.type;
    return type === "loxone" || type === "loxone_miniserver";
  });

  return json({ success: true, meters: filtered });
}

/**
 * POST ?action=ws-session-start
 * Body: { tenant_id, location_integration_id, worker_host? }
 * Antwort: { success, session_id }
 */
async function handleWsSessionStart(req: Request): Promise<Response> {
  const _auth = await validateApiKey(req);
  if (isAuthError(_auth)) return _auth;

  let body: { tenant_id?: string; location_integration_id?: string; worker_host?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  if (!body.tenant_id || !body.location_integration_id) {
    return json({ error: "tenant_id and location_integration_id required" }, 400);
  }

  const supabase = getSupabase();

  // A) Vor dem Anlegen einer neuen Session alle noch offenen Vorgänger-Zeilen
  //    derselben (tenant_id, location_integration_id) schließen.
  //    Verhindert Zombie-Rows mit ended_at=NULL, die im Monitor als "200+ Sitzungen" zählen.
  const { error: closeErr } = await supabase
    .rpc("close_orphan_loxone_ws_sessions", {
      _tenant_id: body.tenant_id,
      _location_integration_id: body.location_integration_id,
    });
  if (closeErr) {
    console.warn("[gateway-ingest] ws-session-start orphan close warning:", closeErr.message);
  }

  const { data, error } = await supabase
    .from("loxone_ws_session_log")
    .insert({
      tenant_id: body.tenant_id,
      location_integration_id: body.location_integration_id,
      worker_host: body.worker_host || null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[gateway-ingest] ws-session-start error:", error.message);
    return json({ error: "Database error" }, 500);
  }

  return json({ success: true, session_id: data.id });
}


/**
 * POST ?action=ws-session-end
 * Body: { session_id, disconnect_reason?, events_received?, reconnect_count? }
 */
async function handleWsSessionEnd(req: Request): Promise<Response> {
  const _auth = await validateApiKey(req);
  if (isAuthError(_auth)) return _auth;

  let body: {
    session_id?: string;
    disconnect_reason?: string;
    events_received?: number;
    reconnect_count?: number;
  };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  if (!body.session_id) return json({ error: "session_id required" }, 400);

  const supabase = getSupabase();
  const { error } = await supabase
    .from("loxone_ws_session_log")
    .update({
      ended_at: new Date().toISOString(),
      disconnect_reason: body.disconnect_reason || null,
      events_received: body.events_received ?? 0,
      reconnect_count: body.reconnect_count ?? 0,
    })
    .eq("id", body.session_id);

  if (error) {
    console.error("[gateway-ingest] ws-session-end error:", error.message);
    return json({ error: "Database error" }, 500);
  }

  return json({ success: true });
}

/**
 * POST ?action=ws-session-heartbeat
 * Body: { session_id, events_received?, reconnect_count? }
 * Hält die aktive WS-Session "live" (updated_at) und aktualisiert den Event-Zähler.
 */
async function handleWsSessionHeartbeat(req: Request): Promise<Response> {
  const _auth = await validateApiKey(req);
  if (isAuthError(_auth)) return _auth;

  let body: { session_id?: string; events_received?: number; reconnect_count?: number };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!body.session_id) return json({ error: "session_id required" }, 400);

  const supabase = getSupabase();
  const { error } = await supabase
    .from("loxone_ws_session_log")
    .update({
      updated_at: new Date().toISOString(),
      events_received: body.events_received ?? 0,
      reconnect_count: body.reconnect_count ?? 0,
    })
    .eq("id", body.session_id)
    .is("ended_at", null);

  if (error) {
    console.error("[gateway-ingest] ws-session-heartbeat error:", error.message);
    return json({ error: "Database error" }, 500);
  }
  return json({ success: true });
}

/* ── Gateway backup handler ──────────────────────────────────────────────────── */

async function handleGatewayBackup(req: Request): Promise<Response> {
  const _auth = await validateApiKey(req);
  if (isAuthError(_auth)) return _auth;

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
  const apiKeyResult = await validateApiKey(req);
  if (!isAuthError(apiKeyResult)) return null; // API key is valid

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
  const { data: device, error: fetchErr } = await supabase
    .from("gateway_devices")
    .select("id, tenant_id, status, config")
    .eq("id", body.device_id)
    .single();

  if (fetchErr || !device) {
    return json({ error: "Device not found" }, 404);
  }

  const currentConfig = (device.config || {}) as Record<string, unknown>;
  const pendingCommand = currentConfig.pending_command as string | undefined;
  const pendingCommandAt = currentConfig.pending_command_at as string | undefined;

  if (pendingCommand && pendingCommand === body.command && pendingCommandAt) {
    const pendingAgeMs = Date.now() - new Date(pendingCommandAt).getTime();
    if (Number.isFinite(pendingAgeMs) && pendingAgeMs < 5 * 60 * 1000) {
      return json({ success: true, command: body.command, device_id: device.id, status: "already_pending" });
    }
  }

  if (device.status === "online" && device.tenant_id) {
    const { data: existingQueued } = await supabase
      .from("gateway_commands")
      .select("id")
      .eq("gateway_device_id", device.id)
      .in("status", ["pending", "sent"])
      .in("command_type", [body.command, "execute_actuator"])
      .limit(1);

    if ((existingQueued?.length ?? 0) > 0) {
      return json({ success: true, command: body.command, device_id: device.id, status: "already_queued" });
    }

    const { error: queueError } = await supabase
      .from("gateway_commands")
      .insert({
        tenant_id: device.tenant_id,
        gateway_device_id: device.id,
        command_type: body.command,
        payload: body.params || {},
        status: "pending",
      });

    if (queueError) {
      console.error("[gateway-ingest] gateway-command queue error:", queueError.message);
      return json({ error: "Database error" }, 500);
    }

    return json({ success: true, command: body.command, device_id: device.id, status: "queued" });
  }

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
    console.error("[gateway-ingest] gateway-command pending fallback error:", error.message);
    return json({ error: "Database error" }, 500);
  }

  return json({ success: true, command: body.command, device_id: device.id, status: "scheduled_for_heartbeat" });
}

/* ── Sync Automations handler (Cloud → Hub) ──────────────────────────────────── */

async function handleSyncAutomations(url: URL, req: Request): Promise<Response> {
  const tenantId = url.searchParams.get("tenant_id");
  if (!tenantId) {
    return json({ error: "tenant_id parameter required" }, 400);
  }

  const since = url.searchParams.get("since");
  const supabase = getSupabase();

  // Resolve device's location AND integration to filter automations
  let locationId: string | null = null;
  let locationIntegrationId: string | null = null;

  // 1) Try per-device API key
  const deviceCtx = await getDeviceFromApiKey(req);
  if (deviceCtx) {
    const { data: device } = await supabase
      .from("gateway_devices")
      .select("location_integration_id")
      .eq("id", deviceCtx.device_id)
      .maybeSingle();

    if (device?.location_integration_id) {
      locationIntegrationId = device.location_integration_id;
    }
  }

  // 2) Fallback: resolve via device_name + tenant_id (global API key scenario)
  if (!locationIntegrationId) {
    const deviceName = url.searchParams.get("device_name");
    if (deviceName && tenantId) {
      const { data: device } = await supabase
        .from("gateway_devices")
        .select("location_integration_id")
        .eq("tenant_id", tenantId)
        .eq("device_name", deviceName)
        .maybeSingle();
      if (device?.location_integration_id) {
        locationIntegrationId = device.location_integration_id;
      }
    }
  }

  // 3) Explicit params
  if (!locationIntegrationId) {
    locationIntegrationId = url.searchParams.get("location_integration_id");
  }
  if (!locationId) {
    locationId = url.searchParams.get("location_id");
  }

  // Resolve locationId from integration if needed
  if (locationIntegrationId && !locationId) {
    const { data: li } = await supabase
      .from("location_integrations")
      .select("location_id")
      .eq("id", locationIntegrationId)
      .maybeSingle();
    locationId = li?.location_id || null;
  }

  console.log(`[sync-automations] tenant=${tenantId} li=${locationIntegrationId} loc=${locationId}`);

  // Sync ALL automations (active + inactive) so the local engine can manage state
  let query = supabase
    .from("location_automations")
    .select("*, locations!location_automations_location_id_fkey(timezone)")
    .eq("tenant_id", tenantId);

  // Filter by location_integration_id (preferred – only automations this gateway can execute)
  if (locationIntegrationId) {
    query = query.eq("location_integration_id", locationIntegrationId);
  } else if (locationId) {
    // Fallback: filter by location if integration couldn't be resolved
    query = query.eq("location_id", locationId);
  }

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

  return json({ success: true, automations, count: automations.length, location_id: locationId });
}

/* ── Push Execution Logs handler (Hub → Cloud) ────────────────────────────────── */

async function handlePushExecutionLogs(req: Request): Promise<Response> {
  const _auth = await validateApiKey(req);
  if (isAuthError(_auth)) return _auth;

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
    execution_source: log.execution_source || "local",
    executed_at: log.executed_at || new Date().toISOString(),
  }));

  const { error } = await supabase.from("automation_execution_log").insert(rows);
  if (error) {
    console.error("[gateway-ingest] push-execution-logs error:", error.message);
    return json({ error: "Database error" }, 500);
  }

  return json({ success: true, inserted: rows.length });
}

/* ── Device Inventory Snapshot (HA Add-on -> Cloud) ──────────────────────────── */
/**
 * POST ?action=device-snapshot
 * Body: { mac_address?, devices: [{ entity_id, domain, category, friendly_name, state, unit, device_class, last_updated }] }
 * Speichert/aktualisiert das vollständige lokale Geräte-Inventar des Add-ons,
 * damit die Cloud-UI Sensoren/Aktoren/Zähler zur Zuordnung anbieten kann.
 */
async function handleDeviceSnapshot(req: Request): Promise<Response> {
  const authErr = await validateApiKey(req);
  if (authErr) {
    console.warn("[device-snapshot] auth failed");
    return authErr;
  }

  let bodyText = "";
  let body: { mac_address?: string; devices?: any[] };
  try {
    bodyText = await req.text();
    body = JSON.parse(bodyText);
  } catch (e) {
    console.error("[device-snapshot] invalid JSON. Length=", bodyText.length, "first200=", bodyText.slice(0, 200));
    return json({ error: "Invalid JSON", stage: "parse", length: bodyText.length }, 400);
  }

  if (!Array.isArray(body?.devices)) {
    console.error("[device-snapshot] devices not array. keys=", Object.keys(body || {}), "type=", typeof (body as any)?.devices);
    return json({ error: "devices array is required", stage: "validate", got_keys: Object.keys(body || {}) }, 400);
  }

  const supabase = getSupabase();

  const macRaw = body.mac_address || req.headers.get("x-gateway-mac") || "";
  const mac = macRaw.toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 12);
  let device: { id: string; tenant_id: string | null; location_integration_id: string | null } | null = null;

  if (mac.length === 12) {
    const { data } = await supabase
      .from("gateway_devices")
      .select("id, tenant_id, location_integration_id")
      .eq("mac_address", mac)
      .maybeSingle();
    device = data as any;
  }
  if (!device) {
    const ctx = await getDeviceFromBasicAuth(req);
    if (ctx?.device_id) {
      const { data } = await supabase
        .from("gateway_devices")
        .select("id, tenant_id, location_integration_id")
        .eq("id", ctx.device_id)
        .maybeSingle();
      device = data as any;
    }
  }
  if (!device || !device.tenant_id) {
    return json({ error: "Gateway device not found or not assigned to a tenant" }, 404);
  }

  const nowIso = new Date().toISOString();
  const incoming = body.devices
    .filter((d: any) => typeof d?.entity_id === "string" && d.entity_id.includes("."))
    .slice(0, 2000)
    .map((d: any) => ({
      gateway_device_id: device!.id,
      tenant_id: device!.tenant_id,
      location_integration_id: device!.location_integration_id,
      entity_id: String(d.entity_id),
      domain: String(d.domain || d.entity_id.split(".")[0] || "unknown"),
      category: String(d.category || "sensor"),
      friendly_name: d.friendly_name ? String(d.friendly_name).slice(0, 200) : null,
      state: d.state != null ? String(d.state).slice(0, 200) : null,
      unit: d.unit ? String(d.unit).slice(0, 32) : null,
      device_class: d.device_class ? String(d.device_class).slice(0, 64) : null,
      last_seen_at: nowIso,
      last_state_at: d.last_updated || null,
    }));

  if (incoming.length === 0) {
    return json({ success: true, upserted: 0, pruned: 0 });
  }

  // IO-Optimierung: bestehende Zeilen laden und nur tatsächlich geänderte Einträge
  // schreiben. Spart bei stabilen Inventaren (>95% der Snapshots) fast alle Writes.
  const { data: existingRows } = await supabase
    .from("gateway_device_inventory")
    .select("id, entity_id, friendly_name, state, unit, device_class, domain, category, last_state_at, location_integration_id")
    .eq("gateway_device_id", device.id);

  const existingMap = new Map<string, any>();
  for (const r of existingRows || []) existingMap.set(r.entity_id, r);

  const changed = incoming.filter((row) => {
    const prev = existingMap.get(row.entity_id);
    if (!prev) return true; // neu
    return (
      prev.friendly_name !== row.friendly_name ||
      prev.state !== row.state ||
      prev.unit !== row.unit ||
      prev.device_class !== row.device_class ||
      prev.domain !== row.domain ||
      prev.category !== row.category ||
      prev.location_integration_id !== row.location_integration_id ||
      (prev.last_state_at || null) !== (row.last_state_at || null)
    );
  });

  if (changed.length > 0) {
    const { error: upErr } = await supabase
      .from("gateway_device_inventory")
      .upsert(changed, { onConflict: "gateway_device_id,entity_id" });
    if (upErr) {
      console.error("[gateway-ingest] device-snapshot upsert error:", upErr.message);
      return json({ error: "Database error", details: upErr.message }, 500);
    }
  }

  const seen = new Set(incoming.map((r) => r.entity_id));
  const stale = (existingRows || []).filter((e: any) => !seen.has(e.entity_id)).map((e: any) => e.id);
  let pruned = 0;
  if (stale.length > 0) {
    const { error: delErr } = await supabase
      .from("gateway_device_inventory")
      .delete()
      .in("id", stale);
    if (!delErr) pruned = stale.length;
  }

  return json({ success: true, upserted: changed.length, pruned, unchanged: incoming.length - changed.length });
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
    const _auth = await validateApiKey(req);
    if (isAuthError(_auth)) return _auth;
    const scopeTenantId = _auth.tenantId; // null = global server key (trusted)
    if (action === "list-locations") return handleListLocations(scopeTenantId);
    if (action === "list-meters") return handleListMeters(url, scopeTenantId);
    if (action === "get-daily-totals") return handleGetDailyTotals(url, scopeTenantId);
    if (action === "get-readings") return handleGetReadings(url, scopeTenantId);
    if (action === "get-locations-summary") return handleGetLocationsSummary(url, scopeTenantId);
    if (action === "addon-version") return handleAddonVersion();
    if (action === "sync-automations") return handleSyncAutomations(url, req);
    if (action === "list-loxone-ws-meters") return handleListLoxoneWsMeters();
  }

  // POST routes
  if (req.method === "POST") {
    if (action === "ws-session-start") return handleWsSessionStart(req);
    if (action === "ws-session-end") return handleWsSessionEnd(req);
    if (action === "ws-session-heartbeat") return handleWsSessionHeartbeat(req);
    if (action === "compact-day") return handleCompactDay(req);
    if (action === "schneider-push") return handleSchneiderPush(req);
    if (action === "heartbeat") return handleHeartbeat(req);
    if (action === "worker-heartbeat") return handleWorkerHeartbeat(req);
    if (action === "bridge-heartbeat") return handleBridgeHeartbeat(req);
    if (action === "bridge-log-event") return handleBridgeLogEvent(req);
    if (action === "bridge-readings") return handleBridgeReadings(req);
    if (action === "gateway-backup") return handleGatewayBackup(req);
    if (action === "gateway-command") return handleGatewayCommand(req);
    if (action === "push-execution-logs") return handlePushExecutionLogs(req);
    if (action === "sync-automations") return handleSyncAutomations(url, req);
    if (action === "device-snapshot") return handleDeviceSnapshot(req);

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

    return json({
      success: false,
      error: "Temporär deaktiviert: alter Polling-/Push-Pfad ohne action. Für Loxone sind nur bridge-readings per WS-Bridge erlaubt.",
      disabled: "legacy_post_readings",
    }, 410);
  }

  return json({ error: "Method not allowed" }, 405);
});
