/**
 * Loxone Remote-Connect WebSocket Worker (Feldtest)
 * ==================================================
 * Hält pro Loxone-Miniserver, der für den Feldtest freigeschaltet ist
 * (location_integrations.loxone_remote_connect_ws_enabled = TRUE), EINE
 * persistente WebSocket-Verbindung über Loxone Remote Connect
 * (dns.loxonecloud.com/<serial>).
 *
 * Aufgaben:
 *   1. Meter-Liste alle 5 Min beim Backend abfragen
 *      (gateway-ingest?action=list-loxone-ws-meters)
 *   2. Pro Miniserver einen lxcommunicator-Socket aufbauen
 *      (übernimmt Auth, AES, JWT, Keepalive)
 *   3. Werte sekündlich an gateway-ingest pushen
 *   4. Session-Start/-Ende inkl. Reconnect-Zähler &
 *      Disconnect-Grund an loxone_ws_session_log loggen
 *
 * Was dieser Worker NICHT macht:
 *   - Kein HTTP-Polling für andere Gateways (läuft via Edge Functions)
 *   - Kein OCPP-Proxy
 *   - Kein Schreiben von Befehlen an Loxone
 *   - Keine Produktiv-Tenants — nur Test-Standorte mit Feature-Flag
 *
 * Umgebungsvariablen:
 *   SUPABASE_URL        z. B. https://ihre-projekt-id.supabase.co
 *   GATEWAY_API_KEY     Bearer Token (gleicher Wert wie bei gateway-ingest)
 *   FLUSH_INTERVAL_MS   Wie oft Werte gepusht werden (Standard: 5000)
 *   MIN_PUSH_INTERVAL_MS Mindestabstand zwischen 2 Pushes desselben Werts (Standard: 60000)
 *   MIN_DELTA           Minimale Änderung in kW, ab der gepusht wird (Standard: 0.01)
 *   RELOAD_INTERVAL_MS  Wie oft die Meter-Liste neu geladen wird (Standard: 300000)
 *   LOG_LEVEL           "debug" | "info" | "warn" | "error" (Standard: "info")
 *   WORKER_HOST         Freier Text, taucht im Session-Log auf (Standard: hostname)
 *   BRIDGE_WORKER_NAME  Name in Tabelle bridge_workers (Standard: hetzner-bridge-test)
 *   BRIDGE_HEARTBEAT_MS Heartbeat-Intervall in ms (Standard: 30000)
 *   HEALTH_PORT         HTTP-Port für /healthz und /state (Standard: 8080, 0 = aus)
 *   WORKER_VERSION      Versions-String, taucht in bridge_workers.version auf
 */

import os from "os";

// ─── Konfiguration ───────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL!;
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY!;
const FLUSH_INTERVAL_MS = parseInt(process.env.FLUSH_INTERVAL_MS || "5000", 10);
const MIN_PUSH_INTERVAL_MS = parseInt(process.env.MIN_PUSH_INTERVAL_MS || "60000", 10);
const MIN_DELTA = parseFloat(process.env.MIN_DELTA || "0.01");
const RELOAD_INTERVAL_MS = parseInt(process.env.RELOAD_INTERVAL_MS || "300000", 10);
const LOG_LEVEL = (process.env.LOG_LEVEL || "info") as "debug" | "info" | "warn" | "error";
const WORKER_HOST = process.env.WORKER_HOST || os.hostname();

if (!SUPABASE_URL || !GATEWAY_API_KEY) {
  console.error("[FATAL] SUPABASE_URL und GATEWAY_API_KEY müssen gesetzt sein");
  process.exit(1);
}

const INGEST_URL = `${SUPABASE_URL}/functions/v1/gateway-ingest`;

// ─── Logging ─────────────────────────────────────────────────────────────────

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LOG_LEVELS[LOG_LEVEL] ?? 1;
function log(level: keyof typeof LOG_LEVELS, msg: string, ...args: any[]) {
  if (LOG_LEVELS[level] >= currentLevel) {
    const ts = new Date().toISOString();
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    fn(`[${ts}] [${level.toUpperCase()}] ${msg}`, ...args);
  }
}

