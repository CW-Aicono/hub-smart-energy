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
 *   BRIDGE_HEARTBEAT_MS Heartbeat-Intervall in ms (Standard: 60000)
 *   HEALTH_PORT         HTTP-Port für /healthz und /state (Standard: 8080, 0 = aus)
 *   WORKER_VERSION      Versions-String, taucht in bridge_workers.version auf
 *   WATCHDOG_STALE_MS   (Phase 3) Forcierter Reconnect, wenn so lange kein Event
 *                       von einem authentifizierten Miniserver kam (Standard: 300000 = 5 Min)
 *   WATCHDOG_CHECK_MS   (Phase 3) Prüfintervall des Watchdogs (Standard: 30000 = 30 s)
 *   KEEPALIVE_INTERVAL_MS (Phase 4) Loxone Keep-Alive Ping (Standard: 60000 = 60 s,
 *                       0 = aus). Hält NAT/Firewall offen & validiert Socket+Token.
 *   NO_OPEN_TIMEOUT_MIN (Phase 7.8) Minuten ohne erfolgreichen ws-open, bevor ein
 *                       hängender Slot komplett zurückgesetzt wird (Standard: 15).
 */

import os from "os";
import http from "http";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY!;
// v1.10 (31.07.2026): FLUSH ist wieder aktiv — aber als REINER Live-Broadcast
// (`live_only: true`). gateway-ingest verteilt die Werte nur über Realtime und
// schreibt NICHTS in die Datenbank. Persistenz läuft weiterhin ausschließlich
// über flushBuckets() → bridge-power-5min. Damit kostet der Live-Pfad 0 Disk-IO.
const LIVE_PUSH_INTERVAL_MS = Math.max(
  2000,
  parseInt(process.env.LIVE_PUSH_INTERVAL_MS || process.env.FLUSH_INTERVAL_MS || "5000", 10),
);
const FLUSH_INTERVAL_MS = LIVE_PUSH_INTERVAL_MS;
// Keepalive: spätestens alle 60 s wird ein Wert je Zähler gesendet, auch wenn
// er sich kaum ändert — damit die UI nach einem Reload sofort Werte hat.
const MIN_PUSH_INTERVAL_MS = parseInt(process.env.MIN_PUSH_INTERVAL_MS || "60000", 10);
const MIN_DELTA = parseFloat(process.env.MIN_DELTA || "0.05");
// Obergrenze je Push-Zyklus, damit ein großer Miniserver den Kanal nicht flutet.
const MAX_LIVE_EVENTS_PER_PUSH = Math.max(
  50,
  parseInt(process.env.MAX_LIVE_EVENTS_PER_PUSH || "500", 10),
);
const RELOAD_INTERVAL_MS = parseInt(process.env.RELOAD_INTERVAL_MS || "300000", 10);
const LOG_LEVEL = (process.env.LOG_LEVEL || "info") as "debug" | "info" | "warn" | "error";
const WORKER_HOST = process.env.WORKER_HOST || os.hostname();
const BRIDGE_WORKER_NAME = process.env.BRIDGE_WORKER_NAME || "hetzner-bridge-test";
// v1.7/v1.9 (23.07.2026): Bridge-Heartbeat wieder alle 60 s (statt 5 min).
// Der 5-Minuten-Wert der IO-Notbremse führte in der UI zu "stale"-Anzeigen,
// obwohl die Verbindung stabil war. Der Heartbeat ist ein günstiges UPDATE mit
// fillfactor=80/HOT-Update — die zusätzliche Last ist vernachlässigbar.
const BRIDGE_HEARTBEAT_MS = parseInt(process.env.BRIDGE_HEARTBEAT_MS || "60000", 10);
// Session-Heartbeat alle 60 s: hält die aktive Session "live" und liefert
// gleichzeitig den updated_at-Puls für LoxoneWsStatus.
const SESSION_HEARTBEAT_MS = Math.max(
  30_000,
  parseInt(process.env.SESSION_HEARTBEAT_MS || "60000", 10),
);

const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || "8080", 10);
const WORKER_VERSION = process.env.WORKER_VERSION || "v1.12-block-diagnose";
// Phase 6.1: Watchdog-Schwelle von 10min auf 30min erhöht. Keepalive zählt jetzt als Lebenszeichen,
// daher reicht eine deutlich entspanntere Schwelle. Verhindert Reconnect-Stürme alle 11 Minuten.
const WATCHDOG_STALE_MS = parseInt(process.env.WATCHDOG_STALE_MS || "1800000", 10);
const WATCHDOG_CHECK_MS = parseInt(process.env.WATCHDOG_CHECK_MS || "60000", 10);
// IO-Notbremse v1.3: Keepalive entspannt. Verhindert unnötige Reconnect-/Heartbeat-Stürme.
const KEEPALIVE_INTERVAL_MS = Math.max(
  300000,
  parseInt(process.env.KEEPALIVE_INTERVAL_MS || "300000", 10),
);
// Phase 7.8: Stuck-Slot-Reset — zerstört einen Slot, der über N Minuten keinen
// erfolgreichen ws-open hatte, während andere Serials im selben Worker gesund laufen.
const NO_OPEN_TIMEOUT_MIN = Math.max(1, parseInt(process.env.NO_OPEN_TIMEOUT_MIN || "15", 10));
const NO_OPEN_TIMEOUT_MS = NO_OPEN_TIMEOUT_MIN * 60 * 1000;
// Phase 6: Reconnects unter dieser Schwelle behalten die alte session_id (kein neuer Log-Eintrag)
const SESSION_REUSE_WINDOW_MS = parseInt(process.env.SESSION_REUSE_WINDOW_MS || "60000", 10);
// Phase 6: bridge_event_log nur ab dieser Severity in DB schreiben
const BRIDGE_LOG_DB_MIN_SEVERITY = (process.env.BRIDGE_LOG_DB_MIN_SEVERITY || "warn") as "debug" | "info" | "warn" | "error";


if (!SUPABASE_URL || !GATEWAY_API_KEY) {
  console.error("[FATAL] SUPABASE_URL und GATEWAY_API_KEY müssen gesetzt sein");
  process.exit(1);
}

const INGEST_URL = `${SUPABASE_URL}/functions/v1/gateway-ingest`;
const KILLSWITCH_URL = `${SUPABASE_URL}/functions/v1/worker-killswitch?key=loxone_ws_worker`;
const KILLSWITCH_POLL_MS = Math.max(
  300000,
  parseInt(process.env.KILLSWITCH_POLL_MS || "300000", 10),
);

// Globaler Pausen-Zustand. Wird im Killswitch-Poll gesetzt.
let workerPaused = false;

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

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const anyErr = err as any;
    const code = anyErr?.LL?.Code ?? anyErr?.Code ?? anyErr?.code;
    const value = anyErr?.LL?.value ?? anyErr?.value ?? anyErr?.message;
    if (code || value) return `code=${code ?? "?"} value=${value ?? "?"}`;
    try { return JSON.stringify(err); } catch { return String(err); }
  }
  return String(err ?? "unknown");
}

// ─── Spike-Filter ────────────────────────────────────────────────────────────

