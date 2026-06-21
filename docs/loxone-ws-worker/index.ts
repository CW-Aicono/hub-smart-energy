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
 *   WATCHDOG_STALE_MS   (Phase 3) Forcierter Reconnect, wenn so lange kein Event
 *                       von einem authentifizierten Miniserver kam (Standard: 300000 = 5 Min)
 *   WATCHDOG_CHECK_MS   (Phase 3) Prüfintervall des Watchdogs (Standard: 30000 = 30 s)
 *   KEEPALIVE_INTERVAL_MS (Phase 4) Loxone Keep-Alive Ping (Standard: 60000 = 60 s,
 *                       0 = aus). Hält NAT/Firewall offen & validiert Socket+Token.
 */

import os from "os";
import http from "http";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY!;
const FLUSH_INTERVAL_MS = parseInt(process.env.FLUSH_INTERVAL_MS || "5000", 10);
const MIN_PUSH_INTERVAL_MS = parseInt(process.env.MIN_PUSH_INTERVAL_MS || "60000", 10);
const MIN_DELTA = parseFloat(process.env.MIN_DELTA || "0.01");
const RELOAD_INTERVAL_MS = parseInt(process.env.RELOAD_INTERVAL_MS || "300000", 10);
const LOG_LEVEL = (process.env.LOG_LEVEL || "info") as "debug" | "info" | "warn" | "error";
const WORKER_HOST = process.env.WORKER_HOST || os.hostname();
const BRIDGE_WORKER_NAME = process.env.BRIDGE_WORKER_NAME || "hetzner-bridge-test";
// Phase 6: Heartbeat-Intervall von 30s auf 5min erhöht (IO-Optimierung)
const BRIDGE_HEARTBEAT_MS = parseInt(process.env.BRIDGE_HEARTBEAT_MS || "300000", 10);
// Phase 6: Session-Heartbeat von 15s auf 60s erhöht (IO-Optimierung)
const SESSION_HEARTBEAT_MS = parseInt(process.env.SESSION_HEARTBEAT_MS || "60000", 10);
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || "8080", 10);
const WORKER_VERSION = process.env.WORKER_VERSION || "phase7.1-blocksnapshot";
// Phase 6.1: Watchdog-Schwelle von 10min auf 30min erhöht. Keepalive zählt jetzt als Lebenszeichen,
// daher reicht eine deutlich entspanntere Schwelle. Verhindert Reconnect-Stürme alle 11 Minuten.
const WATCHDOG_STALE_MS = parseInt(process.env.WATCHDOG_STALE_MS || "1800000", 10);
const WATCHDOG_CHECK_MS = parseInt(process.env.WATCHDOG_CHECK_MS || "60000", 10);
// Phase 6: Keepalive von 60s auf 120s erhöht (Loxone schließt aktive Sessions ohnehin selbst)
const KEEPALIVE_INTERVAL_MS = parseInt(process.env.KEEPALIVE_INTERVAL_MS || "120000", 10);
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
const KILLSWITCH_POLL_MS = parseInt(process.env.KILLSWITCH_POLL_MS || "30000", 10);

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

// ─── Spike-Filter ────────────────────────────────────────────────────────────

const SPIKE_THRESHOLDS: Record<string, number> = {
  strom: 10000, gas: 5000, wasser: 1000, wärme: 5000, kälte: 2000, default: 50000,
};
// Zählerstände (today/month/year/total) können viele 100.000 kWh groß sein → keinen kW-Spike-Filter darauf anwenden.
function isSpike(v: number, energyType: string, role: "pwr" | "today" | "total" | "month" | "year" = "pwr"): boolean {
  if (!isFinite(v) || isNaN(v)) return true;
  if (role !== "pwr") return false; // Energiewerte nicht filtern
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
  sensor_uuid: string;
  tenant_id: string;
  location_integration_id: string;
  location_integration: {
    id: string;
    config: { serial_number?: string; username?: string; password?: string };
  };
}

// Rolle einer State-UUID innerhalb eines Loxone-Blocks
//   pwr     → momentane Leistung (kW)
//   today   → Tagesverbrauch (kWh)
//   total   → Zählerstand gesamt (kWh)
//   month   → Monatsverbrauch (kWh, optional)
//   year    → Jahresverbrauch (kWh, optional)
type StateRole = "pwr" | "today" | "total" | "month" | "year";