// ─── Spike-Filter ────────────────────────────────────────────────────────────

const SPIKE_THRESHOLDS: Record<string, number> = {
  strom: 10000, gas: 5000, wasser: 1000, wärme: 5000, kälte: 2000, default: 50000,
};
function isSpike(v: number, energyType: string): boolean {
  if (!isFinite(v) || isNaN(v)) return true;
  return Math.abs(v) > (SPIKE_THRESHOLDS[energyType] ?? SPIKE_THRESHOLDS.default);
}

// ─── HTTP-Helfer ─────────────────────────────────────────────────────────────

async function ingestGet(action: string): Promise<any> {
  const r = await fetch(`${INGEST_URL}?action=${action}`, {
    headers: { Authorization: `Bearer ${GATEWAY_API_KEY}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`GET ${action} HTTP ${r.status}`);
  return r.json();
}

async function ingestPost(action: string | null, body: any): Promise<any> {
  const url = action ? `${INGEST_URL}?action=${action}` : INGEST_URL;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GATEWAY_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`POST ${action ?? "(readings)"} HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

// ─── Typen ───────────────────────────────────────────────────────────────────

interface WsMeter {
  id: string;
  name: string;
  energy_type: string;
  sensor_uuid: string;
  tenant_id: string;
  location_integration_id: string;
  location_integration: {
    id: string;
    config: { serial_number?: string; username?: string; password?: string };
  };
}

interface UuidEntry {
  meter_id: string;
  tenant_id: string;
  energy_type: string;
  latest_value: number | null;
  last_pushed_value: number | null;
  last_pushed_at: number; // ms epoch
}

interface ConnState {
  serialNumber: string;
  username: string;
  password: string;
  tenantId: string;
  locationIntegrationId: string;
  uuidMap: Map<string, UuidEntry>;
  ws: any;
  authenticated: boolean;
  reconnectDelay: number;
  reconnecting: boolean;
  // Session-Tracking
  sessionId: string | null;
  eventsReceived: number;
  reconnectCount: number;
}

const connections = new Map<string, ConnState>(); // key = serial

// ─── Loxone DNS-Auflösung (Remote Connect) ───────────────────────────────────

const dnsCache = new Map<string, string>();
async function resolveLoxoneHost(serial: string): Promise<string | null> {
  if (dnsCache.has(serial)) return dnsCache.get(serial)!;
  try {
    const r = await fetch(`https://dns.loxonecloud.com/${serial}`, {
      method: "GET", redirect: "follow", signal: AbortSignal.timeout(8000),
    });
    const finalUrl = r.url;
    if (finalUrl && finalUrl.toLowerCase().includes(serial.toLowerCase())) {
      const host = new URL(finalUrl).host;
      dnsCache.set(serial, host);
      log("info", `[DNS] ${serial} → ${host}`);
      return host;
    }
  } catch (err) {
    log("warn", `[DNS] ${serial} fehlgeschlagen: ${(err as Error).message}`);
  }
  const fb = `${serial.toLowerCase()}.dns.loxonecloud.com`;
  dnsCache.set(serial, fb);
  return fb;
}

// ─── Session-Log ─────────────────────────────────────────────────────────────

async function sessionStart(state: ConnState): Promise<void> {
  try {
    const r = await ingestPost("ws-session-start", {
      tenant_id: state.tenantId,
      location_integration_id: state.locationIntegrationId,
      worker_host: WORKER_HOST,
    });
    state.sessionId = r.session_id || null;
    state.eventsReceived = 0;
    state.reconnectCount = 0;
  } catch (err) {
    log("warn", `[Session] start fehlgeschlagen: ${(err as Error).message}`);
  }
}

async function sessionEnd(state: ConnState, reason: string): Promise<void> {
  if (!state.sessionId) return;
  try {
    await ingestPost("ws-session-end", {
      session_id: state.sessionId,
      disconnect_reason: reason,
      events_received: state.eventsReceived,
      reconnect_count: state.reconnectCount,
    });
  } catch (err) {
    log("warn", `[Session] end fehlgeschlagen: ${(err as Error).message}`);
  }
  state.sessionId = null;
}

// ─── WebSocket-Verbindung via lxcommunicator ─────────────────────────────────

async function connect(state: ConnState): Promise<void> {
  if (state.ws) { try { state.ws.close(); } catch { /* ignore */ } state.ws = null; }
  state.authenticated = false;

  const host = await resolveLoxoneHost(state.serialNumber);
  if (!host) { scheduleReconnect(state, "dns-failed"); return; }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const LxCommunicator = require("lxcommunicator");
  const config = new LxCommunicator.WebSocketConfig(
    LxCommunicator.WebSocketConfig.protocol.WSS,
    state.serialNumber,
    "LoxoneWsWorker",
    LxCommunicator.WebSocketConfig.permission.APP,
    false,
  );

  config.delegate = {
    socketOnEventReceived: (_s: any, events: any[]) => {
      for (const ev of events) {
        const uuid = (ev.uuid || "").toLowerCase();
        const entry = state.uuidMap.get(uuid);
        if (entry && typeof ev.value === "number" && !isSpike(ev.value, entry.energy_type)) {
          entry.latest_value = ev.value;
          state.eventsReceived++;
        }
      }
    },
    socketOnConnectionClosed: (_s: any, code: number) => {
      log("warn", `[WS] ${state.serialNumber} geschlossen (code=${code})`);
      state.authenticated = false;
      state.ws = null;
      sessionEnd(state, `close-${code}`);
      scheduleReconnect(state, `close-${code}`);
    },
    socketOnTokenRefreshFailed: () => log("warn", `[WS] Token-Refresh fehlgeschlagen: ${state.serialNumber}`),
  };

  const socket = new LxCommunicator.WebSocket(config);
  state.ws = socket;

  log("info", `[WS] verbinde ${state.serialNumber} → ${host}`);
  try {
    await socket.open(host, state.username, state.password);
    await socket.send("jdev/sps/enablebinstatusupdate");
    state.authenticated = true;
    state.reconnectDelay = 1000;
    await sessionStart(state);
    log("info", `[WS] authentifiziert ${state.serialNumber} (${state.uuidMap.size} UUIDs)`);
  } catch (err) {
    log("warn", `[WS] Verbindung fehlgeschlagen ${state.serialNumber}: ${err}`);
    state.ws = null;
    scheduleReconnect(state, `connect-error: ${(err as Error).message ?? err}`);
  }
}

function scheduleReconnect(state: ConnState, reason: string): void {
  if (state.reconnecting) return;
  state.reconnecting = true;
  state.reconnectCount++;
  const delay = state.reconnectDelay;
  state.reconnectDelay = Math.min(state.reconnectDelay * 2, 60000);
  log("info", `[WS] Reconnect ${state.serialNumber} in ${delay}ms (reason=${reason})`);
  setTimeout(() => { state.reconnecting = false; connect(state); }, delay);
}

// ─── Flush ───────────────────────────────────────────────────────────────────

async function flush(): Promise<void> {
  const readings: any[] = [];
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  for (const state of connections.values()) {
    if (!state.authenticated) continue;
    for (const entry of state.uuidMap.values()) {
      if (entry.latest_value === null) continue;

      // IO-Optimierung: nur pushen, wenn sich der Wert spürbar geändert hat
      // ODER der letzte Push älter als MIN_PUSH_INTERVAL_MS ist (Keepalive).
      const prev = entry.last_pushed_value;
      const ageMs = nowMs - entry.last_pushed_at;
      const delta = prev === null ? Infinity : Math.abs(entry.latest_value - prev);
      const changed = delta >= MIN_DELTA;
      const stale = ageMs >= MIN_PUSH_INTERVAL_MS;
      if (!changed && !stale) continue;

      readings.push({
        meter_id: entry.meter_id,
        tenant_id: entry.tenant_id,
        power_value: entry.latest_value,
        energy_type: entry.energy_type,
        recorded_at: nowIso,
      });
      entry.last_pushed_value = entry.latest_value;
      entry.last_pushed_at = nowMs;
    }
  }
  if (readings.length === 0) return;
  try {
    await ingestPost(null, { readings });
    log("debug", `[Flush] ${readings.length} Werte gepusht`);
  } catch (err) {
    log("warn", `[Flush] fehlgeschlagen: ${(err as Error).message}`);
  }
}


// ─── Meter-Liste laden & Verbindungen synchronisieren ────────────────────────

async function reloadMeters(): Promise<void> {
  let meters: WsMeter[] = [];
  try {
    const r = await ingestGet("list-loxone-ws-meters");
    meters = (r.meters || []) as WsMeter[];
  } catch (err) {
    log("error", `[Reload] fehlgeschlagen: ${(err as Error).message}`);
    return;
  }

  // Gruppieren pro Seriennummer
  const bySerial = new Map<string, { config: any; meters: WsMeter[]; tenantId: string; integrationId: string }>();
  for (const m of meters) {
    const cfg = m.location_integration?.config;
    if (!cfg?.serial_number || !cfg.username || !cfg.password || !m.sensor_uuid) continue;
    const serial = cfg.serial_number;
    if (!bySerial.has(serial)) {
      bySerial.set(serial, {
        config: cfg, meters: [],
        tenantId: m.tenant_id,
        integrationId: m.location_integration_id,
      });
    }
    bySerial.get(serial)!.meters.push(m);
  }

  // Neue + bestehende Verbindungen aktualisieren
  for (const [serial, group] of bySerial) {
    let state = connections.get(serial);
    if (!state) {
      state = {
        serialNumber: serial,
        username: group.config.username,
        password: group.config.password,
        tenantId: group.tenantId,
        locationIntegrationId: group.integrationId,
        uuidMap: new Map(),
        ws: null,
        authenticated: false,
        reconnectDelay: 1000,
        reconnecting: false,
        sessionId: null,
        eventsReceived: 0,
        reconnectCount: 0,
      };
      connections.set(serial, state);
    }
    state.uuidMap.clear();
    for (const m of group.meters) {
      state.uuidMap.set(m.sensor_uuid.toLowerCase(), {
        meter_id: m.id,
        tenant_id: m.tenant_id,
        energy_type: m.energy_type,
        latest_value: null,
        last_pushed_value: null,
        last_pushed_at: 0,
      });
    }

    if (!state.ws) connect(state);
  }

  // Entfernte Miniserver schließen
  for (const [serial, state] of connections) {
    if (!bySerial.has(serial)) {
      log("info", `[Reload] entferne ${serial} (nicht mehr im Feldtest)`);
      try { state.ws?.close(); } catch { /* ignore */ }
      await sessionEnd(state, "removed-from-test");
      connections.delete(serial);
    }
  }

  log("info", `[Reload] aktive Miniserver: ${connections.size}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  log("info", `Loxone WS Worker (Feldtest) startet — host=${WORKER_HOST}`);
  log("info", `  SUPABASE_URL=${SUPABASE_URL}`);
  log("info", `  FLUSH_INTERVAL_MS=${FLUSH_INTERVAL_MS}  RELOAD_INTERVAL_MS=${RELOAD_INTERVAL_MS}`);

  const shutdown = async (signal: string) => {
    log("info", `${signal} — beende Sessions...`);
    for (const state of connections.values()) {
      try { state.ws?.close(); } catch { /* ignore */ }
      await sessionEnd(state, `shutdown-${signal}`);
    }
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  await reloadMeters();
  setInterval(reloadMeters, RELOAD_INTERVAL_MS);
  setInterval(() => { flush().catch((e) => log("error", "flush:", e)); }, FLUSH_INTERVAL_MS);

  // Session-Heartbeat alle 15s: hält die aktive Session "live" und liefert
  // events_received an die UI, damit die Miniserver-Kachel WS-Traffic anzeigt.
  setInterval(async () => {
    for (const state of connections.values()) {
      if (!state.sessionId || !state.authenticated) continue;
      try {
        await ingestPost("ws-session-heartbeat", {
          session_id: state.sessionId,
          events_received: state.eventsReceived,
          reconnect_count: state.reconnectCount,
        });
      } catch (err) {
        log("debug", `[Heartbeat] ${state.serialNumber}: ${(err as Error).message}`);
      }
    }
  }, 15000);
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