const SPIKE_THRESHOLDS: Record<string, number> = {
  strom: 10000, gas: 5000, wasser: 1000, wärme: 5000, kälte: 2000, default: 50000,
};
// Zählerstände (today/month/year/total) können viele 100.000 kWh groß sein → keinen kW-Spike-Filter darauf anwenden.
function isSpike(v: number, energyType: string, role: StateRole = "pwr"): boolean {
  if (!isFinite(v) || isNaN(v)) return true;
  if (role === "soc") return v < 0 || v > 100;
  if (role !== "pwr") return false; // Energiewerte/aux nicht filtern
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

async function pushLoxoneStructureSnapshot(state: ConnState, structure: any): Promise<void> {
  if (!structure?.controls) return;
  try {
    const r = await ingestPost("loxone-structure-snapshot", {
      location_integration_id: state.locationIntegrationId,
      serial_number: state.serialNumber,
      structure,
    });
    log("info", `[WS] ${state.serialNumber} Struktur-Snapshot gespeichert (sensors=${r?.sensors ?? "?"})`);
  } catch (err) {
    log("warn", `[WS] ${state.serialNumber} Struktur-Snapshot fehlgeschlagen: ${describeError(err)}`);
  }
}

/**
 * Erkennt in einer Loxone-Fehlermeldung eine Anmelde-Ablehnung (falscher User/Passwort).
 * Loxone antwortet je nach Firmware mit HTTP 401, HTTP 400 "Bad credentials" oder LL.Code=401/1000.
 */
function isAuthError(err: unknown): boolean {
  const s = describeError(err).toLowerCase();
  return (
    s.includes("401") ||
    s.includes("unauthorized") ||
    s.includes("bad credentials") ||
    s.includes("wrong user") ||
    s.includes("wrong password") ||
    s.includes("invalid user") ||
    s.includes("invalid password") ||
    s.includes("authentication failed") ||
    /code=(?:401|1000)\b/.test(s)
  );
}

/**
 * Meldet dem Backend, ob die im Cloud-Config hinterlegten Zugangsdaten am
 * Miniserver akzeptiert wurden. Bei "auth_failed" wird zusätzlich ein
 * integration_errors-Eintrag angelegt, damit der Fehler im Tenant-UI sichtbar
 * ist (rotes Badge auf der Integrations-Kachel) und nicht nur im Container-Log.
 */
async function markAuthStatus(state: ConnState, status: "success" | "auth_failed", reason?: string): Promise<void> {
  try {
    await ingestPost("mark-loxone-auth-status", {
      location_integration_id: state.locationIntegrationId,
      serial_number: state.serialNumber,
      status,
      reason: reason ?? null,
      username_tried: state.username,
    });
  } catch (err) {
    log("debug", `[Auth] mark-loxone-auth-status fehlgeschlagen: ${(err as Error).message}`);
  }
}


// ─── Bridge-Worker (Phase 2): Heartbeat & Event-Log ──────────────────────────

async function bridgeHeartbeat(status: "online" | "degraded" | "offline" = "online", lastError: string | null = null): Promise<void> {
  const linksState: Array<{ miniserver_serial: string; last_connected_at?: string; last_event_at?: string }> = [];
  for (const s of connections.values()) {
    const item: any = { miniserver_serial: s.serialNumber };
    if (s.lastConnectedAt) item.last_connected_at = new Date(s.lastConnectedAt).toISOString();
    if (s.lastEventAt) item.last_event_at = new Date(s.lastEventAt).toISOString();
    linksState.push(item);
  }
  try {
    await ingestPost("bridge-heartbeat", {
      worker_name: BRIDGE_WORKER_NAME,
      version: WORKER_VERSION,
      host: WORKER_HOST,
      status,
      last_error: lastError,
      links_state: linksState,
    });
  } catch (err) {
    log("debug", `[Bridge] heartbeat fehlgeschlagen: ${(err as Error).message}`);
  }
}

const SEVERITY_RANK: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const BRIDGE_LOG_DB_THRESHOLD = SEVERITY_RANK[BRIDGE_LOG_DB_MIN_SEVERITY] ?? 2;

async function bridgeLog(
  severity: "debug" | "info" | "warn" | "error",
  event_type: string,
  message: string,
  miniserver_serial?: string,
  details?: unknown,
): Promise<void> {
  // Phase 6 (IO-Optimierung): Routine-Infos NICHT in bridge_event_log persistieren.
  // Sie erscheinen weiterhin in der Container-Konsole (log(...)) für Debugging.
  if ((SEVERITY_RANK[severity] ?? 1) < BRIDGE_LOG_DB_THRESHOLD) return;
  try {
    await ingestPost("bridge-log-event", {
      worker_name: BRIDGE_WORKER_NAME,
      severity, event_type, message, miniserver_serial, details,
    });
  } catch {
    /* still log locally via log(); never crash on event-log failure */
  }
}

// ─── Typen ───────────────────────────────────────────────────────────────────

interface WsMeter {
  id: string;
  name: string;
  energy_type: string;
  sensor_uuid: string | null;
  tenant_id: string;
  location_integration_id: string;
  location_integration: {
    id: string;
    config: { serial_number?: string; username?: string; password?: string };
  };
}

interface WsIntegration {
  id: string;
  tenant_id: string;
  location_id: string;
  config: { serial_number?: string; username?: string; password?: string };
}

// Rolle einer State-UUID innerhalb eines Loxone-Blocks
//   pwr     → momentane Leistung (kW)
//   today   → Tagesverbrauch (kWh)
//   total   → Zählerstand gesamt (kWh)
//   month   → Monatsverbrauch (kWh, optional)
//   year    → Jahresverbrauch (kWh, optional)
//   soc     → Speicher-Ladezustand / Storage level (%, Slvl)
//   aux     → noch nicht klassifizierter State (v1.11): wird zur Laufzeit
//             anhand des Werteverlaufs zu "pwr" oder "total" befördert
type StateRole = "pwr" | "today" | "total" | "month" | "year" | "soc" | "aux";

interface UuidEntry {
  meter_id: string;
  tenant_id: string;
  energy_type: string;
  block_uuid: string;          // Original sensor_uuid aus DB (Block-UUID)
  role: StateRole;             // Rolle dieser State-UUID
  latest_value: number | null;
  last_pushed_value: number | null;
  last_pushed_at: number; // ms epoch
  // v1.5: Worker-seitige 5-Min-Aggregation für Power (role="pwr").
  // Bucket-Start = Math.floor(ts / 300000) * 300000 (ms).
  bucket_start: number;        // ms epoch, 0 = kein aktiver Bucket
  bucket_sum: number;          // Summe aller Werte im Bucket (für avg)
  bucket_max: number;          // Max im Bucket
  bucket_count: number;        // Anzahl Samples im Bucket
  // v1.11: Auto-Klassifikation unbekannter States
  state_key?: string;          // Loxone-State-Name (z.B. "actual", "total", "Leistung")
  obs_count?: number;          // Anzahl beobachteter Samples
  obs_prev?: number | null;    // vorheriger Wert
  obs_decreased?: boolean;     // Wert ist mindestens einmal gefallen / war negativ
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
  // Bridge-Worker (Phase 2) Zeitstempel
  lastConnectedAt: number; // ms epoch, 0 = nie
  lastEventAt: number;     // ms epoch, 0 = nie
  // Phase 7.8: Stuck-Slot-Erkennung
  lastOpenAttemptAt: number; // ms epoch, letzter connect()-Versuch
  lastOpenSuccessAt: number; // ms epoch, letzter erfolgreicher ws-open
  // Phase 6 (IO-Optimierung): deferred session-end für Reconnect-Dedup
  pendingEndTimer: NodeJS.Timeout | null;
  pendingEndReason: string | null;
  // Phase 6.2 Diagnose: zähle erste Roh-Events pro Connection
  diagEventCount: number;
  diagCallbacksSeen: Set<string>;
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
    if (finalUrl) {
      const host = new URL(finalUrl).host;
      const hostLc = host.toLowerCase();
      // Nur cachen, wenn der Redirect wirklich auf die dyndns-Adresse des Miniservers zeigt.
      // Andernfalls (z.B. wenn r.url noch die dns.loxonecloud.com-Ausgangs-URL ist) NICHT
      // fälschlich "dns.loxonecloud.com" als Ziel-Host speichern → sonst 404 bei LxCommunicator.open().
      if (hostLc !== "dns.loxonecloud.com" && hostLc.includes(serial.toLowerCase())) {
        dnsCache.set(serial, host);
        log("info", `[DNS] ${serial} → ${host}`);
        return host;
      }
      log("warn", `[DNS] ${serial} kein gültiger Redirect-Host (finalUrl=${finalUrl}) — Fallback`);
    }
  } catch (err) {
    log("warn", `[DNS] ${serial} fehlgeschlagen: ${(err as Error).message}`);
  }
  // Fallback NICHT dauerhaft cachen: beim nächsten Reconnect erneut versuchen, den echten Cloud-Host aufzulösen.
  const fb = `${serial.toLowerCase()}.dns.loxonecloud.com`;
  return fb;
}

// ─── Session-Log ─────────────────────────────────────────────────────────────

async function sessionStart(state: ConnState): Promise<void> {
  // Phase 6: Wenn noch ein deferred sessionEnd anhängt, abbrechen und alte Session wiederverwenden.
  if (state.pendingEndTimer) {
    clearTimeout(state.pendingEndTimer);
    state.pendingEndTimer = null;
    state.pendingEndReason = null;
    if (state.sessionId) {
      log("info", `[Session] ${state.serialNumber} Reconnect < ${SESSION_REUSE_WINDOW_MS / 1000}s – behalte session_id ${state.sessionId}`);
      return;
    }
  }
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
  // Phase 6 (IO-Optimierung): sessionEnd verzögern – bei schnellem Reconnect kein neuer Log-Eintrag.
  if (state.pendingEndTimer) clearTimeout(state.pendingEndTimer);
  state.pendingEndReason = reason;
  state.pendingEndTimer = setTimeout(() => {
    state.pendingEndTimer = null;
    void flushSessionEnd(state);
  }, SESSION_REUSE_WINDOW_MS);
}

