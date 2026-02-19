/**
 * Gateway Worker – Industrietauglicher Echtzeit-Streaming-Dienst
 * ==============================================================
 * Läuft als dauerhaft laufender Prozess (z.B. in einem Docker-Container).
 *
 * Loxone Miniserver: WebSocket-Streaming via lxcommunicator (offizielle Bibliothek)
 * Alle anderen Gateways: HTTP-REST-Polling (Intervall = POLL_INTERVAL_MS)
 *
 * Unterstützte Gateways:
 *   - Loxone Miniserver    → lxcommunicator BinarySocket (JWT-Token Auth, automatisch)
 *   - Shelly Cloud         → HTTP REST
 *   - ABB free@home        → HTTP REST
 *   - Siemens Building X   → HTTP REST + OAuth
 *   - Tuya Cloud           → delegiert an Edge Function
 *   - Homematic IP         → HTTP REST
 *   - Omada Cloud          → HTTP REST
 *
 * Umgebungsvariablen:
 *   SUPABASE_URL           – z.B. https://xxxxx.supabase.co
 *   GATEWAY_API_KEY        – Bearer Token für gateway-ingest
 *   POLL_INTERVAL_MS       – Polling-Intervall für nicht-WS Gateways (Standard: 30000)
 *   FLUSH_INTERVAL_MS      – Wie oft der WS-Buffer in die DB geschrieben wird (Standard: 1000)
 *   LOG_LEVEL              – "debug" | "info" | "warn" | "error" (Standard: "info")
 *   GATEWAY_INGEST_URL     – Override für Ingest-URL (optional)
 *
 * Deployment:
 *   docker build -t gateway-worker .
 *   docker run -d --restart=always \
 *     -e SUPABASE_URL=https://xxxxx.supabase.co \
 *     -e GATEWAY_API_KEY=sk_live_... \
 *     -e FLUSH_INTERVAL_MS=1000 \
 *     gateway-worker
 */

import WebSocket from "ws";

// ─── Configuration ──────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL!;
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY!;
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "30000", 10);
const FLUSH_INTERVAL_MS = parseInt(process.env.FLUSH_INTERVAL_MS || "1000", 10);
const LOG_LEVEL = (process.env.LOG_LEVEL || "info") as "debug" | "info" | "warn" | "error";

const GATEWAY_INGEST_URL = process.env.GATEWAY_INGEST_URL ||
  `${SUPABASE_URL}/functions/v1/gateway-ingest`;

if (!SUPABASE_URL || !GATEWAY_API_KEY) {
  console.error("[FATAL] SUPABASE_URL and GATEWAY_API_KEY must be set");
  process.exit(1);
}

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── HTTP Ingest Client ───────────────────────────────────────────────────────

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
  log("debug", `✓ Ingest: ${result.inserted} inserted, ${result.skipped ?? 0} skipped`);
}

// ─── Meter List ───────────────────────────────────────────────────────────────

