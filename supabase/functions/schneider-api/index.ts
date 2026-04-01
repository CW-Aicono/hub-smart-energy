/**
 * Schneider EcoStruxure Energy Hub – Edge Function
 * =================================================
 * Integrates with the EcoStruxure Energy Hub **GraphQL API** (official API).
 * Supports:
 *   - getSensors:   Device discovery (list devices/meters at a site)
 *   - poll:         Latest measurements via GraphQL timeSeries query
 *   - history:      Historical time-series data for a date range
 *
 * Authentication: OAuth2 Client Credentials via Schneider Exchange token endpoint.
 *
 * Config fields (from location_integrations.config):
 *   api_url        – GraphQL endpoint base, e.g. https://api.exchange.se.com
 *   token_url      – OAuth2 token endpoint (default: https://api.se.com/token)
 *   client_id      – OAuth2 Client ID
 *   client_secret  – OAuth2 Client Secret
 *   site_id        – EcoStruxure Site/Building ID
 *
 * Query params:
 *   integration_id – UUID of location_integration row
 *   action         – "getSensors" | "poll" | "history"
 *   from / to      – ISO date strings for history action
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

let corsHeaders: Record<string, string> = getCorsHeaders();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/* ── OAuth2 Token ────────────────────────────────────────────────────────────── */

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

// Simple in-memory token cache per integration
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAccessToken(
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  cacheKey: string,
): Promise<string> {
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // Schneider API expects Basic auth header with client credentials
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth2 token request failed [${res.status}]: ${text}`);
  }

  const data: TokenResponse = await res.json();
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
  return data.access_token;
}

/* ── GraphQL Helper ──────────────────────────────────────────────────────────── */

async function graphqlQuery(
  apiUrl: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<unknown> {
  const graphqlEndpoint = `${apiUrl.replace(/\/$/, "")}/api/graphql`;

  const res = await fetch(graphqlEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GraphQL API error [${res.status}]: ${text}`);
  }

  const data = await res.json();
  if (data.errors && data.errors.length > 0) {
    console.error("[schneider-api] GraphQL errors:", JSON.stringify(data.errors));
    throw new Error(`GraphQL errors: ${data.errors.map((e: any) => e.message).join("; ")}`);
  }
  return data.data;
}

/* ── Fallback REST Helper (for custom/on-prem deployments) ───────────────────── */