async function flushSessionEnd(state: ConnState): Promise<void> {
  if (!state.sessionId) return;
  const reason = state.pendingEndReason ?? "unknown";
  state.pendingEndReason = null;
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
  if (workerPaused) {
    log("debug", `[WS] connect ${state.serialNumber} übersprungen — Worker pausiert`);
    return;
  }
  if (state.ws) { try { state.ws.close(); } catch { /* ignore */ } state.ws = null; }
  state.authenticated = false;
  state.lastOpenAttemptAt = Date.now();

  // Phase 7.6 (Diagnose): stage-Marker durch den gesamten connect()-Try, damit ein
  // Fehler eindeutig einer Sub-Phase zugeordnet werden kann (statt „irgendwo im connect").
  // stage wird sowohl in bridgeLog(details.stage) als auch in der Konsole geloggt.
  let stage: string = "dns-resolve";

  const host = await resolveLoxoneHost(state.serialNumber);
  if (!host) {
    bridgeLog("warn", "dns_failed", `DNS-Auflösung fehlgeschlagen: ${state.serialNumber}`, state.serialNumber, {
      stage,
      location_integration_id: state.locationIntegrationId,
      miniserver_serial: state.serialNumber,
    });
    scheduleReconnect(state, "dns-failed");
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const LxCommunicator = require("lxcommunicator");
  const config = new LxCommunicator.WebSocketConfig(
    LxCommunicator.WebSocketConfig.protocol.WSS,
    state.serialNumber,
    "LoxoneWsWorker",
    LxCommunicator.WebSocketConfig.permission.APP,
    false,
  );

  // Phase 6.2 Diagnose-Helfer: loggt einmalig pro Callback-Name, dass dieser feuert
  const diagSeenCallback = (cbName: string) => {
    if (!state.diagCallbacksSeen.has(cbName)) {
      state.diagCallbacksSeen.add(cbName);
      log("info", `[DIAG] ${state.serialNumber} CALLBACK '${cbName}' feuert ZUM ERSTEN MAL`);
    }
  };

  config.delegate = {
    socketOnEventReceived: (_s: any, events: any[], evType?: any) => {
      diagSeenCallback("socketOnEventReceived");
      // Phase 6.2: Logge die ersten 20 Roh-Events pro Connection KOMPLETT,
      // damit wir die exakte Struktur sehen (uuid/value/Property-Namen).
      if (events && Array.isArray(events)) {
        for (const ev of events) {
          if (state.diagEventCount < 20) {
            state.diagEventCount++;
            try {
              log("info", `[DIAG] ${state.serialNumber} RAW EVENT #${state.diagEventCount} type=${evType ?? "?"} keys=${Object.keys(ev || {}).join(",")} json=${JSON.stringify(ev)}`);
            } catch {
              log("info", `[DIAG] ${state.serialNumber} RAW EVENT #${state.diagEventCount} (nicht serialisierbar)`);
            }
          }
        }
      } else {
        if (state.diagEventCount < 20) {
          state.diagEventCount++;
          try {
            log("info", `[DIAG] ${state.serialNumber} RAW EVENT-CONTAINER #${state.diagEventCount} type=${evType ?? "?"} json=${JSON.stringify(events)}`);
          } catch { /* ignore */ }
        }
      }
      // Original-Logik unverändert:
      for (const ev of (events || [])) {
        const uuid = (ev?.uuid || "").toLowerCase();
        const entry = state.uuidMap.get(uuid);
        if (entry && typeof ev.value === "number" && !isSpike(ev.value, entry.energy_type, entry.role)) {
          if (entry.role === "aux") classifyAux(state, entry, ev.value);
          entry.latest_value = ev.value;
          state.eventsReceived++;
          state.lastEventAt = Date.now();
          // v1.5: Bucket-Aggregation für Power. Zählerstände (kWh) werden
          // separat behandelt und laufen nicht in meter_power_readings_5min.
          if (entry.role === "pwr") {
            const bucket = Math.floor(Date.now() / 300000) * 300000;
            if (entry.bucket_start !== bucket) {
              // Bucket-Wechsel: alten Bucket wird per periodischem Flush geliefert.
              entry.bucket_start = bucket;
              entry.bucket_sum = 0;
              entry.bucket_max = 0;
              entry.bucket_count = 0;
            }
            const absV = Math.abs(ev.value);
            entry.bucket_sum += ev.value;
            entry.bucket_count += 1;
            if (absV > Math.abs(entry.bucket_max)) entry.bucket_max = ev.value;
          }
        }
      }
    },
    // Weitere bekannte lxcommunicator-Callbacks als Diagnose-Stubs:
    socketOnTextMessage: (_s: any, msg: any) => {
      diagSeenCallback("socketOnTextMessage");
      if (state.diagEventCount < 20) {
        state.diagEventCount++;
        try { log("info", `[DIAG] ${state.serialNumber} TEXT MSG #${state.diagEventCount} json=${JSON.stringify(msg).slice(0, 500)}`); } catch { /* ignore */ }
      }
    },
    socketOnBinaryMessage: (_s: any, msg: any) => {
      diagSeenCallback("socketOnBinaryMessage");
    },
    socketOnEventTableValuesUpdate: (_s: any, events: any[]) => {
      diagSeenCallback("socketOnEventTableValuesUpdate");
      if (state.diagEventCount < 20 && Array.isArray(events)) {
        for (const ev of events.slice(0, 5)) {
          state.diagEventCount++;
          try { log("info", `[DIAG] ${state.serialNumber} VALUES-UPDATE #${state.diagEventCount} json=${JSON.stringify(ev)}`); } catch { /* ignore */ }
        }
      }
    },
    socketOnEventTableTextUpdate: (_s: any, events: any[]) => {
      diagSeenCallback("socketOnEventTableTextUpdate");
    },
    socketOnKeepAlive: () => {
      diagSeenCallback("socketOnKeepAlive");
    },
    socketOnConnectionClosed: (_s: any, code: number) => {
      log("warn", `[WS] ${state.serialNumber} geschlossen (code=${code})`);
      bridgeLog("warn", "ws_closed", `WebSocket geschlossen (code=${code})`, state.serialNumber, { code });
      state.authenticated = false;
      state.ws = null;
      sessionEnd(state, `close-${code}`);
      scheduleReconnect(state, `close-${code}`);
    },
    socketOnTokenRefreshFailed: () => {
      log("warn", `[WS] Token-Refresh fehlgeschlagen: ${state.serialNumber}`);
      bridgeLog("error", "token_refresh_failed", "Token-Refresh fehlgeschlagen", state.serialNumber);
    },
  };

  const socket = new LxCommunicator.WebSocket(config);
  state.ws = socket;

  log("info", `[WS] verbinde ${state.serialNumber} → ${host}`);
  try {
    stage = "ws-open";
    await socket.open(host, state.username, state.password);
    // Phase 6.3: Loxone-Requirement — Strukturdatei muss 1x nach Auth abgerufen werden,
    // sonst sendet der Miniserver keine Status-Änderungen (nur Initial-Snapshot).
    // Phase 7: Antwort auch parsen, um pro registriertem Block (sensor_uuid) die
    // zugehörigen State-UUIDs (Pwr/EnergyToday/EnergyTotal/...) zu ermitteln.
    let loxApp3: any = null;
    try {
      stage = "loxapp3-fetch";
      const resp: any = await socket.send("data/LoxAPP3.json");
      loxApp3 = resp?.LL?.value ?? resp?.value ?? resp;
      if (typeof loxApp3 === "string") {
        try { loxApp3 = JSON.parse(loxApp3); } catch { /* leave as string */ }
      }
      const controlCount = loxApp3?.controls ? Object.keys(loxApp3.controls).length : 0;
      log("info", `[WS] ${state.serialNumber} LoxAPP3.json geladen — Live-Updates aktiviert (controls=${controlCount})`);
      stage = "loxapp3-push-cloud";
      await pushLoxoneStructureSnapshot(state, loxApp3);
    } catch (err) {
      log("warn", `[WS] ${state.serialNumber} LoxAPP3 fehlgeschlagen (stage=${stage}): ${describeError(err)}`);
    }
    stage = "enable-binstatus";
    await socket.send("jdev/sps/enablebinstatusupdate");
    // Phase 5.1: zusätzlich analoge Statusupdates abonnieren (kWh, Power, Temperatur, Zählerstände)
    stage = "enable-statusupdate";
    await socket.send("jdev/sps/enablestatusupdate");
    state.authenticated = true;
    state.reconnectDelay = 1000;
    state.lastConnectedAt = Date.now();
    state.lastOpenSuccessAt = Date.now();
    state.diagEventCount = 0;
    state.diagCallbacksSeen = new Set<string>();
    stage = "session-start";

    await sessionStart(state);
    // Auth erfolgreich → falls die Integration vorher als "auth_failed" markiert war,
    // Status im Backend auf "success" zurücksetzen und offene Auth-Fehler auflösen.
    void markAuthStatus(state, "success");


    // ── Phase 7: State-UUIDs pro Block aus LoxAPP3 expandieren ───────────────
    // state.uuidMap enthält initial die Block-UUIDs (sensor_uuid aus DB) mit role="pwr".
    // Für Meter-Blöcke ersetzen wir den Eintrag durch mehrere State-UUID-Einträge
    // (Pwr, EnergyToday, EnergyTotal, ...). Block-UUID bleibt im Eintrag erhalten,
    // damit der Aggregator/Broadcast weiterhin auf den Meter zuordnen kann.
    const blockEntries = Array.from(state.uuidMap.entries());
    state.uuidMap.clear();

    // v1.9: Split pwr in „strong" (eindeutige Momentanleistungs-States) und
    // „ambiguous" (Actual/Value/P — bei Wasser-/Gaszähler oft der kumulative
    // Zählerstand). Für Medien ohne echte Leistung akzeptieren wir nur strong-pwr.
    // States, die nie Messwerte sind (Sperren, Texte, Fehler, Icons)
    const IGNORED_STATE_RX = /(locked|jlock|error|textandicon|text|icon|status|mode|entries|link|image|format|sort|serial|name)/i;
    const PWR_STRONG_RX = /^(pwr|power|currentpower|actualpower|cp|chargingpower|currentchargingpower)$/i;
    const PWR_AMBIGUOUS_RX = /^(actual|value|p)$/i;
    const ROLE_PATTERNS: Array<{ role: StateRole; rx: RegExp }> = [
      // Reihenfolge wichtig: spezifischere Patterns zuerst
      { role: "today", rx: /^(energytoday|today|daily|day|tagesverbrauch|cd)$/i },
      { role: "month", rx: /^(energymonth|month|monthly|monatsverbrauch|cm)$/i },
      { role: "year",  rx: /^(energyyear|year|yearly|jahresverbrauch|cy)$/i },
      { role: "total", rx: /^(energytotal|total|totalenergy|zaehlerstand|meter|mr)$/i },
      { role: "soc",   rx: /^(slvl|soc|stateofcharge|state_of_charge|storagelevel|storage_level|ladezustand|speicherstand)$/i },
    ];
    function classifyState(key: string): StateRole | "pwr_ambiguous" | null {
      for (const { role, rx } of ROLE_PATTERNS) if (rx.test(key)) return role;
      if (PWR_STRONG_RX.test(key)) return "pwr";
      if (PWR_AMBIGUOUS_RX.test(key)) return "pwr_ambiguous";
      return null;
    }

    /**
     * Zählertypen, deren Loxone-Block **keinen** echten Momentanleistungs-State
     * bereitstellen muss (Impulszähler o. ä.). Für diese Typen dürfen wir
     * mehrdeutige Keys (Actual/Value/P) NICHT als Leistung interpretieren —
     * sonst landet der kumulative Zählerstand als „pwr" in der DB (Spikes).
     */
    function isFlowLikeType(et: string | undefined | null): boolean {
      const t = (et ?? "").toLowerCase();
      return t === "wasser" || t === "gas" || t === "water";
    }
    let blocksMapped = 0;
    let blocksFallback = 0;
    let totalSubs = 0;
    const controlsMap: Record<string, any> = (loxApp3?.controls && typeof loxApp3.controls === "object")
      ? loxApp3.controls
      : {};
    const controlsByLowerKey = new Map<string, any>();
    for (const [k, v] of Object.entries(controlsMap)) controlsByLowerKey.set(k.toLowerCase(), v);
    const findControl = (uuid: string): any | undefined => {
      const lower = uuid.toLowerCase();
      const direct = controlsByLowerKey.get(lower);
      if (direct) return direct;
      for (const ctrl of controlsByLowerKey.values()) {
        const ua = (ctrl?.uuidAction as string | undefined)?.toLowerCase();
        if (ua === lower) return ctrl;
      }
      return undefined;
    };
    // v1.12: Diagnose-Sammler — pro Block ALLE States inkl. zugewiesener Rolle,
    // damit in der Cloud sichtbar ist, welcher State die Leistung liefert.
    const blockDiag: Array<{
      block_uuid: string;
      meter_id: string;
      energy_type: string;
      control_type: string;
      control_name: string;
      states: Array<{ key: string; role: string }>;
    }> = [];
    for (const [blockUuid, baseEntry] of blockEntries) {
      const ctrl = findControl(blockUuid);
      const states = ctrl?.states as Record<string, string> | undefined;
      // v1.12: vollständige State-Liste des Blocks (für Diagnose-Events)
      const allStateKeys: string[] = states && typeof states === "object" ? Object.keys(states) : [];
      const stateEntries: Array<{ stateUuid: string; role: StateRole; key: string }> = [];
      let ambiguousPwr: { stateUuid: string; key: string } | null = null;
      let hasStrongPwr = false;

      // v1.11: ALLE States eines Blocks einsammeln. Unbekannte Keys werden als
      // role="aux" registriert und zur Laufzeit anhand des Werteverlaufs
      // klassifiziert (fallend/negativ → Leistung, monoton steigend → Zählerstand).
      // Vorher wurden sie verworfen — dadurch blieben ganze Blöcke stumm.
      const unknownEntries: Array<{ stateUuid: string; key: string }> = [];
      if (states && typeof states === "object") {
        for (const [k, v] of Object.entries(states)) {
          if (typeof v !== "string") continue;
          const cls = classifyState(k);
          if (!cls) {
            if (IGNORED_STATE_RX.test(k)) continue;
            unknownEntries.push({ stateUuid: v.toLowerCase(), key: k });
            continue;
          }
          if (cls === "pwr_ambiguous") {
            if (!ambiguousPwr) ambiguousPwr = { stateUuid: v.toLowerCase(), key: k };
            continue;
          }
          if (cls === "pwr") hasStrongPwr = true;
          stateEntries.push({ stateUuid: v.toLowerCase(), role: cls, key: k });
        }
      }

      // Ambiguous-pwr NUR akzeptieren, wenn:
      //  – kein strong-pwr vorhanden, UND
      //  – der Meter kein reines Fluss-/Impuls-Medium (Wasser/Gas) ist.
      // Für Wasser/Gas ohne echten Pwr-State → Block läuft als Total-only.
      const flowLike = isFlowLikeType(baseEntry.energy_type);
      if (!hasStrongPwr && ambiguousPwr && !flowLike) {
        stateEntries.push({ stateUuid: ambiguousPwr.stateUuid, role: "pwr", key: ambiguousPwr.key });
      } else if (!hasStrongPwr && ambiguousPwr && flowLike) {
        log("info", `[LoxAPP3] ${state.serialNumber} block ${blockUuid} (${baseEntry.energy_type}): ambiguous pwr-key "${ambiguousPwr.key}" ignoriert (kein echter Momentanwert für ${baseEntry.energy_type})`);
      }

      // v1.11: Wenn der Block keine erkennbare Leistung hat, die unbekannten
      // States als Kandidaten (aux) aufnehmen. Für Wasser/Gas werden sie nie zu
      // "pwr" befördert (v1.9-Lehre: Zählerstand ≠ Momentanleistung), können aber
      // als Zählerstand (total) enden.
      const hasPwrEntry = stateEntries.some((se) => se.role === "pwr");
      if (!hasPwrEntry && unknownEntries.length > 0) {
        for (const ue of unknownEntries) {
          stateEntries.push({ stateUuid: ue.stateUuid, role: "aux", key: ue.key });
        }
      }

      if (stateEntries.length === 0) {
        if (flowLike) {
          // v1.9: Fallback deaktiviert für Wasser/Gas — sonst würde der kumulative
          // Zählerstand als Momentanleistung interpretiert (660-kW-Spikes im Chart).
          log("warn", `[LoxAPP3] ${state.serialNumber} block ${blockUuid} (${baseEntry.energy_type}): kein verwertbarer State — Block wird ignoriert (Fallback deaktiviert für Fluss-Medien)`);
          blockDiag.push({
            block_uuid: blockUuid, meter_id: baseEntry.meter_id, energy_type: baseEntry.energy_type,
            control_type: String(ctrl?.type ?? "?"), control_name: String(ctrl?.name ?? "?"),
            states: allStateKeys.map((k) => ({ key: k, role: "ignored" })),
          });
          continue;
        }
        // Fallback: Block-UUID direkt als pwr behandeln (alte Logik) — nur für Strom/Wärme.
        state.uuidMap.set(blockUuid, { ...baseEntry, block_uuid: blockUuid, role: "pwr" });
        blocksFallback++;
        totalSubs++;
        blockDiag.push({
          block_uuid: blockUuid, meter_id: baseEntry.meter_id, energy_type: baseEntry.energy_type,
          control_type: String(ctrl?.type ?? "?"), control_name: String(ctrl?.name ?? "?"),
          states: [{ key: "(block-fallback)", role: "pwr" }],
        });
        continue;
      }

      // Dedup auf Rolle: falls mehrere Keys auf gleiche Rolle mappen, ersten nehmen
      const seenRoles = new Set<StateRole>();
      const diagStates: Array<{ key: string; role: string }> = [];
      for (const se of stateEntries) {
        // aux-Kandidaten dürfen mehrfach vorkommen (genau einer wird später "pwr")
        if (se.role !== "aux" && seenRoles.has(se.role)) {
          diagStates.push({ key: se.key, role: `${se.role} (dup, verworfen)` });
          continue;
        }
        seenRoles.add(se.role);
        state.uuidMap.set(se.stateUuid, {
          ...baseEntry,
          block_uuid: blockUuid,
          role: se.role,
          state_key: se.key,
          obs_count: 0,
          obs_prev: null,
          obs_decreased: false,
          latest_value: null,
          last_pushed_value: null,
          last_pushed_at: 0,
          bucket_start: 0,
          bucket_sum: 0,
          bucket_max: 0,
          bucket_count: 0,
        });
        diagStates.push({ key: se.key, role: se.role });
        totalSubs++;
      }
      // v1.12: auch die vom Klassifizierer ignorierten States protokollieren —
      // dort steckt bei „stummen" Blöcken oft der echte Leistungs-State.
      const usedKeys = new Set(diagStates.map((d) => d.key));
      for (const k of allStateKeys) if (!usedKeys.has(k)) diagStates.push({ key: k, role: "ignoriert" });
      blockDiag.push({
        block_uuid: blockUuid, meter_id: baseEntry.meter_id, energy_type: baseEntry.energy_type,
        control_type: String(ctrl?.type ?? "?"), control_name: String(ctrl?.name ?? "?"),
        states: diagStates,
      });
      blocksMapped++;
      log("info", `[LoxAPP3] ${state.serialNumber} block ${blockUuid} → ${[...seenRoles].join(",")} (type=${ctrl?.type ?? "?"}, energy_type=${baseEntry.energy_type})`);
    }

    // v1.11: Blöcke ohne erkannte Momentanleistung melden — so ist die
    // Mapping-Lücke in der Cloud sichtbar (bridge_event_log), statt nur im Container-Log.
    const blocksWithPwr = new Set<string>();
    const blocksWithAux = new Map<string, string[]>();
    for (const e of state.uuidMap.values()) {
      if (e.role === "pwr") blocksWithPwr.add(e.block_uuid);
      if (e.role === "aux") blocksWithAux.set(e.block_uuid, [...(blocksWithAux.get(e.block_uuid) ?? []), e.state_key ?? "?"]);
    }
    const gaps = blockEntries
      .map(([b, be]) => ({ block_uuid: b, meter_id: be.meter_id, energy_type: be.energy_type, aux_keys: blocksWithAux.get(b) ?? [] }))
      .filter((g) => !blocksWithPwr.has(g.block_uuid));
    if (gaps.length > 0) {
      log("warn", `[WS] ${state.serialNumber} ${gaps.length} Block(s) ohne Momentanleistung — Auto-Klassifikation läuft`);
      bridgeLog("warn", "ws_mapping_gap", `${gaps.length} Block(s) ohne erkannte Momentanleistung`, state.serialNumber, { gaps: gaps.slice(0, 50) });
    }

    // ── v1.12: Block-State-Diagnose ────────────────────────────────────────
    // Pro Block ALLE Loxone-State-Namen samt zugewiesener Rolle in die Cloud
    // melden (severity=warn → landet in bridge_event_log). Damit lässt sich die
    // Mapping-Lücke ohne Raten schließen. In Chunks, damit die Payload klein bleibt.
    {
      const CHUNK = 12;
      for (let i = 0; i < blockDiag.length; i += CHUNK) {
        const chunk = blockDiag.slice(i, i + CHUNK);
        void bridgeLog(
          "warn",
          "ws_block_states",
          `Block-States ${i + 1}-${i + chunk.length} von ${blockDiag.length}`,
          state.serialNumber,
          { part: Math.floor(i / CHUNK) + 1, total_blocks: blockDiag.length, blocks: chunk },
        );
      }
    }

    // v1.12: 60 s nach Verbindungsaufbau die ersten Echtwerte je State melden —
    // schwankend/negativ ⇒ Leistung, monoton steigend ⇒ Zählerstand.
    const diagSerial = state.serialNumber;
    setTimeout(() => {
      const cur = connections.get(diagSerial);
      if (!cur || !cur.authenticated) return;
      const byBlock = new Map<string, Array<Record<string, unknown>>>();
      for (const e of cur.uuidMap.values()) {
        const arr = byBlock.get(e.block_uuid) ?? [];
        arr.push({
          key: e.state_key ?? "(block)",
          role: e.role,
          value: e.latest_value,
          obs_count: e.obs_count ?? 0,
          decreased: e.obs_decreased ?? false,
        });
        byBlock.set(e.block_uuid, arr);
      }
      const rows = Array.from(byBlock.entries()).map(([block_uuid, sts]) => {
        const any = Array.from(cur.uuidMap.values()).find((e) => e.block_uuid === block_uuid);
        return { block_uuid, meter_id: any?.meter_id, energy_type: any?.energy_type, states: sts };
      });
      const CHUNK = 12;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        void bridgeLog(
          "warn",
          "ws_block_state_values",
          `Werte-Snapshot ${i + 1}-${i + chunk.length} von ${rows.length} (60 s nach Verbindung)`,
          diagSerial,
          { part: Math.floor(i / CHUNK) + 1, total_blocks: rows.length, blocks: chunk },
        );
      }
    }, 60000);



    log("info", `[WS] ${state.serialNumber} LoxAPP3-Mapping: blocks=${blockEntries.length}, mapped=${blocksMapped}, fallback=${blocksFallback}, totalStateUuids=${totalSubs}`);
    bridgeLog("info", "ws_connected", `Verbunden, ${totalSubs} State-UUIDs aus ${blockEntries.length} Blöcken (mapped=${blocksMapped}, fallback=${blocksFallback})`, state.serialNumber, { blocks: blockEntries.length, mapped: blocksMapped, fallback: blocksFallback, totalStateUuids: totalSubs });

    // Phase 7.1: Initial-Snapshot pro Block-UUID holen (`jdev/sps/io/<block>/all` liefert ALLE States des Blocks).
    // State-UUIDs sind selbst NICHT subscribable (Loxone antwortet code=404). Live-Updates kommen
    // anschließend automatisch via `enablebinstatusupdate` für jede State-UUID.
    stage = "per-block-snapshot";
    const uniqueBlocks = new Set<string>();
    for (const entry of state.uuidMap.values()) {
      if (entry.block_uuid) uniqueBlocks.add(entry.block_uuid);
    }
    let subscribedOk = 0;
    let subscribedErr = 0;
    const failedBlocks: Array<{ block: string; reason: string }> = [];
    for (const blockUuid of uniqueBlocks) {
      try {
        await socket.send(`jdev/sps/io/${blockUuid}/all`);
        subscribedOk++;
      } catch (err) {
        subscribedErr++;
        const reason = describeError(err);
        failedBlocks.push({ block: blockUuid, reason });
        log("warn", `[WS] ${state.serialNumber} block-snapshot ${blockUuid} fehlgeschlagen: ${reason}`);
      }
    }
    stage = "connected";
    log("info", `[WS] ${state.serialNumber} per-block snapshot: ok=${subscribedOk} err=${subscribedErr} (blocks=${uniqueBlocks.size}, stateUuids=${state.uuidMap.size})`);
    bridgeLog("info", "ws_per_block_snapshot", `Per-block snapshot: ok=${subscribedOk} err=${subscribedErr}`, state.serialNumber, { ok: subscribedOk, err: subscribedErr, blocks: uniqueBlocks.size, stateUuids: state.uuidMap.size, failed: failedBlocks });
  } catch (err) {
    // DNS-Cache invalidieren: falls ein falscher Host gecacht wurde (z.B. dns.loxonecloud.com selbst),
    // zwingt das den nächsten Reconnect zu einer frischen Auflösung.
    dnsCache.delete(state.serialNumber);
    const reason = describeError(err);
    const auth = isAuthError(err);
    log(auth ? "error" : "warn", `[WS] Verbindung fehlgeschlagen ${state.serialNumber} (stage=${stage}): ${reason}${auth ? " (AUTH)" : ""}`);
    bridgeLog(auth ? "error" : "error", auth ? "ws_auth_failed" : "ws_connect_failed",
      auth ? `Anmeldung am Miniserver abgelehnt (stage=${stage}, User "${state.username}") — Zugangsdaten in Cloud-Config prüfen`
           : `Verbindung fehlgeschlagen (stage=${stage}): ${reason}`,
      state.serialNumber, {
        stage,
        reason,
        location_integration_id: state.locationIntegrationId,
        miniserver_serial: state.serialNumber,
        host,
        username_tried: auth ? state.username : undefined,
      });
    state.ws = null;
    if (auth) {
      // Backend über Auth-Fehler informieren → UI zeigt rotes Badge, Reconnect stark verlangsamt.
      void markAuthStatus(state, "auth_failed", reason);
      // Auth-Backoff: mindestens 5 Min, um den Miniserver nicht zu hämmern (Lockout-Risiko).
      state.reconnectDelay = Math.max(state.reconnectDelay, 300000);
    }
    scheduleReconnect(state, `connect-error[${stage}]: ${reason}`);
  }
}