interface UuidEntry {
  meter_id: string;
  tenant_id: string;
  energy_type: string;
  block_uuid: string;          // Original sensor_uuid aus DB (Block-UUID)
  role: StateRole;             // Rolle dieser State-UUID
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
  // Bridge-Worker (Phase 2) Zeitstempel
  lastConnectedAt: number; // ms epoch, 0 = nie
  lastEventAt: number;     // ms epoch, 0 = nie
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

  const host = await resolveLoxoneHost(state.serialNumber);
  if (!host) {
    bridgeLog("warn", "dns_failed", `DNS-Auflösung fehlgeschlagen: ${state.serialNumber}`, state.serialNumber);
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
          entry.latest_value = ev.value;
          state.eventsReceived++;
          state.lastEventAt = Date.now();
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
    await socket.open(host, state.username, state.password);
    // Phase 6.3: Loxone-Requirement — Strukturdatei muss 1x nach Auth abgerufen werden,
    // sonst sendet der Miniserver keine Status-Änderungen (nur Initial-Snapshot).
    // Phase 7: Antwort auch parsen, um pro registriertem Block (sensor_uuid) die
    // zugehörigen State-UUIDs (Pwr/EnergyToday/EnergyTotal/...) zu ermitteln.
    let loxApp3: any = null;
    try {
      const resp: any = await socket.send("data/LoxAPP3.json");
      loxApp3 = resp?.LL?.value ?? resp?.value ?? resp;
      if (typeof loxApp3 === "string") {
        try { loxApp3 = JSON.parse(loxApp3); } catch { /* leave as string */ }
      }
      const controlCount = loxApp3?.controls ? Object.keys(loxApp3.controls).length : 0;
      log("info", `[WS] ${state.serialNumber} LoxAPP3.json geladen — Live-Updates aktiviert (controls=${controlCount})`);
    } catch (err) {
      log("warn", `[WS] ${state.serialNumber} LoxAPP3.json fehlgeschlagen: ${(err as Error).message}`);
    }
    await socket.send("jdev/sps/enablebinstatusupdate");
    // Phase 5.1: zusätzlich analoge Statusupdates abonnieren (kWh, Power, Temperatur, Zählerstände)
    await socket.send("jdev/sps/enablestatusupdate");
    state.authenticated = true;
    state.reconnectDelay = 1000;
    state.lastConnectedAt = Date.now();
    state.diagEventCount = 0;
    state.diagCallbacksSeen = new Set<string>();
    await sessionStart(state);

    // ── Phase 7: State-UUIDs pro Block aus LoxAPP3 expandieren ───────────────
    // state.uuidMap enthält initial die Block-UUIDs (sensor_uuid aus DB) mit role="pwr".
    // Für Meter-Blöcke ersetzen wir den Eintrag durch mehrere State-UUID-Einträge
    // (Pwr, EnergyToday, EnergyTotal, ...). Block-UUID bleibt im Eintrag erhalten,
    // damit der Aggregator/Broadcast weiterhin auf den Meter zuordnen kann.
    const blockEntries = Array.from(state.uuidMap.entries());
    state.uuidMap.clear();

    const ROLE_PATTERNS: Array<{ role: StateRole; rx: RegExp }> = [
      // Reihenfolge wichtig: spezifischere Patterns zuerst
      { role: "today", rx: /^(energytoday|today|daily|day|tagesverbrauch)$/i },
      { role: "month", rx: /^(energymonth|month|monthly|monatsverbrauch)$/i },
      { role: "year",  rx: /^(energyyear|year|yearly|jahresverbrauch)$/i },
      { role: "total", rx: /^(energytotal|total|totalenergy|zaehlerstand|meter)$/i },
      { role: "pwr",   rx: /^(pwr|power|currentpower|actual|actualpower|value|p)$/i },
    ];
    function classifyState(key: string): StateRole | null {
      for (const { role, rx } of ROLE_PATTERNS) if (rx.test(key)) return role;
      return null;
    }

    function findControl(blockUuid: string): any | null {
      if (!loxApp3?.controls) return null;
      // Loxone-Schlüssel sind case-sensitive UUIDs; DB-UUIDs sind lowercase.
      for (const [k, v] of Object.entries(loxApp3.controls as Record<string, any>)) {
        if (k.toLowerCase() === blockUuid) return v;
      }
      return null;
    }

    let blocksMapped = 0;
    let blocksFallback = 0;
    let totalSubs = 0;
    for (const [blockUuid, baseEntry] of blockEntries) {
      const ctrl = findControl(blockUuid);
      const states = ctrl?.states as Record<string, string> | undefined;
      const stateEntries: Array<{ stateUuid: string; role: StateRole; key: string }> = [];

      if (states && typeof states === "object") {
        for (const [k, v] of Object.entries(states)) {
          if (typeof v !== "string") continue;
          const role = classifyState(k);
          if (!role) continue;
          stateEntries.push({ stateUuid: v.toLowerCase(), role, key: k });
        }
      }

      if (stateEntries.length === 0) {
        // Fallback: Block-UUID direkt als pwr behandeln (alte Logik)
        state.uuidMap.set(blockUuid, { ...baseEntry, block_uuid: blockUuid, role: "pwr" });
        blocksFallback++;
        totalSubs++;
        continue;
      }

      // Dedup auf Rolle: falls mehrere Keys auf gleiche Rolle mappen, ersten nehmen
      const seenRoles = new Set<StateRole>();
      for (const se of stateEntries) {
        if (seenRoles.has(se.role)) continue;
        seenRoles.add(se.role);
        state.uuidMap.set(se.stateUuid, {
          ...baseEntry,
          block_uuid: blockUuid,
          role: se.role,
          latest_value: null,
          last_pushed_value: null,
          last_pushed_at: 0,
        });
        totalSubs++;
      }
      blocksMapped++;
      log("info", `[LoxAPP3] ${state.serialNumber} block ${blockUuid} → ${[...seenRoles].join(",")} (type=${ctrl?.type ?? "?"})`);
    }

    log("info", `[WS] ${state.serialNumber} LoxAPP3-Mapping: blocks=${blockEntries.length}, mapped=${blocksMapped}, fallback=${blocksFallback}, totalStateUuids=${totalSubs}`);
    bridgeLog("info", "ws_connected", `Verbunden, ${totalSubs} State-UUIDs aus ${blockEntries.length} Blöcken (mapped=${blocksMapped}, fallback=${blocksFallback})`, state.serialNumber, { blocks: blockEntries.length, mapped: blocksMapped, fallback: blocksFallback, totalStateUuids: totalSubs });

    // Phase 7.1: Initial-Snapshot pro Block-UUID holen (`jdev/sps/io/<block>/all` liefert ALLE States des Blocks).
    // State-UUIDs sind selbst NICHT subscribable (Loxone antwortet code=404). Live-Updates kommen
    // anschließend automatisch via `enablebinstatusupdate` für jede State-UUID.
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
        let reason: string;
        if (err instanceof Error) {
          reason = err.message;
        } else if (err && typeof err === "object") {
          const anyErr = err as any;
          const code = anyErr?.LL?.Code ?? anyErr?.Code ?? anyErr?.code;
          const val = anyErr?.LL?.value ?? anyErr?.value;
          if (code || val) {
            reason = `code=${code ?? "?"} value=${val ?? "?"}`;
          } else {
            try { reason = JSON.stringify(err); } catch { reason = String(err); }
          }
        } else {
          reason = String(err);
        }
        failedBlocks.push({ block: blockUuid, reason });
        log("warn", `[WS] ${state.serialNumber} block-snapshot ${blockUuid} fehlgeschlagen: ${reason}`);
      }
    }
    log("info", `[WS] ${state.serialNumber} per-block snapshot: ok=${subscribedOk} err=${subscribedErr} (blocks=${uniqueBlocks.size}, stateUuids=${state.uuidMap.size})`);
    bridgeLog("info", "ws_per_block_snapshot", `Per-block snapshot: ok=${subscribedOk} err=${subscribedErr}`, state.serialNumber, { ok: subscribedOk, err: subscribedErr, blocks: uniqueBlocks.size, stateUuids: state.uuidMap.size, failed: failedBlocks });
  } catch (err) {
    log("warn", `[WS] Verbindung fehlgeschlagen ${state.serialNumber}: ${err}`);
    bridgeLog("error", "ws_connect_failed", `Verbindung fehlgeschlagen: ${(err as Error).message ?? err}`, state.serialNumber);
    state.ws = null;
    scheduleReconnect(state, `connect-error: ${(err as Error).message ?? err}`);
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

// ─── Flush (Phase 5: Smart-Split → bridge_raw_samples) ───────────────────────
// Schickt Roh-Werte an gateway-ingest?action=bridge-readings.
// gateway-ingest schreibt sie in `bridge_raw_samples` (Ringpuffer 24 h);
// die Edge-Function `bridge-aggregator` aggregiert sie alle 5 Min in die
// Schatten-Tabelle `meter_power_readings_5min_bridge` — parallel zum
// bestehenden Polling-Pfad, der unberührt weiterläuft.

async function flush(): Promise<void> {
  if (workerPaused) return;
  const readings: any[] = [];
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  for (const state of connections.values()) {
    if (!state.authenticated) continue;
    for (const [, entry] of state.uuidMap) {
      if (entry.latest_value === null) continue;

      // IO-Optimierung: nur pushen, wenn sich der Wert spürbar geändert hat
      // ODER der letzte Push älter als MIN_PUSH_INTERVAL_MS ist (Keepalive).
      // Energiezähler (today/total/month/year) ändern sich in kleinen Schritten →
      // niedrigere Mindest-Änderung, damit kWh-Inkremente nicht verschluckt werden.
      const prev = entry.last_pushed_value;
      const ageMs = nowMs - entry.last_pushed_at;
      const delta = prev === null ? Infinity : Math.abs(entry.latest_value - prev);
      const minDelta = entry.role === "pwr" ? MIN_DELTA : 0.001;
      const changed = delta >= minDelta;
      const stale = ageMs >= MIN_PUSH_INTERVAL_MS;
      if (!changed && !stale) continue;

      readings.push({
        miniserver_serial: state.serialNumber,
        sensor_uuid: entry.block_uuid,   // immer Block-UUID, damit DB-Mapping konsistent bleibt
        role: entry.role,                 // Phase 7: rollenbasiertes Routing in gateway-ingest
        value: entry.latest_value,
        recorded_at: nowIso,
      });
      entry.last_pushed_value = entry.latest_value;
      entry.last_pushed_at = nowMs;
    }
  }
  if (readings.length === 0) return;
  try {
    await ingestPost("bridge-readings", { worker_name: BRIDGE_WORKER_NAME, readings });
    log("debug", `[Flush] ${readings.length} Roh-Samples an bridge-readings gepusht`);
  } catch (err) {
    log("warn", `[Flush] fehlgeschlagen: ${(err as Error).message}`);
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
        lastConnectedAt: 0,
        lastEventAt: 0,
        pendingEndTimer: null,
        pendingEndReason: null,
        diagEventCount: 0,
        diagCallbacksSeen: new Set<string>(),
      };
      connections.set(serial, state);
    }
    state.uuidMap.clear();
    for (const m of group.meters) {
      const blockUuid = m.sensor_uuid.toLowerCase();
      state.uuidMap.set(blockUuid, {
        meter_id: m.id,
        tenant_id: m.tenant_id,
        energy_type: m.energy_type,
        block_uuid: blockUuid,
        role: "pwr",                    // wird in connect() ggf. durch LoxAPP3-Expansion ersetzt
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

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  log("info", `Loxone WS Worker startet — worker=${BRIDGE_WORKER_NAME} host=${WORKER_HOST} version=${WORKER_VERSION}`);
  log("info", `  SUPABASE_URL=${SUPABASE_URL}`);
  log("info", `  FLUSH_INTERVAL_MS=${FLUSH_INTERVAL_MS}  RELOAD_INTERVAL_MS=${RELOAD_INTERVAL_MS}  BRIDGE_HEARTBEAT_MS=${BRIDGE_HEARTBEAT_MS}`);
  log("info", `  KILLSWITCH_POLL_MS=${KILLSWITCH_POLL_MS}  SESSION_HEARTBEAT_MS=${SESSION_HEARTBEAT_MS}  WATCHDOG_CHECK_MS=${WATCHDOG_CHECK_MS}  WATCHDOG_STALE_MS=${WATCHDOG_STALE_MS}  KEEPALIVE_INTERVAL_MS=${KEEPALIVE_INTERVAL_MS}`);

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
  setInterval(() => { flush().catch((e) => log("error", "flush:", e)); }, FLUSH_INTERVAL_MS);

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
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
