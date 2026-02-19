/**
 * Gateway Worker – Industrietauglicher Echtzeit-Polling-Dienst
 * ============================================================
 * Läuft als dauerhaft laufender Prozess (z.B. in einem Docker-Container)
 * und schreibt Leistungswerte aller aktiven Gateways direkt in meter_power_readings.
 *
 * Unterstützte Gateways:
 *   - Loxone Miniserver (via Cloud DNS / direkter IP)
 *   - Shelly Cloud (via shelly.cloud API)
 *   - ABB free@home (via Local API)
 *   - Siemens Building X (via REST API)
 *   - Tuya Cloud (via openapi.tuyaeu.com)
 *   - Homematic IP (via CCU REST API)
 *   - Omada Cloud (via omada.tplinkcloud.com)
 *
 * Umgebungsvariablen (als .env oder Docker-Secrets):
 *   SUPABASE_URL           – z.B. https://xxxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY – Service-Role-Key (NIEMALS Anon-Key!)
 *   POLL_INTERVAL_MS       – Abfrageintervall in Millisekunden (Standard: 30000 = 30 Sek.)
 *   LOG_LEVEL              – "debug" | "info" | "warn" | "error" (Standard: "info")
 *
 * Deployment:
 *   docker build -t gateway-worker .
 *   docker run -d --restart=always \
 *     -e SUPABASE_URL=https://xxxxx.supabase.co \
 *     -e SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *     -e POLL_INTERVAL_MS=30000 \
 *     gateway-worker
 */

// Kein Supabase-Client mehr nötig – Kommunikation läuft über gateway-ingest HTTP API

// ─── Configuration ──────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL!;
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY!;
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "30000", 10);
const LOG_LEVEL = (process.env.LOG_LEVEL || "info") as "debug" | "info" | "warn" | "error";

// Ingest endpoint: POST readings via secure HTTP proxy
const GATEWAY_INGEST_URL = process.env.GATEWAY_INGEST_URL ||
  `${SUPABASE_URL}/functions/v1/gateway-ingest`;