function scheduleReconnect(state: ConnState, reason: string): void {
  if (workerPaused) {
    log("debug", `[WS] Reconnect ${state.serialNumber} übersprungen — Worker pausiert (reason=${reason})`);
    return;
  }
  if (state.reconnecting) return;
  state.reconnecting = true;
  state.reconnectCount++;
  // Exponential Backoff 1s → 60s + Jitter ±20 % (verhindert Thundering Herd)
  const base = state.reconnectDelay;
  const jitter = Math.floor(base * (Math.random() * 0.4 - 0.2));
  const delay = Math.max(500, base + jitter);
  state.reconnectDelay = Math.min(state.reconnectDelay * 2, 60000);
  log("info", `[WS] Reconnect ${state.serialNumber} in ${delay}ms (reason=${reason})`);
  bridgeLog("info", "ws_reconnect_scheduled", `Reconnect in ${delay}ms (Grund: ${reason})`, state.serialNumber, { delay_ms: delay, reason });
  setTimeout(() => {
    state.reconnecting = false;
    if (workerPaused) return;
    connect(state);
  }, delay);
}

// ─── Stuck-Slot-Reset (Phase 7.8) ─────────────────────────────────────────────
// Erkennt Slots, die über NO_OPEN_TIMEOUT_MIN keine erfolgreiche ws-open hatten,
// obwohl andere Serials im selben Worker gesund laufen. Das deutet auf einen
// prozessinternen Cache-Fehler hin (z. B. DNS/Redirect-State). Der Slot wird
// komplett verworfen und mit frischem Kontext neu aufgebaut.
function stuckSlotTick(): void {
  const now = Date.now();
  // Nur aktiv werden, wenn mindestens ein anderer Serial im selben Worker
  // aktuell gesund ist. Das verhindert Fehlalarme bei generellen Cloud-Ausfällen.
  const hasHealthyPeer = Array.from(connections.values()).some((s) => {
    if (!s.authenticated) return false;
    const ref = Math.max(s.lastEventAt, s.lastConnectedAt);
    return ref > 0 && now - ref < WATCHDOG_STALE_MS;
  });
  if (!hasHealthyPeer) return;

  for (const state of connections.values()) {
    if (state.authenticated) continue; // verbundene Slots sind OK
    // Wenn es jemals einen erfolgreichen open gab und der nicht zu lange her ist: OK
    if (state.lastOpenSuccessAt > 0 && now - state.lastOpenSuccessAt < NO_OPEN_TIMEOUT_MS) continue;

    const lastAttemptAge = state.lastOpenAttemptAt ? now - state.lastOpenAttemptAt : Number.MAX_SAFE_INTEGER;
    log("warn", `[StuckSlot] ${state.serialNumber} kein ws-open seit ${NO_OPEN_TIMEOUT_MIN}min bei gesunden Peers (letzter Versuch vor ${Math.round(lastAttemptAge / 1000)}s) → Slot-Reset`);
    bridgeLog("warn", "stuck_slot_reset", `Kein ws-open seit ${NO_OPEN_TIMEOUT_MIN}min, Slot-Reset`, state.serialNumber, {
      no_open_minutes: NO_OPEN_TIMEOUT_MIN,
      last_attempt_age_ms: lastAttemptAge,
    });
    // Slot komplett zerstören: DNS-Cache, WS-Handle, Auth-State, Backoff
    dnsCache.delete(state.serialNumber);
    try { state.ws?.close(); } catch { /* ignore */ }
    state.ws = null;
    state.authenticated = false;
    state.reconnecting = false;
    state.reconnectDelay = 1000;
    state.lastOpenAttemptAt = 0;
    if (state.sessionId) {
      sessionEnd(state, "stuck-slot-reset");
    }
    // 60s Cooldown, dann frischer Verbindungsaufbau
    scheduleReconnect(state, "stuck-slot-reset");
  }
}