async function fetchMeters(): Promise<MeterWithSensor[]> {
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

// ─── Loxone DNS Cache ────────────────────────────────────────────────────────

const loxoneBaseUrlCache = new Map<string, string>();
const loxoneDnsInFlight = new Map<string, Promise<string | null>>();

async function resolveLoxoneBaseUrl(serialNumber: string): Promise<string | null> {
  if (loxoneBaseUrlCache.has(serialNumber)) {
    return loxoneBaseUrlCache.get(serialNumber)!;
  }
  if (loxoneDnsInFlight.has(serialNumber)) {
    return loxoneDnsInFlight.get(serialNumber)!;
  }
  const promise = (async () => {
    try {
      // Versuche HTTPS zuerst, dann HTTP als Fallback
      for (const proto of ["https", "http"]) {
        try {
          const dnsResponse = await fetch(
            `${proto}://dns.loxonecloud.com/${serialNumber}`,
            { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8000) }
          );
          const finalUrl = dnsResponse.url;
          if (finalUrl && finalUrl.includes(serialNumber.toLowerCase())) {
            const urlObj = new URL(finalUrl);
            const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
            loxoneBaseUrlCache.set(serialNumber, baseUrl);
            log("info", `[Loxone] DNS resolved (${proto}): ${serialNumber} → ${baseUrl}`);
            return baseUrl;
          }
          // Fallback: parse Location header from response body or direct URL construction
          const text = await dnsResponse.text().catch(() => "");
          log("debug", `[Loxone] DNS ${proto} response status=${dnsResponse.status} url=${finalUrl} body=${text.slice(0, 200)}`);
        } catch (innerErr) {
          log("debug", `[Loxone] DNS ${proto} failed for ${serialNumber}: ${innerErr instanceof Error ? innerErr.message : innerErr}`);
        }
      }
      // Letzter Fallback: Standard Loxone Cloud DNS URL-Schema
      const fallbackUrl = `https://${serialNumber.toLowerCase()}.dns.loxonecloud.com`;
      log("warn", `[Loxone] DNS lookup failed for ${serialNumber}, trying fallback: ${fallbackUrl}`);
      loxoneBaseUrlCache.set(serialNumber, fallbackUrl);
      return fallbackUrl;
    } catch (err) {
      log("warn", `[Loxone] DNS lookup failed for ${serialNumber}: ${err instanceof Error ? err.message : err}`);
      return null;
    } finally {
      loxoneDnsInFlight.delete(serialNumber);
    }
  })();
  loxoneDnsInFlight.set(serialNumber, promise);
  return promise;
}

// ─── Loxone WebSocket Manager (via lxcommunicator) ────────────────────────────
//
// Pro Miniserver (Seriennummer) wird EINE persistente WebSocket-Verbindung
// gehalten. lxcommunicator übernimmt Auth, Crypto, Keepalive und Token-Refresh.

interface LoxoneWsState {
  serialNumber: string;
  username: string;
  password: string;
  baseUrl: string;
  ws: any; // LxCommunicator.BinarySocket (kein Standard-WebSocket)
  // sensor_uuid → { meter_id, tenant_id, energy_type, latest_value }
  uuidMap: Map<string, { meter_id: string; tenant_id: string; energy_type: string; latest_value: number | null }>;
  reconnectDelay: number;
  reconnecting: boolean;
  authenticated: boolean;
  statusUpdatesEnabled: boolean;
}

// Global state map: serialNumber → state
const loxoneConnections = new Map<string, LoxoneWsState>();

/**
 * Loxone Binär-Frame-Parser (ValueEvent) — Fallback
 * Falls lxcommunicator Events nicht bereits geparst liefert,
 * können wir Binär-Frames manuell auswerten.
 */
function parseLoxoneValueEvent(buffer: Buffer): Array<{ uuid: string; value: number }> {
  const results: Array<{ uuid: string; value: number }> = [];

  if (buffer.length < 8) return results;

  const msgType = buffer[1]; // 0x03 = ValueEvent
  if (msgType !== 0x03) return results;

  let offset = 8;
  while (offset + 24 <= buffer.length) {
    const p1 = buffer.readUInt32LE(offset).toString(16).padStart(8, "0");
    const p2 = buffer.readUInt16LE(offset + 4).toString(16).padStart(4, "0");
    const p3 = buffer.readUInt16LE(offset + 6).toString(16).padStart(4, "0");
    const p4 = buffer.slice(offset + 8, offset + 16).toString("hex");
    const uuid = `${p1}-${p2}-${p3}-${p4.slice(0, 4)}-${p4.slice(4)}`;

    const value = buffer.readDoubleLE(offset + 16);
    results.push({ uuid: uuid.toLowerCase(), value });
    offset += 24;
  }

  return results;
}

/**
 * Baut eine WebSocket-Verbindung zum Loxone Miniserver auf via lxcommunicator.
 * Die Bibliothek übernimmt: RSA Key Exchange, AES-256-CBC, JWT-Token, Keepalive.
 */