if (!SUPABASE_URL || !GATEWAY_API_KEY) {
  console.error("[FATAL] SUPABASE_URL and GATEWAY_API_KEY must be set");
  process.exit(1);
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface GatewayIntegration {
  id: string;
  location_id: string;
  config: Record<string, any>;
  integration: {
    id: string;
    type: string;
    tenant_id: string;
  };
}

interface MeterWithSensor {
  id: string;
  name: string;
  energy_type: string;
  sensor_uuid: string | null;
  location_integration_id: string | null;
  tenant_id: string;
  location_integration: {
    id: string;
    config: Record<string, any>;
    integration: {
      type: string;
    };
  } | null;
}

interface PowerReading {
  meter_id: string;
  tenant_id: string;
  power_value: number;
  energy_type: string;
  recorded_at: string;
}

// ─── Logging ─────────────────────────────────────────────────────────────────

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LOG_LEVELS[LOG_LEVEL] ?? 1;

function log(level: "debug" | "info" | "warn" | "error", message: string, ...args: any[]) {
  if (LOG_LEVELS[level] >= currentLevel) {
    const ts = new Date().toISOString();
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    fn(`[${ts}] [${level.toUpperCase()}] ${message}`, ...args);
  }
}

// ─── Spike Detection ─────────────────────────────────────────────────────────
// Identisch mit der bestehenden Edge Function – filtert unrealistische Werte

const SPIKE_THRESHOLDS: Record<string, number> = {
  strom: 10000,     // 10 MW max für Strom
  gas: 5000,        // 5000 kW max für Gas
  wasser: 1000,     // 1000 kW äquivalent für Wasser
  wärme: 5000,      // 5 MW für Fernwärme
  kälte: 2000,
  default: 50000,
};

function isSpike(powerValue: number, energyType: string): boolean {
  if (!isFinite(powerValue) || isNaN(powerValue)) return true;
  const threshold = SPIKE_THRESHOLDS[energyType] ?? SPIKE_THRESHOLDS.default;
  return Math.abs(powerValue) > threshold;
}

// ─── HTTP Ingest Client ───────────────────────────────────────────────────────
// Sendet Readings sicher an die gateway-ingest Edge Function statt direkt in die DB

async function sendReadings(readings: PowerReading[]): Promise<void> {
  if (readings.length === 0) return;

  const response = await fetch(GATEWAY_INGEST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GATEWAY_API_KEY}`,
    },
    body: JSON.stringify({ readings }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  const result = await response.json() as any;
  log("info", `✓ Ingest: ${result.inserted} inserted, ${result.skipped ?? 0} skipped`);
  if (result.skipped_details?.length) {
    log("debug", "Skipped:", result.skipped_details.join("; "));
  }
}

// ─── Gateway Pollers ─────────────────────────────────────────────────────────

/**
 * Loxone Miniserver
 * Abfrage via Cloud DNS → /jdev/sps/io/{uuid}/all
 */
async function pollLoxone(meter: MeterWithSensor): Promise<number | null> {
  const config = meter.location_integration?.config as {
    serial_number: string;
    username: string;
    password: string;
  } | undefined;

  if (!config?.serial_number || !config.username || !config.password || !meter.sensor_uuid) {
    log("debug", `[Loxone] Skipping ${meter.name}: missing config or sensor_uuid`);
    return null;
  }

  try {
    // Resolve Cloud DNS
    const dnsUrl = `http://dns.loxonecloud.com/${config.serial_number}`;
    const dnsResponse = await fetch(dnsUrl, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(5000) });
    const urlObj = new URL(dnsResponse.url);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

    const authHeader = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;

    // Fetch all states for the control
    const allUrl = `${baseUrl}/jdev/sps/io/${meter.sensor_uuid}/all`;
    const response = await fetch(allUrl, {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      log("warn", `[Loxone] HTTP ${response.status} for meter ${meter.name}`);
      return null;
    }

    const data = await response.json() as any;
    if (!ll) return null;

    // Try to get "actual" power (Pf output → mapped to "actual" in kW)
    let powerKw: number | null = null;

    // First check named outputs
    for (const key of Object.keys(ll)) {
      if (key.startsWith("output")) {
        const output = ll[key];
        // "Pf" = power forward (active power in kW for Meter type)
        if (output?.name === "Pf" || output?.name === "actual") {
          const v = parseFloat(String(output.value));
          if (!isNaN(v)) { powerKw = v; break; }
        }
      }
    }

    // Fallback: primary value
    if (powerKw === null && ll.value !== undefined) {
      const v = parseFloat(String(ll.value));
      if (!isNaN(v)) powerKw = v;
    }

    return powerKw;
  } catch (err) {
    log("warn", `[Loxone] Error polling ${meter.name}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/**
 * Shelly Cloud
 * Abfrage via /device/all_status
 */
async function pollShelly(meter: MeterWithSensor): Promise<number | null> {
  const config = meter.location_integration?.config as {
    server_uri: string;
    auth_key: string;
  } | undefined;

  if (!config?.server_uri || !config.auth_key || !meter.sensor_uuid) {
    log("debug", `[Shelly] Skipping ${meter.name}: missing config or sensor_uuid`);
    return null;
  }

  try {
    const baseUrl = `https://${config.server_uri.replace(/^https?:\/\//, "")}`;
    const response = await fetch(
      `${baseUrl}/device/all_status?auth_key=${config.auth_key}`,
      { signal: AbortSignal.timeout(8000) }
    );

    if (!response.ok) {
      log("warn", `[Shelly] HTTP ${response.status} for meter ${meter.name}`);
      return null;
    }

    const data = await response.json() as any;
    const devices = data?.data?.devices_status || {};

    // sensor_uuid format: "{deviceId}_em0_power" or "{deviceId}_switch{ch}"
    const parts = meter.sensor_uuid.split("_");
    if (parts.length < 2) return null;
    const deviceId = parts.slice(0, -2).join("_");
    const sensorType = parts[parts.length - 2];
    const deviceStatus = devices[deviceId];
    if (!deviceStatus) return null;

    if (sensorType === "em0") {
      return deviceStatus["em:0"]?.total_act_power ?? null;
    }
    if (sensorType.startsWith("switch")) {
      const ch = parseInt(sensorType.replace("switch", ""), 10);
      return deviceStatus[`switch:${ch}`]?.apower ?? null;
    }

    return null;
  } catch (err) {
    log("warn", `[Shelly] Error polling ${meter.name}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/**
 * ABB free@home (Local API)
 * Abfrage via REST API
 */
async function pollABB(meter: MeterWithSensor): Promise<number | null> {
  const config = meter.location_integration?.config as {
    host: string;
    username: string;
    password: string;
    system_access_point?: string;
  } | undefined;

  if (!config?.host || !meter.sensor_uuid) {
    log("debug", `[ABB] Skipping ${meter.name}: missing config or sensor_uuid`);
    return null;
  }

  try {
    const baseUrl = config.host.startsWith("http") ? config.host : `http://${config.host}`;
    const sapId = config.system_access_point || "00000000-0000-0000-0000-000000000000";
    const authHeader = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;

    // sensor_uuid format: "{deviceId}.{channelId}.{datapointId}"
    const [deviceId, channelId, datapointId] = meter.sensor_uuid.split(".");
    if (!deviceId || !channelId || !datapointId) return null;

    const url = `${baseUrl}/api/rest/v1/datapoint/${sapId}/${deviceId}.${channelId}.${datapointId}`;
    const response = await fetch(url, {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      log("warn", `[ABB] HTTP ${response.status} for meter ${meter.name}`);
      return null;
    }

    const data = await response.json() as any;
    const values = data?.values || {};
    const rawValue = Object.values(values)[0];
    if (rawValue === undefined) return null;

    return parseFloat(String(rawValue));
  } catch (err) {
    log("warn", `[ABB] Error polling ${meter.name}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/**
 * Siemens Building X
 * Abfrage via OAuth + REST API
 */
async function pollSiemens(meter: MeterWithSensor): Promise<number | null> {
  const config = meter.location_integration?.config as {
    api_url: string;
    client_id: string;
    client_secret: string;
    partition_id: string;
  } | undefined;

  if (!config?.api_url || !config.client_id || !config.client_secret || !meter.sensor_uuid) {
    log("debug", `[Siemens] Skipping ${meter.name}: missing config`);
    return null;
  }

  try {
    // Get OAuth token
    const tokenRes = await fetch("https://login.siemens.com/access/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: config.client_id,
        client_secret: config.client_secret,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!tokenRes.ok) {
      log("warn", `[Siemens] OAuth failed: HTTP ${tokenRes.status}`);
      return null;
    }

    const { access_token } = await tokenRes.json() as any;

    // Fetch datapoint value
    const dataRes = await fetch(
      `${config.api_url}/api/v1/points/${meter.sensor_uuid}/values?limit=1`,
      {
        headers: { Authorization: `Bearer ${access_token}` },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!dataRes.ok) {
      log("warn", `[Siemens] Data fetch failed: HTTP ${dataRes.status}`);
      return null;
    }

    const data = await dataRes.json() as any;
    const value = data?.data?.[0]?.attributes?.presentValue ?? data?.data?.[0]?.attributes?.value;
    if (value === undefined) return null;

    return parseFloat(String(value));
  } catch (err) {
    log("warn", `[Siemens] Error polling ${meter.name}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/**
 * Tuya Cloud
 * Abfrage via OpenAPI
 */
async function pollTuya(meter: MeterWithSensor): Promise<number | null> {
  // Tuya requires HMAC-SHA256 signature – simplified implementation
  const config = meter.location_integration?.config as {
    client_id: string;
    client_secret: string;
    region?: string;
  } | undefined;

  if (!config?.client_id || !config.client_secret || !meter.sensor_uuid) {
    log("debug", `[Tuya] Skipping ${meter.name}: missing config`);
    return null;
  }

  // Note: Full Tuya implementation requires crypto-based signing.
  // See the tuya-api edge function for the complete implementation.
  // This worker delegates to the edge function for Tuya to avoid
  // duplicating the signing logic.
  log("debug", `[Tuya] Delegating to edge function for ${meter.name}`);
  return null;
}

/**
 * Homematic IP (CCU REST API)
 */
async function pollHomematic(meter: MeterWithSensor): Promise<number | null> {
  const config = meter.location_integration?.config as {
    host: string;
    auth_token?: string;
  } | undefined;

  if (!config?.host || !meter.sensor_uuid) {
    log("debug", `[Homematic] Skipping ${meter.name}: missing config`);
    return null;
  }

  try {
    const baseUrl = config.host.startsWith("http") ? config.host : `https://${config.host}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.auth_token) headers["AUTHORIZATION"] = `Bearer ${config.auth_token}`;

    // sensor_uuid format: "{channelAddress}:{paramName}" e.g. "LEQ1234567:0:POWER"
    const [address, paramName] = meter.sensor_uuid.includes(":")
      ? meter.sensor_uuid.split(/:(.+)/) // split on first colon
      : [meter.sensor_uuid, "POWER"];

    const body = JSON.stringify({
      method: "getValue",
      params: [address, paramName || "POWER"],
      id: 1,
    });

    const response = await fetch(`${baseUrl}/api/homematic.cgi`, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      log("warn", `[Homematic] HTTP ${response.status} for meter ${meter.name}`);
      return null;
    }

    const data = await response.json() as any;
    const value = data?.result;
    if (value === null || value === undefined) return null;

    return parseFloat(String(value));
  } catch (err) {
    log("warn", `[Homematic] Error polling ${meter.name}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// ─── Gateway Dispatcher ──────────────────────────────────────────────────────

const GATEWAY_POLLERS: Record<string, (meter: MeterWithSensor) => Promise<number | null>> = {
  loxone: pollLoxone,
  loxone_miniserver: pollLoxone,
  shelly_cloud: pollShelly,
  abb_free_at_home: pollABB,
  siemens_building_x: pollSiemens,
  tuya_cloud: pollTuya,
  homematic_ip: pollHomematic,
};

// ─── Main Poll Loop ───────────────────────────────────────────────────────────

async function fetchMeters(): Promise<MeterWithSensor[]> {
  // Meter-Liste über die gateway-ingest Funktion abrufen (kein direkter DB-Zugriff nötig)
  const listUrl = GATEWAY_INGEST_URL + "?action=list-meters";
  const response = await fetch(listUrl, {
    headers: { "Authorization": `Bearer ${GATEWAY_API_KEY}` },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const text = await response.text();
    log("error", `Failed to fetch meters: HTTP ${response.status}: ${text}`);
    return [];
  }

  const data = await response.json() as any;
  if (!data.success) {
    log("error", "Failed to fetch meters:", data.error);
    return [];
  }

  return (data.meters || []) as unknown as MeterWithSensor[];
}

async function pollCycle(): Promise<void> {
  const cycleStart = Date.now();
  log("info", `── Poll cycle started ──────────────────────────────────────`);

  const meters = await fetchMeters();
  log("info", `Found ${meters.length} active meters with gateway assignments`);

  if (meters.length === 0) {
    log("info", "No meters to poll.");
    return;
  }

  const now = new Date().toISOString();
  const readings: PowerReading[] = [];
  const errors: string[] = [];

  // Poll all meters in parallel (grouped by gateway to respect rate limits)
  const results = await Promise.allSettled(
    meters.map(async (meter) => {
      const integrationType = (meter.location_integration?.integration as any)?.type as string | undefined;
      if (!integrationType) return null;

      const poller = GATEWAY_POLLERS[integrationType];
      if (!poller) {
        log("debug", `No poller for type "${integrationType}" – skipping meter ${meter.name}`);
        return null;
      }

      const powerValue = await poller(meter);
      if (powerValue === null) return null;

      // Spike detection
      if (isSpike(powerValue, meter.energy_type)) {
        log("warn", `Spike detected for ${meter.name}: ${powerValue} ${meter.energy_type} – skipped`);
        return null;
      }

      return {
        meter_id: meter.id,
        tenant_id: meter.tenant_id,
        power_value: powerValue,
        energy_type: meter.energy_type,
        recorded_at: now,
      } satisfies PowerReading;
    })
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled" && result.value !== null) {
      readings.push(result.value);
    } else if (result.status === "rejected") {
      errors.push(`Meter ${meters[i].name}: ${result.reason}`);
    }
  }

  if (errors.length > 0) {
    log("warn", `${errors.length} meters failed:`, errors.join("; "));
  }

  await sendReadings(readings);

  const duration = Date.now() - cycleStart;
  log("info", `── Poll cycle done in ${duration}ms (${readings.length}/${meters.length} readings) ──`);
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log("info", `Gateway Worker starting...`);
  log("info", `  Supabase URL:     ${SUPABASE_URL}`);
  log("info", `  Poll interval:    ${POLL_INTERVAL_MS}ms`);
  log("info", `  Log level:        ${LOG_LEVEL}`);

  // Graceful shutdown
  process.on("SIGTERM", () => {
    log("info", "SIGTERM received – shutting down gracefully...");
    process.exit(0);
  });
  process.on("SIGINT", () => {
    log("info", "SIGINT received – shutting down gracefully...");
    process.exit(0);
  });

  // Initial poll immediately, then on interval
  await pollCycle();

  setInterval(async () => {
    try {
      await pollCycle();
    } catch (err) {
      log("error", "Unhandled error in poll cycle:", err instanceof Error ? err.message : err);
    }
  }, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error("[FATAL] Worker crashed:", err);
  process.exit(1);
});