// ─── Watchdog (Phase 3) ──────────────────────────────────────────────────────
// Erkennt "tote" WebSockets, bei denen lxcommunicator zwar noch verbunden ist,
// aber seit WATCHDOG_STALE_MS keine Events mehr eintreffen. Erzwingt Reconnect.
function watchdogTick(): void {

  const now = Date.now();
  for (const state of connections.values()) {
    if (!state.authenticated || state.uuidMap.size === 0) continue;
    // Referenzzeit: letztes Event ODER letzter erfolgreicher Connect
    const ref = state.lastEventAt || state.lastConnectedAt;
    if (!ref) continue;
    const idleMs = now - ref;
    if (idleMs >= WATCHDOG_STALE_MS) {
      log("warn", `[Watchdog] ${state.serialNumber} seit ${Math.round(idleMs / 1000)}s ohne Event → forciere Reconnect`);
      bridgeLog("warn", "watchdog_stale", `Kein Event seit ${Math.round(idleMs / 1000)}s, forciere Reconnect`, state.serialNumber, { idle_ms: idleMs });
      try { state.ws?.close(); } catch { /* ignore */ }
      state.authenticated = false;
      state.ws = null;
      sessionEnd(state, "watchdog-stale");
      scheduleReconnect(state, "watchdog-stale");
    }
  }
}