function connectLoxoneWs(state: LoxoneWsState): void {
  if (state.ws) {
    try { state.ws.close(); } catch (_e) {}
    state.ws = null;
  }

  state.authenticated = false;
  state.statusUpdatesEnabled = false;

  const LxCommunicator = require("lxcommunicator");
  const WebSocketConfig = LxCommunicator.WebSocketConfig;

  const deviceInfo = "GatewayWorker";
  const config = new WebSocketConfig(
    WebSocketConfig.protocol.WS,     // WS für lokale Verbindung
    state.serialNumber,
    deviceInfo,
    WebSocketConfig.permission.APP,  // Permission 4 = langlebiges Token (4 Wochen)
    false                            // kein TLS-Zertifikat
  );

  config.delegate = {
    socketOnEventReceived: (socket: any, events: any[], type: number) => {
      // type 1 = ValueEvent, type 2 = TextEvent
      for (const event of events) {
        const uuid = (event.uuid || "").toLowerCase();
        const entry = state.uuidMap.get(uuid);
        if (entry && typeof event.value === "number") {
          if (!isSpike(event.value, entry.energy_type)) {
            entry.latest_value = event.value;
          }
        }
      }
      if (events.length > 0) {
        log("debug", `[Loxone] ${events.length} events (type=${type}) from ${state.serialNumber}`);
      }
    },

    socketOnConnectionClosed: (socket: any, code: number) => {
      log("warn", `[Loxone] Connection closed: ${state.serialNumber} (code=${code})`);
      state.authenticated = false;
      state.statusUpdatesEnabled = false;
      state.ws = null;
      scheduleReconnect(state);
    },

    socketOnTokenConfirmed: (socket: any, response: any) => {
      log("info", `[Loxone] Token confirmed: ${state.serialNumber}`);
    },

    socketOnTokenReceived: (socket: any, response: any) => {
      log("info", `[Loxone] Token received: ${state.serialNumber}`);
    },

    socketOnTokenRefreshFailed: (socket: any, response: any) => {
      log("warn", `[Loxone] Token refresh failed: ${state.serialNumber} — will reconnect`);
    },
  };

  const socket = new LxCommunicator.WebSocket(config);

  // Host = DNS-aufgelöste URL ohne Protokoll-Prefix
  const host = state.baseUrl.replace(/^https?:\/\//, "");

  log("info", `[Loxone] Connecting via lxcommunicator: ${state.serialNumber} → ${host}`);

  socket.open(host, state.username, state.password)
    .then(() => {
      state.authenticated = true;
      state.reconnectDelay = 1000; // Reset backoff
      log("info", `[Loxone] Authenticated via lxcommunicator: ${state.serialNumber} (${state.uuidMap.size} UUIDs)`);
      return socket.send("jdev/sps/enablebinstatusupdate");
    })
    .then((response: any) => {
      state.statusUpdatesEnabled = true;
      log("info", `[Loxone] Status updates enabled: ${state.serialNumber}`);
    })
    .catch((err: any) => {
      log("warn", `[Loxone] Connection failed: ${state.serialNumber}: ${err}`);
      state.ws = null;
      scheduleReconnect(state);
    });

  state.ws = socket;
}

function scheduleReconnect(state: LoxoneWsState): void {
  if (state.reconnecting) return;
  state.reconnecting = true;

  const delay = state.reconnectDelay;
  state.reconnectDelay = Math.min(state.reconnectDelay * 2, 60000); // max 60s

  log("info", `[Loxone] Reconnecting ${state.serialNumber} in ${delay}ms...`);
  setTimeout(() => {
    state.reconnecting = false;
    connectLoxoneWs(state);
  }, delay);
}

/**
 * Registriert alle Loxone-Meter und baut WebSocket-Verbindungen auf.
 * Nicht-Loxone-Meter werden dem HTTP-Polling-Pool übergeben.
 */
async function initLoxoneConnections(meters: MeterWithSensor[]): Promise<MeterWithSensor[]> {
  const nonLoxoneMeters: MeterWithSensor[] = [];

  // Loxone-Meter nach Seriennummer gruppieren
  const loxoneBySerial = new Map<string, { config: any; meters: MeterWithSensor[] }>();

  for (const meter of meters) {
    const type = (meter.location_integration?.integration as any)?.type as string | undefined;
    if (type !== "loxone" && type !== "loxone_miniserver") {
      nonLoxoneMeters.push(meter);
      continue;
    }

    const config = meter.location_integration?.config as {
      serial_number?: string;
      username?: string;
      password?: string;
    } | undefined;

    if (!config?.serial_number || !config.username || !config.password || !meter.sensor_uuid) {
      log("debug", `[Loxone] Skipping meter ${meter.name}: incomplete config`);
      nonLoxoneMeters.push(meter); // Fallback auf HTTP-Polling
      continue;
    }

    const serial = config.serial_number;
    if (!loxoneBySerial.has(serial)) {
      loxoneBySerial.set(serial, { config, meters: [] });
    }
    loxoneBySerial.get(serial)!.meters.push(meter);
  }

  // Pro Miniserver: DNS auflösen und WebSocket-State registrieren
  for (const [serial, { config, meters: loxMeters }] of loxoneBySerial) {
    const baseUrl = await resolveLoxoneBaseUrl(serial);
    if (!baseUrl) {
      log("warn", `[Loxone] DNS failed for ${serial} – falling back to HTTP polling`);
      nonLoxoneMeters.push(...loxMeters);
      continue;
    }

    let state = loxoneConnections.get(serial);

    if (!state) {
      state = {
        serialNumber: serial,
        username: config.username,
        password: config.password,
        baseUrl,
        ws: null,
        uuidMap: new Map(),
        reconnectDelay: 1000,
        reconnecting: false,
        authenticated: false,
        statusUpdatesEnabled: false,
      };
      loxoneConnections.set(serial, state);
    }

    // UUID-Map aktualisieren (bei Meter-Änderungen)
    state.uuidMap.clear();
    for (const meter of loxMeters) {
      if (meter.sensor_uuid) {
        state.uuidMap.set(meter.sensor_uuid.toLowerCase(), {
          meter_id: meter.id,
          tenant_id: meter.tenant_id,
          energy_type: meter.energy_type,
          latest_value: null,
        });
      }
    }

    // Verbindung aufbauen (nur wenn nicht bereits verbunden)
    if (!state.ws) {
      connectLoxoneWs(state);
    }
  }

  return nonLoxoneMeters;
}

/**
 * Flush: Liest den aktuellen In-Memory-State aller WebSocket-Verbindungen
 * und sendet alle bekannten Werte als Batch an gateway-ingest.
 */
async function flushLoxoneBuffer(): Promise<void> {
  const readings: PowerReading[] = [];
  const now = new Date().toISOString();

  for (const [serial, state] of loxoneConnections) {
    if (!state.authenticated) {
      log("debug", `[Loxone] Skipping flush for ${serial}: not authenticated`);
      continue;
    }

    for (const [, entry] of state.uuidMap) {
      if (entry.latest_value === null) continue;
      readings.push({
        meter_id: entry.meter_id,
        tenant_id: entry.tenant_id,
        power_value: entry.latest_value,
        energy_type: entry.energy_type,
        recorded_at: now,
      });
    }
  }

  if (readings.length > 0) {
    try {
      await sendReadings(readings);
      log("info", `✓ Flush: ${readings.length} Loxone readings inserted`);
    } catch (err) {
      log("warn", `Flush failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}

// ─── HTTP Gateway Pollers ─────────────────────────────────────────────────────

async function pollLoxoneHttp(meter: MeterWithSensor): Promise<number | null> {
  const config = meter.location_integration?.config as {
    serial_number: string;
    username: string;
    password: string;
  } | undefined;

  if (!config?.serial_number || !config.username || !config.password || !meter.sensor_uuid) return null;

  try {
    const baseUrl = await resolveLoxoneBaseUrl(config.serial_number);
    if (!baseUrl) return null;

    const authHeader = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
    const response = await fetch(`${baseUrl}/jdev/sps/io/${meter.sensor_uuid}/all`, {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return null;

    const data = await response.json() as any;
    const ll = data?.LL;
    if (!ll) return null;

    let powerKw: number | null = null;
    for (const key of Object.keys(ll)) {
      if (key.startsWith("output")) {
        const output = ll[key];
        if (output?.name === "Pf" || output?.name === "actual") {
          const v = parseFloat(String(output.value));
          if (!isNaN(v)) { powerKw = v; break; }
        }
      }
    }
    if (powerKw === null && ll.value !== undefined) {
      const v = parseFloat(String(ll.value));
      if (!isNaN(v)) powerKw = v;
    }
    return powerKw;
  } catch (err) {
    log("warn", `[Loxone-HTTP] Error polling ${meter.name}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function pollShelly(meter: MeterWithSensor): Promise<number | null> {
  const config = meter.location_integration?.config as {
    server_uri: string;
    auth_key: string;
  } | undefined;

  if (!config?.server_uri || !config.auth_key || !meter.sensor_uuid) return null;

  try {
    const baseUrl = `https://${config.server_uri.replace(/^https?:\/\//, "")}`;
    const response = await fetch(
      `${baseUrl}/device/all_status?auth_key=${config.auth_key}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!response.ok) return null;

    const data = await response.json() as any;
    const devices = data?.data?.devices_status || {};
    const parts = meter.sensor_uuid.split("_");
    if (parts.length < 2) return null;
    const deviceId = parts.slice(0, -2).join("_");
    const sensorType = parts[parts.length - 2];
    const deviceStatus = devices[deviceId];
    if (!deviceStatus) return null;

    if (sensorType === "em0") return deviceStatus["em:0"]?.total_act_power ?? null;
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

async function pollABB(meter: MeterWithSensor): Promise<number | null> {
  const config = meter.location_integration?.config as {
    host: string;
    username: string;
    password: string;
    system_access_point?: string;
  } | undefined;

  if (!config?.host || !meter.sensor_uuid) return null;

  try {
    const baseUrl = config.host.startsWith("http") ? config.host : `http://${config.host}`;
    const sapId = config.system_access_point || "00000000-0000-0000-0000-000000000000";
    const authHeader = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
    const [deviceId, channelId, datapointId] = meter.sensor_uuid.split(".");
    if (!deviceId || !channelId || !datapointId) return null;

    const response = await fetch(
      `${baseUrl}/api/rest/v1/datapoint/${sapId}/${deviceId}.${channelId}.${datapointId}`,
      { headers: { Authorization: authHeader }, signal: AbortSignal.timeout(8000) }
    );
    if (!response.ok) return null;

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

async function pollSiemens(meter: MeterWithSensor): Promise<number | null> {
  const config = meter.location_integration?.config as {
    api_url: string;
    client_id: string;
    client_secret: string;
    partition_id: string;
  } | undefined;

  if (!config?.api_url || !config.client_id || !config.client_secret || !meter.sensor_uuid) return null;

  try {
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
    if (!tokenRes.ok) return null;

    const { access_token } = await tokenRes.json() as any;
    const dataRes = await fetch(
      `${config.api_url}/api/v1/points/${meter.sensor_uuid}/values?limit=1`,
      { headers: { Authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(8000) }
    );
    if (!dataRes.ok) return null;

    const data = await dataRes.json() as any;
    const value = data?.data?.[0]?.attributes?.presentValue ?? data?.data?.[0]?.attributes?.value;
    if (value === undefined) return null;
    return parseFloat(String(value));
  } catch (err) {
    log("warn", `[Siemens] Error polling ${meter.name}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function pollHomematic(meter: MeterWithSensor): Promise<number | null> {
  const config = meter.location_integration?.config as {
    host: string;
    auth_token?: string;
  } | undefined;

  if (!config?.host || !meter.sensor_uuid) return null;

  try {
    const baseUrl = config.host.startsWith("http") ? config.host : `https://${config.host}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.auth_token) headers["AUTHORIZATION"] = `Bearer ${config.auth_token}`;

    const [address, paramName] = meter.sensor_uuid.includes(":")
      ? meter.sensor_uuid.split(/:(.+)/)
      : [meter.sensor_uuid, "POWER"];

    const response = await fetch(`${baseUrl}/api/homematic.cgi`, {
      method: "POST",
      headers,
      body: JSON.stringify({ method: "getValue", params: [address, paramName || "POWER"], id: 1 }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;

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
  loxone: pollLoxoneHttp,
  loxone_miniserver: pollLoxoneHttp,
  shelly_cloud: pollShelly,
  abb_free_at_home: pollABB,
  siemens_building_x: pollSiemens,
  homematic_ip: pollHomematic,
};

// ─── HTTP Poll Cycle (für Nicht-Loxone-Gateways) ────────────────────────────

async function httpPollCycle(meters: MeterWithSensor[]): Promise<void> {
  if (meters.length === 0) return;

  const now = new Date().toISOString();
  const readings: PowerReading[] = [];
  const errors: string[] = [];

  const results = await Promise.allSettled(
    meters.map(async (meter) => {
      const integrationType = (meter.location_integration?.integration as any)?.type as string | undefined;
      if (!integrationType) return null;

      const poller = GATEWAY_POLLERS[integrationType];
      if (!poller) {
        log("debug", `No poller for type "${integrationType}" – skipping ${meter.name}`);
        return null;
      }

      const powerValue = await poller(meter);
      if (powerValue === null) return null;

      if (isSpike(powerValue, meter.energy_type)) {
        log("warn", `Spike detected for ${meter.name}: ${powerValue} – skipped`);
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
      errors.push(`${meters[i].name}: ${result.reason}`);
    }
  }

  if (errors.length > 0) {
    log("warn", `${errors.length} meters failed:`, errors.join("; "));
  }

  if (readings.length > 0) {
    await sendReadings(readings);
    log("info", `✓ HTTP Poll: ${readings.length}/${meters.length} readings inserted`);
  }
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log("info", `Gateway Worker v3.0 starting (lxcommunicator mode)...`);
  log("info", `  Supabase URL:      ${SUPABASE_URL}`);
  log("info", `  HTTP Poll interval: ${POLL_INTERVAL_MS}ms`);
  log("info", `  WS Flush interval:  ${FLUSH_INTERVAL_MS}ms`);
  log("info", `  Log level:          ${LOG_LEVEL}`);

  process.on("SIGTERM", () => { log("info", "SIGTERM – shutting down..."); process.exit(0); });
  process.on("SIGINT", () => { log("info", "SIGINT – shutting down..."); process.exit(0); });

  let nonLoxoneMeters: MeterWithSensor[] = [];

  const initMeters = async () => {
    const allMeters = await fetchMeters();
    log("info", `Found ${allMeters.length} active meters`);
    nonLoxoneMeters = await initLoxoneConnections(allMeters);
    log("info", `Loxone WebSocket: ${loxoneConnections.size} Miniserver(s) | HTTP Poll: ${nonLoxoneMeters.length} meters`);
  };

  await initMeters();

  // Meter-Liste alle 5 Minuten neu laden
  setInterval(initMeters, 5 * 60 * 1000);

  // ── Loxone Flush-Timer (sekündlich) ──────────────────────────────────────
  setInterval(async () => {
    try {
      await flushLoxoneBuffer();
    } catch (err) {
      log("error", "Flush error:", err instanceof Error ? err.message : err);
    }
  }, FLUSH_INTERVAL_MS);

  // ── HTTP Poll-Timer (für alle anderen Gateways) ───────────────────────────
  const httpPoll = async () => {
    try {
      await httpPollCycle(nonLoxoneMeters);
    } catch (err) {
      log("error", "HTTP poll error:", err instanceof Error ? err.message : err);
    }
  };

  await httpPoll();
  setInterval(httpPoll, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error("[FATAL] Worker crashed:", err);
  process.exit(1);
});
