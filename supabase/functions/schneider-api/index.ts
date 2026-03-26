/**
 * Schneider EcoStruxure Cloud API – Edge Function
 * ================================================
 * Polls measurement data from the Schneider EcoStruxure Energy Hub API
 * using OAuth2 Client Credentials and writes values into meter_power_readings.
 *
 * Called periodically (e.g. via cron or gateway-periodic-sync) or on-demand.
 *
 * Query params:
 *   integration_id  – UUID of the location_integration row containing config
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

async function getAccessToken(apiUrl: string, clientId: string, clientSecret: string): Promise<string> {
  const tokenUrl = `${apiUrl.replace(/\/$/, "")}/oauth2/token`;

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "EnergyHub",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth2 token request failed [${res.status}]: ${text}`);
  }

  const data: TokenResponse = await res.json();
  return data.access_token;
}

/* ── Measurement fetching ────────────────────────────────────────────────────── */

interface EcoStruxureMeasurement {
  deviceId: string;
  deviceName?: string;
  measurementType: string;
  value: number;
  timestamp: string;
  unit?: string;
}

async function fetchMeasurements(
  apiUrl: string,
  accessToken: string,
  siteId: string,
): Promise<EcoStruxureMeasurement[]> {
  const baseUrl = apiUrl.replace(/\/$/, "");
  const url = `${baseUrl}/api/v1/sites/${siteId}/measurements/latest`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`EcoStruxure API error [${res.status}]: ${text}`);
  }

  const data = await res.json();
  // The API may return { measurements: [...] } or an array directly
  return Array.isArray(data) ? data : data?.measurements || [];
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

    if (!config.api_url || !config.client_id || !config.client_secret || !config.site_id) {
      return json({ error: "Incomplete Schneider Cloud configuration" }, 400);
    }

    // Get OAuth2 token
    console.log(`[schneider-api] Fetching token for site ${config.site_id}`);
    const accessToken = await getAccessToken(config.api_url, config.client_id, config.client_secret);

    // Fetch latest measurements
    const measurements = await fetchMeasurements(config.api_url, accessToken, config.site_id);
    console.log(`[schneider-api] Received ${measurements.length} measurements`);

    if (measurements.length === 0) {
      return json({ success: true, inserted: 0, message: "No measurements available" });
    }

    // Resolve meters by sensor_uuid matching deviceId
    const deviceIds = [...new Set(measurements.map((m) => m.deviceId))];
    const { data: meters } = await supabase
      .from("meters")
      .select("id, sensor_uuid")
      .eq("location_id", li.location_id)
      .eq("is_archived", false)
      .in("sensor_uuid", deviceIds);

    const meterMap = new Map<string, string>();
    for (const m of meters || []) {
      if (m.sensor_uuid) meterMap.set(m.sensor_uuid, m.id);
    }

    // Build readings
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
        recorded_at: m.timestamp || new Date().toISOString(),
      });
    }

    if (readings.length > 0) {
      const { error: insertErr } = await supabase.from("meter_power_readings").insert(readings);
      if (insertErr) {
        console.error("[schneider-api] Insert error:", insertErr.message);
        return json({ error: "Database error" }, 500);
      }
    }

    return json({
      success: true,
      inserted: readings.length,
      skipped: skipped.length,
      skipped_details: skipped.length > 0 ? skipped : undefined,
    });
  } catch (err) {
    console.error("[schneider-api] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