// ─── Keep-Alive (Phase 4) ────────────────────────────────────────────────────
// Sendet alle KEEPALIVE_INTERVAL_MS einen leichten Befehl an jeden Miniserver.
// Zweck:
//   1. Hält NAT/Firewall-Pfade offen (verhindert "silent drops")
//   2. Validiert Socket & Token: schlägt Send fehl → sofortiger Reconnect
//      (statt bis zu 5 Min auf den Watchdog zu warten).
async function keepaliveTick(): Promise<void> {
  for (const state of connections.values()) {
    if (!state.authenticated || !state.ws) continue;
    try {
      await state.ws.send("jdev/cfg/api");
      // Phase 6.1: Erfolgreicher Keepalive zählt als Lebenszeichen. Verhindert,
      // dass der Watchdog Verbindungen nur deshalb trennt, weil 10 Minuten lang
      // kein Wert-Event kam (Miniserver schickt nur bei Änderungen).
      state.lastEventAt = Date.now();
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      log("warn", `[Keepalive] ${state.serialNumber} fehlgeschlagen: ${msg} → Reconnect`);
      bridgeLog("warn", "keepalive_failed", `Keep-Alive fehlgeschlagen: ${msg}`, state.serialNumber);
      try { state.ws?.close(); } catch { /* ignore */ }
      state.authenticated = false;
      state.ws = null;
      await sessionEnd(state, "keepalive-failed");
      scheduleReconnect(state, "keepalive-failed");
    }
  }
}

// ─── Live-Push (v1.10: Realtime-Broadcast OHNE Datenbank-Schreiblast) ────────
// Schickt die aktuellen WS-Werte an gateway-ingest?action=bridge-readings mit
// `live_only: true`. Die Edge-Function verteilt sie ausschließlich über den
// Realtime-Kanal `loxone-live-<tenant_id>` (Energiefluss-Monitor, Aktuelle
// Werte, Gerätekacheln/Steuerungen) und schreibt NICHTS in die Datenbank.
// Historisierung läuft unverändert über flushBuckets() → bridge-power-5min.


// ─── v1.11: Laufzeit-Klassifikation unbekannter States ───────────────────────
// Loxone-Blöcke benennen ihre States uneinheitlich (z.B. "Leistung", "AI1",
// kundeneigene Bausteine). Statt solche States zu verwerfen, beobachten wir den
// Werteverlauf:
//   • Wert fällt irgendwann oder ist negativ  → Momentanleistung  (role="pwr")
//   • Wert steigt monoton über mehrere Samples → Zählerstand      (role="total")
// Für Wasser/Gas wird NIE zu "pwr" befördert (Zählerstand ≠ Leistung).
const AUX_MIN_SAMPLES = 3;

function blockHasRole(state: ConnState, blockUuid: string, role: StateRole): boolean {
  for (const e of state.uuidMap.values()) {
    if (e.block_uuid === blockUuid && e.role === role) return true;
  }
  return false;
}

function classifyAux(state: ConnState, entry: UuidEntry, value: number): void {
  const prev = entry.obs_prev ?? null;
  entry.obs_count = (entry.obs_count ?? 0) + 1;
  if (value < 0 || (prev !== null && value < prev - 1e-6)) entry.obs_decreased = true;
  entry.obs_prev = value;
  if ((entry.obs_count ?? 0) < AUX_MIN_SAMPLES) return;

  const et = (entry.energy_type ?? "").toLowerCase();
  const flowLike = et === "wasser" || et === "gas" || et === "water";

  if (entry.obs_decreased && !flowLike) {
    if (blockHasRole(state, entry.block_uuid, "pwr")) return; // anderer State war schneller
    if (isSpike(value, entry.energy_type, "pwr")) return;     // implausibel → kein pwr
    entry.role = "pwr";
    entry.bucket_start = 0; entry.bucket_sum = 0; entry.bucket_max = 0; entry.bucket_count = 0;
    log("info", `[AutoMap] ${state.serialNumber} block ${entry.block_uuid} state "${entry.state_key}" → pwr (Werteverlauf schwankend)`);
    bridgeLog("warn", "ws_automap_pwr", `State "${entry.state_key}" als Momentanleistung erkannt`, state.serialNumber, {
      block_uuid: entry.block_uuid, meter_id: entry.meter_id, state_key: entry.state_key, sample: value,
    });
    return;
  }

  if (!entry.obs_decreased && (entry.obs_count ?? 0) >= AUX_MIN_SAMPLES && value > 0) {
    if (blockHasRole(state, entry.block_uuid, "total")) return;
    entry.role = "total";
    log("info", `[AutoMap] ${state.serialNumber} block ${entry.block_uuid} state "${entry.state_key}" → total (monoton steigend)`);
  }
}

async function flush(): Promise<void> {
  if (workerPaused) return;
  const readings: any[] = [];
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  for (const state of connections.values()) {
    if (!state.authenticated) continue;
    for (const [, entry] of state.uuidMap) {
      if (entry.latest_value === null) continue;
      if (entry.role === "aux") continue; // v1.11: noch nicht klassifiziert → nicht senden

      // Nur senden, wenn sich der Wert spürbar geändert hat ODER der letzte
      // Push älter als MIN_PUSH_INTERVAL_MS ist (Keepalive).
      // Energiezähler (today/total/month/year) ändern sich in kleinen Schritten →
      // niedrigere Mindest-Änderung, damit kWh-Inkremente nicht verschluckt werden.
      // SOC (%) soll ebenfalls zuverlässig als eigener Rollenwert gesendet werden.
      const prev = entry.last_pushed_value;
      const ageMs = nowMs - entry.last_pushed_at;
      const delta = prev === null ? Infinity : Math.abs(entry.latest_value - prev);
      const minDelta = entry.role === "pwr" ? MIN_DELTA : entry.role === "soc" ? 0.1 : 0.001;
      const changed = delta >= minDelta;
      const stale = ageMs >= MIN_PUSH_INTERVAL_MS;
      if (!changed && !stale) continue;

      readings.push({
        miniserver_serial: state.serialNumber,
        sensor_uuid: entry.block_uuid,   // immer Block-UUID, damit DB-Mapping konsistent bleibt
        role: entry.role,                 // rollenbasiertes Routing in gateway-ingest
        value: entry.latest_value,
        recorded_at: nowIso,
      });
      entry.last_pushed_value = entry.latest_value;
      entry.last_pushed_at = nowMs;
    }
  }
  if (readings.length === 0) return;

  // Deckelung: bei sehr vielen Änderungen in einem Zyklus nur die ersten N
  // Events senden — der Rest folgt im nächsten Zyklus (Werte sind ohnehin
  // auf den jeweils letzten Stand gecoalesct).
  const batch = readings.length > MAX_LIVE_EVENTS_PER_PUSH
    ? readings.slice(0, MAX_LIVE_EVENTS_PER_PUSH)
    : readings;
  if (batch.length < readings.length) {
    log("warn", `[Live] ${readings.length} Events > Limit ${MAX_LIVE_EVENTS_PER_PUSH} — sende ${batch.length}, Rest im nächsten Zyklus`);
  }

  try {
    await ingestPost("bridge-readings", {
      worker_name: BRIDGE_WORKER_NAME,
      live_only: true,   // v1.10: reiner Broadcast, keine DB-Schreiblast
      readings: batch,
    });
    log("debug", `[Live] ${batch.length} Werte per Broadcast gepusht (live_only)`);
  } catch (err) {
    log("warn", `[Live] Push fehlgeschlagen: ${(err as Error).message}`);
  }
}



// ─── Killswitch (Pausen-Schalter aus dem Cloud-Backend) ──────────────────────