async function restQuery(
  apiUrl: string,
  accessToken: string,
  path: string,
): Promise<unknown> {
  const url = `${apiUrl.replace(/\/$/, "")}${path}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`REST API error [${res.status}]: ${text}`);
  }
  return await res.json();
}

/* ── GraphQL Queries ─────────────────────────────────────────────────────────── */

/**
 * Device/sensor discovery for a site.
 * Uses the common EcoStruxure Energy Hub schema patterns:
 * - sites → devices → measurements
 */
const DEVICES_QUERY = `
  query GetSiteDevices($siteId: ID!) {
    site(id: $siteId) {
      id
      name
      devices {
        id
        name
        type
        serialNumber
        status
        measurements {
          id
          name
          unit
          type
        }
      }
    }
  }
`;

/**
 * Latest measurements for all devices at a site.
 */
const LATEST_MEASUREMENTS_QUERY = `
  query GetLatestMeasurements($siteId: ID!) {
    site(id: $siteId) {
      id
      devices {
        id
        name
        measurements {
          id
          name
          unit
          latestValue {
            value
            timestamp
          }
        }
      }
    }
  }
`;

/**
 * Historical time-series data for a specific device/measurement.
 */
const TIMESERIES_QUERY = `
  query GetTimeSeries($siteId: ID!, $from: DateTime!, $to: DateTime!) {
    site(id: $siteId) {
      id
      devices {
        id
        name
        measurements {
          id
          name
          unit
          timeSeries(from: $from, to: $to) {
            timestamp
            value
          }
        }
      }
    }
  }
`;

/* ── Action: getSensors ──────────────────────────────────────────────────────── */

interface SensorResult {
  id: string;
  name: string;
  value: string;
  unit: string;
  deviceId?: string;
  deviceName?: string;
  measurementType?: string;
}

async function handleGetSensors(
  apiUrl: string,
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  siteId: string,
): Promise<SensorResult[]> {
  const accessToken = await getAccessToken(tokenUrl, clientId, clientSecret, `${clientId}:${siteId}`);

  let sensors: SensorResult[] = [];

  try {
    // Try GraphQL first (official Energy Hub API)
    const data: any = await graphqlQuery(apiUrl, accessToken, LATEST_MEASUREMENTS_QUERY, { siteId });
    const devices = data?.site?.devices || [];

    for (const device of devices) {
      for (const measurement of device.measurements || []) {
        const latestValue = measurement.latestValue;
        sensors.push({
          id: `${device.id}_${measurement.id}`,
          name: `${device.name || device.id} – ${measurement.name || measurement.id}`,
          value: latestValue?.value != null ? String(latestValue.value) : "–",
          unit: measurement.unit || "",
          deviceId: device.id,
          deviceName: device.name,
          measurementType: measurement.type || measurement.name,
        });
      }
    }
  } catch (graphqlErr) {
    console.warn("[schneider-api] GraphQL failed, trying REST fallback:", graphqlErr);

    // Fallback: try REST endpoints (for custom/on-prem deployments)
    try {
      const data: any = await restQuery(apiUrl, accessToken, `/api/v1/sites/${siteId}/measurements/latest`);
      const measurements = Array.isArray(data) ? data : data?.measurements || [];

      for (const m of measurements) {
        sensors.push({
          id: m.deviceId || m.id,
          name: m.deviceName || m.deviceId || m.id,
          value: m.value != null ? String(m.value) : "–",
          unit: m.unit || "",
          deviceId: m.deviceId,
          deviceName: m.deviceName,
          measurementType: m.measurementType,
        });
      }
    } catch (restErr) {
      console.error("[schneider-api] REST fallback also failed:", restErr);
      throw graphqlErr; // Throw original GraphQL error
    }
  }

  return sensors;
}

/* ── Action: poll (latest measurements → insert readings) ────────────────────── */

async function handlePoll(
  supabase: ReturnType<typeof getSupabase>,
  apiUrl: string,
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  siteId: string,
  locationId: string,
  tenantId: string,
) {
  const accessToken = await getAccessToken(tokenUrl, clientId, clientSecret, `${clientId}:${siteId}`);

  let measurements: Array<{ deviceId: string; value: number; timestamp: string; unit?: string }> = [];

  try {
    // Try GraphQL
    const data: any = await graphqlQuery(apiUrl, accessToken, LATEST_MEASUREMENTS_QUERY, { siteId });
    const devices = data?.site?.devices || [];

    for (const device of devices) {
      for (const m of device.measurements || []) {
        const latest = m.latestValue;
        if (latest?.value != null) {
          measurements.push({
            deviceId: `${device.id}_${m.id}`,
            value: Number(latest.value),
            timestamp: latest.timestamp || new Date().toISOString(),
            unit: m.unit,
          });
        }
      }
    }
  } catch (graphqlErr) {
    console.warn("[schneider-api] GraphQL poll failed, trying REST:", graphqlErr);

    try {
      const data: any = await restQuery(apiUrl, accessToken, `/api/v1/sites/${siteId}/measurements/latest`);
      const arr = Array.isArray(data) ? data : data?.measurements || [];

      for (const m of arr) {
        if (m.value != null) {
          measurements.push({
            deviceId: m.deviceId,
            value: Number(m.value),
            timestamp: m.timestamp || new Date().toISOString(),
            unit: m.unit,
          });
        }
      }
    } catch (restErr) {
      console.error("[schneider-api] REST fallback also failed:", restErr);
      throw graphqlErr;
    }
  }

  console.log(`[schneider-api] Received ${measurements.length} measurements`);

  if (measurements.length === 0) {
    return { success: true, inserted: 0, message: "No measurements available" };
  }

  // Resolve meters by sensor_uuid
  const deviceIds = [...new Set(measurements.map((m) => m.deviceId))];
  const { data: meters } = await supabase
    .from("meters")
    .select("id, sensor_uuid")
    .eq("location_id", locationId)
    .eq("is_archived", false)
    .in("sensor_uuid", deviceIds);

  const meterMap = new Map<string, string>();
  for (const m of meters || []) {
    if (m.sensor_uuid) meterMap.set(m.sensor_uuid, m.id);
  }

  const readings = [];
  const skipped: string[] = [];

  for (const m of measurements) {
    const meterId = meterMap.get(m.deviceId);
    if (!meterId) {
      skipped.push(`${m.deviceId}: no matching meter`);
      continue;
    }

    readings.push({
      meter_id: meterId,
      tenant_id: tenantId,
      power_value: m.value,
      energy_type: "strom",
      recorded_at: m.timestamp,
    });
  }

  if (readings.length > 0) {
    const { error: insertErr } = await supabase.from("meter_power_readings").insert(readings);
    if (insertErr) {
      console.error("[schneider-api] Insert error:", insertErr.message);
      return { error: "Database error", details: insertErr.message };
    }
  }

  return {
    success: true,
    inserted: readings.length,
    skipped: skipped.length,
    skipped_details: skipped.length > 0 ? skipped : undefined,
  };
}

/* ── Action: history (time-series data) ──────────────────────────────────────── */

async function handleHistory(
  supabase: ReturnType<typeof getSupabase>,
  apiUrl: string,
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  siteId: string,
  locationId: string,
  tenantId: string,
  from: string,
  to: string,
) {
  const accessToken = await getAccessToken(tokenUrl, clientId, clientSecret, `${clientId}:${siteId}`);

  let allReadings: Array<{ deviceId: string; value: number; timestamp: string }> = [];

  try {
    const data: any = await graphqlQuery(apiUrl, accessToken, TIMESERIES_QUERY, {
      siteId,
      from,
      to,
    });
    const devices = data?.site?.devices || [];

    for (const device of devices) {
      for (const m of device.measurements || []) {
        for (const point of m.timeSeries || []) {
          if (point.value != null) {
            allReadings.push({
              deviceId: `${device.id}_${m.id}`,
              value: Number(point.value),
              timestamp: point.timestamp,
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("[schneider-api] History query failed:", err);
    throw err;
  }

  console.log(`[schneider-api] History: ${allReadings.length} data points from ${from} to ${to}`);

  if (allReadings.length === 0) {
    return { success: true, inserted: 0, message: "No historical data available" };
  }

  // Resolve meters
  const deviceIds = [...new Set(allReadings.map((r) => r.deviceId))];
  const { data: meters } = await supabase
    .from("meters")
    .select("id, sensor_uuid")
    .eq("location_id", locationId)
    .eq("is_archived", false)
    .in("sensor_uuid", deviceIds);

  const meterMap = new Map<string, string>();
  for (const m of meters || []) {
    if (m.sensor_uuid) meterMap.set(m.sensor_uuid, m.id);
  }

  const readings = [];
  let skippedCount = 0;

  for (const r of allReadings) {
    const meterId = meterMap.get(r.deviceId);
    if (!meterId) {
      skippedCount++;
      continue;
    }
    readings.push({
      meter_id: meterId,
      tenant_id: tenantId,
      power_value: r.value,
      energy_type: "strom",
      recorded_at: r.timestamp,
    });
  }

  // Insert in batches of 500
  let inserted = 0;
  for (let i = 0; i < readings.length; i += 500) {
    const batch = readings.slice(i, i + 500);
    const { error } = await supabase.from("meter_power_readings").insert(batch);
    if (error) {
      console.error("[schneider-api] Batch insert error:", error.message);
    } else {
      inserted += batch.length;
    }
  }

  return {
    success: true,
    total_points: allReadings.length,
    inserted,
    skipped: skippedCount,
  };
}

/* ── Main handler ────────────────────────────────────────────────────────────── */

Deno.serve(async (req) => {
  corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const integrationId = url.searchParams.get("integration_id");
    const action = url.searchParams.get("action") || "poll";

    if (!integrationId) {
      return json({ error: "integration_id parameter required" }, 400);
    }

    const supabase = getSupabase();

    // Load integration config
    const { data: li, error: liErr } = await supabase
      .from("location_integrations")
      .select("id, config, location_id, integration:integrations!location_integrations_integration_id_fkey(tenant_id)")
      .eq("id", integrationId)
      .single();

    if (liErr || !li) {
      return json({ error: "Integration not found" }, 404);
    }

    const config = (li.config || {}) as Record<string, string>;
    const tenantId = (li.integration as Record<string, string>)?.tenant_id;

    if (!config.client_id || !config.client_secret || !config.site_id) {
      return json({ error: "Incomplete Schneider Cloud configuration (client_id, client_secret, site_id required)" }, 400);
    }

    // Default endpoints based on research
    const apiUrl = config.api_url || "https://api.exchange.se.com";
    const tokenUrl = config.token_url || "https://api.se.com/token";

    console.log(`[schneider-api] Action: ${action}, site: ${config.site_id}`);

    switch (action) {
      case "getSensors": {
        const sensors = await handleGetSensors(apiUrl, tokenUrl, config.client_id, config.client_secret, config.site_id);
        return json({ success: true, sensors });
      }

      case "history": {
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");
        if (!from || !to) {
          return json({ error: "from and to parameters required for history action" }, 400);
        }
        const result = await handleHistory(
          supabase, apiUrl, tokenUrl, config.client_id, config.client_secret,
          config.site_id, li.location_id, tenantId, from, to,
        );
        if ((result as any).error) return json(result, 500);
        return json(result);
      }

      case "poll":
      default: {
        const result = await handlePoll(
          supabase, apiUrl, tokenUrl, config.client_id, config.client_secret,
          config.site_id, li.location_id, tenantId,
        );
        if ((result as any).error) return json(result, 500);
        return json(result);
      }
    }
  } catch (err) {
    console.error("[schneider-api] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