async function pollKillswitch(): Promise<void> {
  try {
    const r = await fetch(KILLSWITCH_URL, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) {
      log("warn", `[Killswitch] HTTP ${r.status} — ignoriere, behalte Zustand bei`);
      return;
    }
    const body = await r.json() as { enabled?: boolean };
    const enabled = body.enabled !== false;
    const nextPaused = !enabled;
    if (nextPaused === workerPaused) return; // kein Zustandswechsel

    if (nextPaused) {
      workerPaused = true;
      log("warn", `[Killswitch] Worker wurde im Admin-Dashboard PAUSIERT. Trenne alle WS-Verbindungen.`);
      await bridgeLog("warn", "worker_paused", "Worker via worker_controls pausiert");
      await bridgeHeartbeat("degraded", "paused-by-admin");
      for (const state of connections.values()) {
        try { state.ws?.close(); } catch { /* ignore */ }
        state.ws = null;
        state.authenticated = false;
        state.reconnecting = false;
        try { await sessionEnd(state, "killswitch-pause"); } catch { /* ignore */ }
      }
    } else {
      workerPaused = false;
      log("info", `[Killswitch] Worker wurde im Admin-Dashboard AKTIVIERT. Erzwinge frische WS-Verbindungen.`);
      await bridgeLog("info", "worker_resumed", "Worker via worker_controls wieder aktiviert");
      await bridgeHeartbeat("online");
      // Bestehende (ggf. Zombie-)Sockets hart verwerfen, damit reloadMeters()
      // garantiert neue Verbindungen aufbaut.
      for (const state of connections.values()) {
        try { state.ws?.close(); } catch { /* ignore */ }
        state.ws = null;
        state.authenticated = false;
        state.reconnecting = false;
        state.reconnectDelay = 1000;
      }
      try { await reloadMeters(); } catch (e) { log("error", `[Killswitch] reload nach Resume: ${(e as Error).message}`); }
    }
  } catch (err) {
    log("warn", `[Killswitch] Poll fehlgeschlagen — behalte bisherigen Zustand bei: ${(err as Error).message}`);
  }
}

// ─── Meter-Liste laden & Verbindungen synchronisieren ────────────────────────

async function reloadMeters(): Promise<void> {
  if (workerPaused) {
    log("debug", "[Reload] übersprungen — Worker pausiert");
    return;
  }
  let meters: WsMeter[] = [];
  let integrations: WsIntegration[] = [];
  try {
    const r = await ingestGet("list-loxone-ws-meters");
    meters = (r.meters || []) as WsMeter[];
    integrations = (r.integrations || []) as WsIntegration[];
  } catch (err) {
    log("error", `[Reload] fehlgeschlagen: ${(err as Error).message}`);
    return;
  }

  // Gruppieren pro Seriennummer. Seit Phase 7.4 kommen Standort-Integrationen
  // zusätzlich unabhängig von Zähler-Zuordnungen aus dem Backend. Dadurch bleibt
  // die WS-Session/Heartbeat auch dann aktiv, wenn noch kein Meter mit sensor_uuid
  // angelegt oder nach einer Bereinigung alle Gerätezuordnungen entfernt wurden.
  const bySerial = new Map<string, { config: any; meters: WsMeter[]; tenantId: string; integrationId: string }>();

  const ensureGroup = (serial: string, cfg: any, tenantId: string, integrationId: string) => {
    if (!bySerial.has(serial)) {
      bySerial.set(serial, {
        config: cfg,
        meters: [],
        tenantId,
        integrationId,
      });
    }
    return bySerial.get(serial)!;
  };

  for (const li of integrations) {
    const cfg = li.config;
    if (!cfg?.serial_number || !cfg.username || !cfg.password || !li.tenant_id) continue;
    ensureGroup(cfg.serial_number, cfg, li.tenant_id, li.id);
  }

  for (const m of meters) {
    const cfg = m.location_integration?.config;
    if (!cfg?.serial_number || !cfg.username || !cfg.password) continue;
    const serial = cfg.serial_number;
    const group = ensureGroup(serial, cfg, m.tenant_id, m.location_integration_id);
    if (m.sensor_uuid) group.meters.push(m);
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
        lastConnectedAt: 0,
        lastEventAt: 0,
        lastOpenAttemptAt: 0,
        lastOpenSuccessAt: 0,
        pendingEndTimer: null,
        pendingEndReason: null,
        diagEventCount: 0,
        diagCallbacksSeen: new Set<string>(),
      };

      connections.set(serial, state);
    } else {
      const usernameChanged = state.username !== group.config.username;
      const passwordChanged = state.password !== group.config.password;
      const integrationChanged = state.locationIntegrationId !== group.integrationId;
      const tenantChanged = state.tenantId !== group.tenantId;

      state.username = group.config.username;
      state.password = group.config.password;
      state.tenantId = group.tenantId;
      state.locationIntegrationId = group.integrationId;

      if (usernameChanged || passwordChanged || integrationChanged || tenantChanged) {
        log("warn", `[Reload] ${serial}: Konfiguration geändert — baue WS mit neuen Zugangsdaten neu auf`);
        bridgeLog("warn", "ws_config_changed", "Konfiguration geändert – WebSocket wird mit neuen Zugangsdaten neu aufgebaut", serial, {
          username_changed: usernameChanged,
          password_changed: passwordChanged,
          integration_changed: integrationChanged,
          tenant_changed: tenantChanged,
        });
        try { state.ws?.close(); } catch { /* ignore */ }
        await sessionEnd(state, "config-changed");
        state.ws = null;
        state.authenticated = false;
        state.reconnecting = false;
        state.reconnectDelay = 1000;
      }
    }
    // Phase 7.2: NUR neu befüllen, wenn die Verbindung noch nicht authentifiziert ist.
    // Bei bereits aktiver WS hat connect() die uuidMap mittels LoxAPP3-Expansion
    // mit State-UUIDs (pwr/today/total/...) bestückt. Ein clear() hier würde dieses
    // Mapping zerstören und alle eingehenden Binary-Status-Updates lautlos verwerfen
    // → genau das hat die Live-Updates exakt nach 5 Min (erster Reload) eingefroren.
    if (group.meters.length === 0) {
      if (state.uuidMap.size > 0) {
        log("warn", `[Reload] ${serial}: keine zugeordneten sensor_uuid-Zähler — WS läuft im Heartbeat-only-Modus`);
      }
      state.uuidMap.clear();
    } else if (!state.authenticated || !state.ws) {
      state.uuidMap.clear();
      for (const m of group.meters) {
        if (!m.sensor_uuid) continue;
        const blockUuid = m.sensor_uuid.toLowerCase();
        state.uuidMap.set(blockUuid, {
          meter_id: m.id,
          tenant_id: m.tenant_id,
          energy_type: m.energy_type,
          block_uuid: blockUuid,
          role: "pwr",                    // wird in connect() durch LoxAPP3-Expansion ersetzt
          latest_value: null,
          last_pushed_value: null,
          last_pushed_at: 0,
          bucket_start: 0,
          bucket_sum: 0,
          bucket_max: 0,
          bucket_count: 0,
        });
      }
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

// ─── Health-HTTP-Server (Phase 2) ────────────────────────────────────────────

function startHealthServer(): void {
  if (!HEALTH_PORT || HEALTH_PORT <= 0) return;
  const server = http.createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, worker: BRIDGE_WORKER_NAME, host: WORKER_HOST }));
      return;
    }
    if (req.url === "/state") {
      const state = {
        worker: BRIDGE_WORKER_NAME,
        version: WORKER_VERSION,
        host: WORKER_HOST,
        connections: Array.from(connections.values()).map((c) => ({
          serial: c.serialNumber,
          authenticated: c.authenticated,
          uuids: c.uuidMap.size,
          events_received: c.eventsReceived,
          reconnect_count: c.reconnectCount,
          last_connected_at: c.lastConnectedAt ? new Date(c.lastConnectedAt).toISOString() : null,
          last_event_at: c.lastEventAt ? new Date(c.lastEventAt).toISOString() : null,
          last_open_attempt_at: c.lastOpenAttemptAt ? new Date(c.lastOpenAttemptAt).toISOString() : null,
          last_open_success_at: c.lastOpenSuccessAt ? new Date(c.lastOpenSuccessAt).toISOString() : null,
        })),

      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(state, null, 2));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(HEALTH_PORT, () => log("info", `[Health] HTTP-Endpoint auf Port ${HEALTH_PORT} (GET /healthz, /state)`));
}

// ─── Pending Writes (Cloud → Miniserver Push-Kanal, Phase 2) ─────────────────

interface PendingWrite {
  id: string;
  tenant_id: string;
  location_integration_id: string;
  template_key: string;
  instance: number;
  parameter: string;
  target_uuid: string | null;
  value_num: number | null;
  value_bool: boolean | null;
  priority: number;
  attempts: number;
  max_attempts: number;
}

async function processPendingWrites(): Promise<void> {
  let list: PendingWrite[];
  try {
    const r = await ingestGet("list-pending-writes&limit=50");
    list = r?.writes ?? [];
  } catch (err) {
    log("debug", `[PendingWrites] Abruf fehlgeschlagen: ${describeError(err)}`);
    return;
  }
  if (list.length === 0) return;

  // Nach location_integration_id gruppieren → richtige WS-Verbindung finden
  const byIntegration = new Map<string, PendingWrite[]>();
  for (const w of list) {
    if (!byIntegration.has(w.location_integration_id)) byIntegration.set(w.location_integration_id, []);
    byIntegration.get(w.location_integration_id)!.push(w);
  }

  for (const [locIntId, writes] of byIntegration) {
    const state = [...connections.values()].find((s) => s.locationIntegrationId === locIntId);
    if (!state || !state.authenticated || !state.ws) {
      for (const w of writes) {
        await ackPendingWrite(w.id, false, "no active WS connection").catch(() => null);
      }
      continue;
    }
    for (const w of writes) {
      try {
        const value = w.value_bool != null ? (w.value_bool ? 1 : 0) : (w.value_num ?? 0);
        const inputName = w.target_uuid && w.target_uuid.length > 0
          ? w.target_uuid
          : `AICO_${w.template_key.replace(/^AICO_/, "")}__${w.instance}__${w.parameter}`;
        await state.ws.send(`jdev/sps/io/${inputName}/${value}`);
        state.eventsReceived++;
        await ackPendingWrite(w.id, true).catch(() => null);
        log("info", `[PendingWrites] ${state.serialNumber} ${inputName}=${value} ok`);
      } catch (err) {
        const msg = describeError(err).slice(0, 400);
        await ackPendingWrite(w.id, false, msg).catch(() => null);
        log("warn", `[PendingWrites] ${state.serialNumber} write failed: ${msg}`);
      }
    }
  }
}

async function ackPendingWrite(id: string, success: boolean, errorMessage?: string): Promise<void> {
  await ingestPost("ack-pending-write", { id, success, error_message: errorMessage ?? null });
}

// ─── 5-Min-Bucket-Flush ──────────────────────────────────────────────────────
// v1.5: Worker aggregiert Power-Werte lokal in 5-Minuten-Buckets. Nur beim
// Bucket-Wechsel (oder älter als 5 Min ohne neue Samples) wird EINE Zeile
// pro Meter an gateway-ingest?action=bridge-power-5min gesendet. Ersetzt die
// hohe Schreiblast über bridge_raw_samples komplett.
async function flushBuckets(): Promise<void> {
  if (workerPaused) return;
  const now = Date.now();
  const currentBucket = Math.floor(now / 300000) * 300000;
  const readyByTenant = new Map<string, Array<{
    meter_id: string;
    tenant_id: string;
    energy_type: string;
    bucket: string;
    power_avg: number;
    power_max: number;
    sample_count: number;
  }>>();

  for (const state of connections.values()) {
    if (!state.authenticated) continue;
    // Pro Meter nur EIN Bucket-Datensatz pro Flush (verschiedene State-UUIDs
    // desselben Meters mit role="pwr" existieren praktisch nicht, aber wir
    // koalieren defensiv über meter_id.)
    const perMeter = new Map<string, { sum: number; max: number; count: number; bucket: number; entry: UuidEntry }>();
    for (const entry of state.uuidMap.values()) {
      if (entry.role !== "pwr") continue;
      if (entry.bucket_count === 0 || entry.bucket_start === 0) continue;
      // Bucket noch aktiv → nicht flushen
      if (entry.bucket_start === currentBucket) continue;
      const key = entry.meter_id;
      const existing = perMeter.get(key);
      if (existing) {
        existing.sum += entry.bucket_sum;
        existing.count += entry.bucket_count;
        if (Math.abs(entry.bucket_max) > Math.abs(existing.max)) existing.max = entry.bucket_max;
      } else {
        perMeter.set(key, {
          sum: entry.bucket_sum,
          max: entry.bucket_max,
          count: entry.bucket_count,
          bucket: entry.bucket_start,
          entry,
        });
      }
      // Bucket-Zähler zurücksetzen — wird bei nächstem Sample neu befüllt.
      entry.bucket_start = 0;
      entry.bucket_sum = 0;
      entry.bucket_max = 0;
      entry.bucket_count = 0;
    }

    for (const [meterId, agg] of perMeter.entries()) {
      const avg = agg.count > 0 ? agg.sum / agg.count : 0;
      const arr = readyByTenant.get(agg.entry.tenant_id) ?? [];
      arr.push({
        meter_id: meterId,
        tenant_id: agg.entry.tenant_id,
        energy_type: agg.entry.energy_type,
        bucket: new Date(agg.bucket).toISOString(),
        power_avg: avg,
        power_max: agg.max,
        sample_count: agg.count,
      });
      readyByTenant.set(agg.entry.tenant_id, arr);
    }
  }

  if (readyByTenant.size === 0) return;
  const all: any[] = [];
  for (const rows of readyByTenant.values()) all.push(...rows);
  try {
    const res = await ingestPost("bridge-power-5min", {
      worker_name: BRIDGE_WORKER_NAME,
      rows: all,
    });
    log("info", `[Bucket-Flush] ${all.length} Zeilen gesendet, upserted=${res?.upserted ?? "?"}`);
  } catch (err) {
    log("warn", `[Bucket-Flush] fehlgeschlagen: ${describeError(err)}`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {

  log("info", `Loxone WS Worker startet — worker=${BRIDGE_WORKER_NAME} host=${WORKER_HOST} version=${WORKER_VERSION}`);
  log("info", `  SUPABASE_URL=${SUPABASE_URL}`);
  log("info", `  FLUSH_INTERVAL_MS=${FLUSH_INTERVAL_MS}  RELOAD_INTERVAL_MS=${RELOAD_INTERVAL_MS}  BRIDGE_HEARTBEAT_MS=${BRIDGE_HEARTBEAT_MS}`);
  log("info", `  KILLSWITCH_POLL_MS=${KILLSWITCH_POLL_MS}  SESSION_HEARTBEAT_MS=${SESSION_HEARTBEAT_MS}  WATCHDOG_CHECK_MS=${WATCHDOG_CHECK_MS}  WATCHDOG_STALE_MS=${WATCHDOG_STALE_MS}  KEEPALIVE_INTERVAL_MS=${KEEPALIVE_INTERVAL_MS}  NO_OPEN_TIMEOUT_MIN=${NO_OPEN_TIMEOUT_MIN}`);

  startHealthServer();

  const shutdown = async (signal: string) => {
    log("info", `${signal} — beende Sessions...`);
    await bridgeHeartbeat("offline", `shutdown-${signal}`);
    await bridgeLog("info", "worker_shutdown", `Worker beendet (${signal})`);
    for (const state of connections.values()) {
      try { state.ws?.close(); } catch { /* ignore */ }
      await sessionEnd(state, `shutdown-${signal}`);
    }
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Initialer Heartbeat + Start-Event, damit bridge_workers.status sofort auf "online" geht
  await bridgeHeartbeat("online");
  await bridgeLog("info", "worker_started", `Worker gestartet auf ${WORKER_HOST}`);

  // Initialer Killswitch-Check (vor reloadMeters), damit ein pausierter Worker
  // gar nicht erst Verbindungen aufbaut.
  await pollKillswitch();
  setInterval(() => { pollKillswitch().catch((e) => log("error", "killswitch:", e)); }, KILLSWITCH_POLL_MS);
  log("info", `[Killswitch] aktiv: poll alle ${KILLSWITCH_POLL_MS / 1000}s gegen ${KILLSWITCH_URL}`);

  await reloadMeters();
  setInterval(reloadMeters, RELOAD_INTERVAL_MS);
  // v1.10: Live-Push wieder aktiv — reiner Realtime-Broadcast (live_only),
  // KEINE Datenbank-Schreiblast. Persistenz weiterhin ausschließlich über
  // aggregierte 5-Minuten-Buckets (bridge-power-5min).
  setInterval(() => { flush().catch((e) => log("error", "live-push:", e)); }, LIVE_PUSH_INTERVAL_MS);
  log("info", `[Live-Push] aktiv: alle ${LIVE_PUSH_INTERVAL_MS / 1000}s Broadcast (live_only, MIN_DELTA=${MIN_DELTA} kW, Keepalive ${MIN_PUSH_INTERVAL_MS / 1000}s)`);
  setInterval(() => { flushBuckets().catch((e) => log("error", "flushBuckets:", e)); }, 60_000);
  log("info", "[Bucket-Flush] aktiv: prüft alle 60s auf abgeschlossene 5-Min-Buckets");

  // Bridge-Heartbeat: hält bridge_workers.last_heartbeat_at frisch (Phase 2)
  setInterval(() => { bridgeHeartbeat("online").catch(() => { /* siehe bridgeHeartbeat */ }); }, BRIDGE_HEARTBEAT_MS);

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
  }, SESSION_HEARTBEAT_MS);

  // Stuck-Slot-Reset (Phase 7.8): erkennt prozessintern hängende Slots
  setInterval(stuckSlotTick, WATCHDOG_CHECK_MS);
  log("info", `[StuckSlot] aktiv: prüft alle ${WATCHDOG_CHECK_MS / 1000}s, Schwelle ${NO_OPEN_TIMEOUT_MIN}min`);

  // Watchdog (Phase 3): forciert Reconnect bei "toten" Verbindungen
  setInterval(watchdogTick, WATCHDOG_CHECK_MS);
  log("info", `[Watchdog] aktiv: prüft alle ${WATCHDOG_CHECK_MS / 1000}s, Schwelle ${WATCHDOG_STALE_MS / 1000}s`);


  // Keep-Alive (Phase 4): hält NAT offen & validiert Socket/Token
  if (KEEPALIVE_INTERVAL_MS > 0) {
    setInterval(() => { keepaliveTick().catch((e) => log("error", "keepalive:", e)); }, KEEPALIVE_INTERVAL_MS);
    log("info", `[Keepalive] aktiv: Ping alle ${KEEPALIVE_INTERVAL_MS / 1000}s`);
  } else {
    log("info", `[Keepalive] deaktiviert (KEEPALIVE_INTERVAL_MS=0)`);
  }

  // Pending Writes (Cloud → Miniserver): alle 5s Warteschlange abfragen und
  // via bestehender WS-Session an den Miniserver senden. Namensschema:
  //   AICO_<TemplateKey>__<Instance>__<Parameter>
  // Loxone akzeptiert `jdev/sps/io/<Name>/<Wert>` bei benannten Virtual Inputs.
  setInterval(() => { processPendingWrites().catch((e) => log("error", "pending-writes:", e)); }, 5000);
  log("info", "[PendingWrites] aktiv: poll alle 5s (Cloud → Miniserver Push-Kanal)");
}


main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
