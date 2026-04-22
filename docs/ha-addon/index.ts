/**
 * AICONO EMS Gateway v3.0
 * ==============================================
 * Lokaler Gateway-Hub mit bidirektionaler WebSocket-Verbindung zur AICONO Cloud.
 *
 * Architektur:
 *  - HA REST/WS Polling -> SQLite-Buffer -> Push an /functions/v1/gateway-ingest
 *  - Persistenter WSS-Client zu /functions/v1/gateway-ws (MAC + Username + Passwort)
 *    -> empfängt Heartbeat-Bestätigungen, UI-PIN-Sync, Schaltbefehle
 *  - Lokaler Automationsmotor (automation-core kompatibel) läuft auch ohne Internet
 *  - Offline-Caches (meter mappings, HA states), Priority-Buffer, FIFO-Eviction
 *
 * v3.0 BREAKING:
 *  - Cloudflare-Tunnel komplett entfernt (kein eingehender HTTP mehr)
 *  - Cloud-Steuerbefehle kommen jetzt push-basiert über die WS-Verbindung an
 *  - Pflicht-Konfig: gateway_username + gateway_password (Bcrypt-Auth gegen MAC)
 */

import http from "http";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

// Conditional WebSocket import (ws package)
let WebSocketClient: (new (url: string) => import("ws")) | undefined;
try {
  WebSocketClient = require("ws") as any;
} catch { /* ws not available, WebSocket features disabled */ }

/* ── Configuration ───────────────────────────────────────────────────────────── */

interface AddonConfig {
  cloud_url: string;
  /** Optional Legacy-Bearer für gateway-ingest (Daten-Upload). */
  gateway_api_key?: string;
  /** Optional – wird per MAC zugewiesen, kann aber lokal überschrieben werden. */
  tenant_id?: string;
  device_name: string;
  /** Pflicht ab v3.0 – Gateway-Login (gemeinsam mit MAC bcrypt-geprüft). */
  gateway_username?: string;
  gateway_password?: string;
  poll_interval_seconds: number;
  flush_interval_seconds: number;
  heartbeat_interval_seconds: number;
  entity_filter: string;
  offline_buffer_max_mb: number;
  auto_backup_hours: number;
  automation_eval_seconds: number;
}

const DEFAULT_CLOUD_URL = "https://xnveugycurplszevdxtw.supabase.co";

/**
 * Normalize cloud_url so the rest of the code can safely append paths.
 * - Accepts ws://, wss://, http://, https:// and rewrites to http(s)://
 * - Strips trailing slashes
 * - Strips any accidentally appended /functions/... path so URL builders
 *   like `${cloud_url}/functions/v1/gateway-ingest` produce clean URLs
 *   instead of `wss://.../functions/v1/gateway-ws/functions/v1/gateway-ingest`.
 * - Falls back to DEFAULT_CLOUD_URL if input is empty/invalid.
 */
function normalizeCloudUrl(input: string | undefined | null): string {
  let url = (input || "").trim();
  if (!url) return DEFAULT_CLOUD_URL;
  // ws:// → http:// , wss:// → https://
  url = url.replace(/^wss:\/\//i, "https://").replace(/^ws:\/\//i, "http://");
  // If user pasted a bare host without scheme, default to https
  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url.replace(/^\/+/, "");
  }
  // Strip trailing slashes
  url = url.replace(/\/+$/, "");
  // Strip any /functions/... suffix the user may have included
  url = url.replace(/\/functions\/.*$/i, "");
  // Final sanity check
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    console.warn(`[config] Invalid cloud_url "${input}", falling back to default`);
    return DEFAULT_CLOUD_URL;
  }
}

function loadConfig(): AddonConfig {
  const optionsPath = "/data/options.json";
  try {
    const raw = fs.readFileSync(optionsPath, "utf-8");
    console.log("[config] Loaded /data/options.json");
    const parsed = JSON.parse(raw);
    const cloudUrl = normalizeCloudUrl(parsed.cloud_url || parsed.supabase_url);
    if (cloudUrl !== (parsed.cloud_url || parsed.supabase_url)) {
      console.log(`[config] Normalized cloud_url → ${cloudUrl}`);
    }
    return { automation_eval_seconds: 30, ...parsed, cloud_url: cloudUrl };
  } catch (error: any) {
    console.warn(`[config] Cannot read ${optionsPath} (${error?.code || error?.message}), using env vars`);
  }
  return {
    cloud_url: normalizeCloudUrl(process.env.CLOUD_URL || process.env.SUPABASE_URL),
    gateway_api_key: process.env.GATEWAY_API_KEY || "",
    tenant_id: process.env.TENANT_ID || "",
    device_name: process.env.DEVICE_NAME || "aicono-ems",
    gateway_username: process.env.GATEWAY_USERNAME || "",
    gateway_password: process.env.GATEWAY_PASSWORD || "",
    poll_interval_seconds: Number(process.env.POLL_INTERVAL_SECONDS) || 30,
    flush_interval_seconds: Number(process.env.FLUSH_INTERVAL_SECONDS) || 5,
    heartbeat_interval_seconds: Number(process.env.HEARTBEAT_INTERVAL_SECONDS) || 60,
    entity_filter: process.env.ENTITY_FILTER || "sensor.*_energy,sensor.*_power",
    offline_buffer_max_mb: Number(process.env.OFFLINE_BUFFER_MAX_MB) || 100,
    auto_backup_hours: Number(process.env.AUTO_BACKUP_HOURS) || 24,
    automation_eval_seconds: Number(process.env.AUTOMATION_EVAL_SECONDS) || 30,
  };
}

const config = loadConfig();
const SUPERVISOR_TOKEN = process.env.SUPERVISOR_TOKEN || "";
const HA_API_BASE = "http://supervisor/core/api";
const INGEST_URL = `${config.cloud_url}/functions/v1/gateway-ingest`;
const GATEWAY_WS_URL = `${config.cloud_url.replace(/^http/, "ws")}/functions/v1/gateway-ws`;
// Version wird beim Docker-Build automatisch aus config.yaml injiziert
// (siehe Dockerfile: ENV ADDON_VERSION=...). Fallback nur für lokale Dev-Runs.
const ADDON_VERSION = process.env.ADDON_VERSION || "dev";

/* ── Auth header helper for gateway-ingest (Daten-Upload) ────────────────────── */
// gateway-ingest akzeptiert weiterhin Basic Auth (username/password) ODER Bearer.
// Die WS-Verbindung nutzt einen eigenen JSON-Auth-Frame (siehe gatewayWsClient).

function authHeader(): string {
  if (config.gateway_username && config.gateway_password) {
    const creds = `${config.gateway_username}:${config.gateway_password}`;
    return `Basic ${Buffer.from(creds, "utf-8").toString("base64")}`;
  }
  return `Bearer ${config.gateway_api_key || ""}`;
}

async function cloudAuthHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Authorization: authHeader(),
    ...extra,
  };
  try {
    const mac = (await getHostMAC() || "").toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 12);
    if (mac.length === 12) headers["x-gateway-mac"] = mac;
  } catch {
    // ignore MAC lookup failures
  }
  return headers;
}

/* ── (Cloudflare-Tunnel entfernt in v3.0 – ersetzt durch WebSocket-Push) ─────── */

/* ── Connectivity State ──────────────────────────────────────────────────────── */

let isCloudReachable = true;
let lastCloudCheck = 0;
let cloudFailCount = 0;
let currentAssignmentStatus: "assigned" | "pending_assignment" | "unknown" = "unknown";

/* ── PIN Auth State ──────────────────────────────────────────────────────────── */

import crypto from "crypto";

let uiPinHash: string | null = null; // SHA-256 hash synced from cloud
const activeSessions = new Map<string, number>(); // token → expiry timestamp
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

// Brute-force protection
let pinFailCount = 0;
let pinLockoutUntil = 0;
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 60_000;

function sha256Sync(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function isSessionValid(req: http.IncomingMessage): boolean {
  // No PIN configured → always valid
  if (!uiPinHash) return true;

  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.match(/(?:^|;\s*)ems_session=([^;]+)/);
  if (!match) return false;

  const token = match[1];
  const expiry = activeSessions.get(token);
  if (!expiry || Date.now() > expiry) {
    if (expiry) activeSessions.delete(token);
    return false;
  }
  return true;
}

function cleanupSessions(): void {
  const now = Date.now();
  for (const [token, expiry] of activeSessions) {
    if (now > expiry) activeSessions.delete(token);
  }
}

function markCloudReachable(): void {
  isCloudReachable = true;
  cloudFailCount = 0;
  lastCloudCheck = Date.now();
}

function markCloudUnreachable(): void {
  cloudFailCount++;
  // Only mark offline after 3 consecutive failures to avoid flapping
  if (cloudFailCount >= 3) {
    isCloudReachable = false;
  }
  lastCloudCheck = Date.now();
}

async function checkCloudConnectivity(): Promise<boolean> {
  try {
    const res = await fetch(`${INGEST_URL}?action=addon-version`, {
      headers: await cloudAuthHeaders(),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      markCloudReachable();
    } else {
      markCloudUnreachable();
    }
  } catch {
    markCloudUnreachable();
  }
  return isCloudReachable;
}

/* ── SQLite Database ─────────────────────────────────────────────────────────── */

const DB_PATH = "/data/db/buffer.sqlite3";
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log(`[db] Created directory ${dbDir}`);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Readings buffer with priority support
db.exec(`
  CREATE TABLE IF NOT EXISTS readings_buffer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meter_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    power_value REAL NOT NULL,
    energy_type TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_buffer_created ON readings_buffer(created_at);
  CREATE INDEX IF NOT EXISTS idx_buffer_priority ON readings_buffer(priority);
`);

// Local automations storage
db.exec(`
  CREATE TABLE IF NOT EXISTS automations_local (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_executed_at TEXT,
    synced_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Local execution log
const LOCAL_EXEC_LOG_RETENTION_DAYS = 30;
const LOCAL_EXEC_LOG_MAX_ROWS = 2000;

db.exec(`
  CREATE TABLE IF NOT EXISTS automation_exec_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    automation_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    status TEXT NOT NULL,
    error_message TEXT,
    actions_executed TEXT,
    duration_ms INTEGER,
    trigger_type TEXT NOT NULL DEFAULT 'scheduled',
    synced INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_exec_log_synced ON automation_exec_log(synced);
`);

function pruneExecutionLogs(): void {
  db.prepare(`DELETE FROM automation_exec_log WHERE created_at < datetime('now', ?)`)
    .run(`-${LOCAL_EXEC_LOG_RETENTION_DAYS} days`);

  db.prepare(`
    DELETE FROM automation_exec_log
    WHERE id NOT IN (
      SELECT id FROM automation_exec_log ORDER BY id DESC LIMIT ?
    )
  `).run(LOCAL_EXEC_LOG_MAX_ROWS);
}

// ── NEW: Meter Mappings Cache (Offline-Persistent) ──
db.exec(`
  CREATE TABLE IF NOT EXISTS meter_mappings_cache (
    id TEXT PRIMARY KEY,
    sensor_uuid TEXT NOT NULL,
    energy_type TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── NEW: HA States Cache (Offline-Persistent) ──
db.exec(`
  CREATE TABLE IF NOT EXISTS ha_states_cache (
    entity_id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    attributes TEXT,
    last_updated TEXT,
    cached_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

/* ── Readings Buffer Statements ──────────────────────────────────────────────── */

const insertReading = db.prepare(
  `INSERT INTO readings_buffer (meter_id, tenant_id, power_value, energy_type, recorded_at, priority) VALUES (?, ?, ?, ?, ?, ?)`
);
const fetchBatch = db.prepare(
  `SELECT id, meter_id, tenant_id, power_value, energy_type, recorded_at FROM readings_buffer ORDER BY id LIMIT ?`
);
const deleteBatch = db.prepare(
  `DELETE FROM readings_buffer WHERE id <= ?`
);
const countBuffer = db.prepare(
  `SELECT COUNT(*) AS cnt FROM readings_buffer`
);

function getBufferCount(): number {
  return (countBuffer.get() as { cnt: number }).cnt;
}

/* ── Priority Buffer & FIFO Eviction ─────────────────────────────────────────── */

const PRIORITY_THRESHOLDS: Record<string, number> = {
  strom: 5000,
  gas: 3000,
  wasser: 500,
  default: 10000,
};

function getPriority(powerValue: number, energyType: string): number {
  const threshold = PRIORITY_THRESHOLDS[energyType] ?? PRIORITY_THRESHOLDS.default;
  return Math.abs(powerValue) > threshold ? 1 : 0;
}

function enforceBufferLimit(): void {
  const maxBytes = config.offline_buffer_max_mb * 1024 * 1024;
  try {
    const stats = fs.statSync(DB_PATH);
    if (stats.size > maxBytes) {
      const total = getBufferCount();
      const toDelete = Math.max(1, Math.floor(total * 0.1));
      const oldest = db.prepare(
        `SELECT id FROM readings_buffer WHERE priority = 0 ORDER BY id LIMIT ?`
      ).all(toDelete) as { id: number }[];
      if (oldest.length > 0) {
        deleteBatch.run(oldest[oldest.length - 1].id);
        console.log(`[buffer] Evicted ${oldest.length} non-priority readings (FIFO)`);
      } else {
        const anyOldest = db.prepare(
          `SELECT id FROM readings_buffer ORDER BY id LIMIT ?`
        ).all(toDelete) as { id: number }[];
        if (anyOldest.length > 0) {
          deleteBatch.run(anyOldest[anyOldest.length - 1].id);
          console.log(`[buffer] Evicted ${anyOldest.length} readings (all priority, FIFO fallback)`);
        }
      }
    }
  } catch { /* ignore */ }
}

/* ── Meter Mapping ───────────────────────────────────────────────────────────── */

interface MeterMapping {
  id: string;
  sensor_uuid: string;
  energy_type: string;
  tenant_id: string;
}

let meterMappings: MeterMapping[] = [];
let entityFilterPatterns: RegExp[] = [];

function compileEntityFilter(): void {
  entityFilterPatterns = config.entity_filter
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => new RegExp("^" + p.replace(/\*/g, ".*") + "$"));
}

function matchesEntityFilter(entityId: string): boolean {
  if (entityFilterPatterns.length === 0) return true;
  return entityFilterPatterns.some((re) => re.test(entityId));
}

// ── NEW: Persist meter mappings to SQLite cache ──
function saveMeterMappingsToCache(mappings: MeterMapping[]): void {
  const upsert = db.prepare(
    `INSERT OR REPLACE INTO meter_mappings_cache (id, sensor_uuid, energy_type, tenant_id) VALUES (?, ?, ?, ?)`
  );
  const tx = db.transaction((items: MeterMapping[]) => {
    db.exec(`DELETE FROM meter_mappings_cache`);
    for (const m of items) {
      upsert.run(m.id, m.sensor_uuid, m.energy_type, m.tenant_id);
    }
  });
  tx(mappings);
}

function loadMeterMappingsFromCache(): MeterMapping[] {
  return db.prepare(`SELECT id, sensor_uuid, energy_type, tenant_id FROM meter_mappings_cache`).all() as MeterMapping[];
}

async function fetchMeterMappings(): Promise<void> {
  if (!isCloudReachable) {
    // Offline: load from cache if empty
    if (meterMappings.length === 0) {
      meterMappings = loadMeterMappingsFromCache();
      if (meterMappings.length > 0) {
        console.log(`[mapping] Loaded ${meterMappings.length} meter mappings from offline cache`);
      }
    }
    return;
  }
  try {
    const res = await fetch(`${INGEST_URL}?action=list-meters`, {
      headers: await cloudAuthHeaders(),
    });
    if (!res.ok) {
      console.error(`[mapping] Failed to fetch meters: ${res.status}`);
      return;
    }
    const data = await res.json() as { success?: boolean; meters?: any[] };
    if (data.success && Array.isArray(data.meters)) {
      meterMappings = data.meters
        .filter((m: any) => m.sensor_uuid && m.capture_type === "automatic")
        .map((m: any) => ({
          id: m.id,
          sensor_uuid: m.sensor_uuid,
          energy_type: m.energy_type || "strom",
          tenant_id: m.tenant_id,
        }));
      console.log(`[mapping] Loaded ${meterMappings.length} meter mappings`);
      // Persist to cache for offline use
      saveMeterMappingsToCache(meterMappings);
    }
  } catch (err) {
    console.error("[mapping] Error fetching meters:", err);
  }
}

/* ── HA REST API Polling ─────────────────────────────────────────────────────── */

interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_updated: string;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

// Cache of latest HA states for the UI and automation engine
let latestHAStates: HAState[] = [];

// ── NEW: Persist HA states to SQLite cache ──
function saveHAStatesToCache(): void {
  const upsert = db.prepare(
    `INSERT OR REPLACE INTO ha_states_cache (entity_id, state, attributes, last_updated) VALUES (?, ?, ?, ?)`
  );
  const tx = db.transaction((states: HAState[]) => {
    for (const s of states) {
      upsert.run(s.entity_id, s.state, JSON.stringify(s.attributes), s.last_updated);
    }
  });
  // Only cache sensor/switch/light/cover states (max 500)
  const relevant = latestHAStates
    .filter(s => s.entity_id.startsWith("sensor.") || s.entity_id.startsWith("switch.") || s.entity_id.startsWith("light.") || s.entity_id.startsWith("cover.") || s.entity_id.startsWith("climate."))
    .slice(0, 500);
  tx(relevant);
}

function loadHAStatesFromCache(): HAState[] {
  const rows = db.prepare(`SELECT entity_id, state, attributes, last_updated FROM ha_states_cache`).all() as Array<{
    entity_id: string; state: string; attributes: string; last_updated: string;
  }>;
  return rows.map(r => ({
    entity_id: r.entity_id,
    state: r.state,
    attributes: r.attributes ? JSON.parse(r.attributes) : {},
    last_updated: r.last_updated,
  }));
}

let statesCacheCounter = 0;

async function pollHAStates(): Promise<void> {
  try {
    const res = await fetch(`${HA_API_BASE}/states`, {
      headers: { Authorization: `Bearer ${SUPERVISOR_TOKEN}` },
    });
    if (!res.ok) {
      console.error(`[ha-poll] HA API returned ${res.status}`);
      return;
    }

    const states: HAState[] = await res.json() as HAState[];
    latestHAStates = states;
    let buffered = 0;

    for (const state of states) {
      if (!matchesEntityFilter(state.entity_id)) continue;

      const value = parseFloat(state.state);
      if (!isFinite(value)) continue;

      const mapping = meterMappings.find((m) => m.sensor_uuid === state.entity_id);
      if (!mapping) continue;

      const priority = getPriority(value, mapping.energy_type);
      insertReading.run(
        mapping.id,
        mapping.tenant_id,
        value,
        mapping.energy_type,
        state.last_updated || new Date().toISOString(),
        priority
      );
      buffered++;
    }

    if (buffered > 0) {
      console.log(`[ha-poll] Buffered ${buffered} readings`);
    }
    enforceBufferLimit();

    // Persist states to cache every 5th poll
    statesCacheCounter++;
    if (statesCacheCounter >= 5) {
      saveHAStatesToCache();
      statesCacheCounter = 0;
    }
  } catch (err) {
    console.error("[ha-poll] Error:", err);
  }
}

/* ── HA WebSocket Client ─────────────────────────────────────────────────────── */

let haWs: import("ws") | null = null;
let haWsMsgId = 1;
let haWsConnected = false;

function connectHAWebSocket(): void {
  if (!WebSocketClient || !SUPERVISOR_TOKEN) {
    console.log("[ha-ws] WebSocket client not available or no token");
    return;
  }

  const wsUrl = "ws://supervisor/core/websocket";
  console.log("[ha-ws] Connecting to HA WebSocket...");

  try {
    haWs = new WebSocketClient(wsUrl);

    haWs.on("open", () => {
      console.log("[ha-ws] Connected");
    });

    haWs.on("message", (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === "auth_required") {
          haWs?.send(JSON.stringify({ type: "auth", access_token: SUPERVISOR_TOKEN }));
        } else if (msg.type === "auth_ok") {
          console.log("[ha-ws] Authenticated");
          haWsConnected = true;
          haWs?.send(JSON.stringify({ id: haWsMsgId++, type: "subscribe_events", event_type: "state_changed" }));
        } else if (msg.type === "event" && msg.event?.event_type === "state_changed") {
          const newState = msg.event.data?.new_state;
          if (newState) {
            const idx = latestHAStates.findIndex((s) => s.entity_id === newState.entity_id);
            if (idx >= 0) {
              latestHAStates[idx] = newState;
            } else {
              latestHAStates.push(newState);
            }
          }
        }
      } catch { /* ignore parse errors */ }
    });

    haWs.on("close", () => {
      console.log("[ha-ws] Disconnected, reconnecting in 30s...");
      haWsConnected = false;
      setTimeout(connectHAWebSocket, 30000);
    });

    haWs.on("error", (err: Error) => {
      console.error("[ha-ws] Error:", err.message);
    });
  } catch (err) {
    console.error("[ha-ws] Connection failed:", err);
    setTimeout(connectHAWebSocket, 30000);
  }
}

/* ── Local Automation Engine ─────────────────────────────────────────────────── */

interface LocalAutomation {
  id: string;
  data: string;
  updated_at: string;
  last_executed_at: string | null;
}

const DEBOUNCE_MS = 5 * 60 * 1000;

function getLocalAutomations(): LocalAutomation[] {
  return db.prepare(`SELECT * FROM automations_local`).all() as LocalAutomation[];
}

function updateLocalExecutionTime(id: string): void {
  db.prepare(`UPDATE automations_local SET last_executed_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), id);
}

function insertExecLog(entry: {
  automation_id: string;
  tenant_id: string;
  status: string;
  error_message?: string;
  actions_executed?: any[];
  duration_ms?: number;
  trigger_type?: string;
}): void {
  db.prepare(`INSERT INTO automation_exec_log (automation_id, tenant_id, status, error_message, actions_executed, duration_ms, trigger_type) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(
      entry.automation_id,
      entry.tenant_id,
      entry.status,
      entry.error_message || null,
      entry.actions_executed ? JSON.stringify(entry.actions_executed) : null,
      entry.duration_ms || null,
      entry.trigger_type || "scheduled"
    );

  pruneExecutionLogs();
}

function getLocalTimeParts(timezone: string): { hours: number; minutes: number; seconds: number; weekday: number; timeStr: string; totalSeconds: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("de-DE", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hours = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const minutes = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
  const seconds = parseInt(parts.find((p) => p.type === "second")?.value || "0", 10);
  const timeStr = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;

  const dayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" });
  const dayStr = dayFormatter.format(now);
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = dayMap[dayStr] ?? 0;

  return { hours, minutes, seconds, weekday, timeStr, totalSeconds };
}

function isTimeInRange(currentTime: string, timeFrom: string, timeTo: string): boolean {
  if (timeFrom <= timeTo) {
    return currentTime >= timeFrom && currentTime <= timeTo;
  }
  return currentTime >= timeFrom || currentTime <= timeTo;
}

/** Exact time point check with ±30 second tolerance (for local gateway) */
function isExactTimePoint(totalSeconds: number, targetTime: string, toleranceSec = 30): boolean {
  const [tH, tM] = targetTime.split(":").map(Number);
  const targetSec = tH * 3600 + tM * 60;
  let diff = Math.abs(totalSeconds - targetSec);
  // Handle midnight wrap-around
  if (diff > 12 * 3600) diff = 24 * 3600 - diff;
  return diff <= toleranceSec;
}

function getHASensorValue(sensorUuid: string): { uuid: string; value: number | string } | null {
  const state = latestHAStates.find((s) => s.entity_id === sensorUuid);
  if (!state) return null;
  return { uuid: sensorUuid, value: state.state };
}

async function evaluateAndExecuteAutomations(): Promise<void> {
  const automations = getLocalAutomations();
  if (automations.length === 0) return;

  let executed = 0;
  let errors = 0;

  for (const auto of automations) {
    let rule: any;
    try {
      rule = JSON.parse(auto.data);
    } catch {
      continue;
    }

    if (!rule.is_active) continue;

    const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
    if (conditions.length === 0) continue;

    const lastExec = auto.last_executed_at ? new Date(auto.last_executed_at).getTime() : 0;
    if (Date.now() - lastExec < DEBOUNCE_MS) continue;

    const timezone = rule.timezone || "Europe/Berlin";
    const timeParts = getLocalTimeParts(timezone);
    const logicOperator = rule.logic_operator || "AND";
    const results: boolean[] = [];

    for (const cond of conditions) {
      let result = false;

      switch (cond.type) {
        case "time":
          if (cond.time_from && cond.time_to) {
            result = isTimeInRange(timeParts.timeStr, cond.time_from, cond.time_to);
          }
          break;
        case "time_point":
          if (cond.time_point) result = isExactTimePoint(timeParts.totalSeconds, cond.time_point);
          break;
        case "time_switch":
          if (cond.time_points?.length > 0) {
            result = cond.time_points.some((tp: string) => isExactTimePoint(timeParts.totalSeconds, tp));
          }
          break;
        case "weekday":
          if (cond.weekdays?.length > 0) result = cond.weekdays.includes(timeParts.weekday);
          break;
        case "sensor_value": {
          const sensor = getHASensorValue(cond.sensor_uuid);
          if (sensor) {
            const val = parseFloat(String(sensor.value));
            const threshold = cond.value ?? 0;
            if (isFinite(val)) {
              switch (cond.operator) {
                case ">": result = val > threshold; break;
                case "<": result = val < threshold; break;
                case "=": result = Math.abs(val - threshold) < 0.001; break;
                case ">=": result = val >= threshold; break;
                case "<=": result = val <= threshold; break;
              }
            }
          }
          break;
        }
        case "status": {
          const sensor = getHASensorValue(cond.actuator_uuid);
          if (sensor) result = String(sensor.value) === String(cond.expected_status);
          break;
        }
      }
      results.push(result);
    }

    const allMet = logicOperator === "AND" ? results.every(Boolean) : results.some(Boolean);
    if (!allMet) continue;

    console.log(`[auto-engine] "${rule.name}" conditions met at ${timeParts.timeStr}`);
    const startTime = Date.now();

    try {
      const actions = Array.isArray(rule.actions) && rule.actions.length > 0
        ? rule.actions
        : [{ actuator_uuid: rule.actuator_uuid, action_type: rule.action_value || "pulse", action_value: rule.action_value }];

      for (const action of actions) {
        await executeWithRetry(action.actuator_uuid, action.action_value || action.action_type || "pulse");
      }

      const durationMs = Date.now() - startTime;
      updateLocalExecutionTime(auto.id);
      insertExecLog({
        automation_id: auto.id,
        tenant_id: rule.tenant_id || config.tenant_id,
        status: "success",
        actions_executed: actions,
        duration_ms: durationMs,
      });
      executed++;
      console.log(`[auto-engine] "${rule.name}" executed in ${durationMs}ms`);
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      insertExecLog({
        automation_id: auto.id,
        tenant_id: rule.tenant_id || config.tenant_id,
        status: "error",
        error_message: err?.message || String(err),
        duration_ms: durationMs,
      });
      errors++;
      console.error(`[auto-engine] "${rule.name}" failed after retries: ${err?.message}`);
    }
  }

  if (executed > 0 || errors > 0) {
    console.log(`[auto-engine] Round done: executed=${executed}, errors=${errors}`);
  }
}

/* ── NEW: Retry wrapper for local actuator execution ─────────────────────────── */

const RETRY_MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 30_000; // 30 seconds between retries

async function executeWithRetry(entityId: string, cmdValue: string): Promise<void> {
  for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      await executeHAService(entityId, cmdValue);
      return; // success
    } catch (err: any) {
      if (attempt < RETRY_MAX_ATTEMPTS) {
        console.warn(`[auto-engine] Command for ${entityId} failed (attempt ${attempt}/${RETRY_MAX_ATTEMPTS}): ${err?.message}. Retrying in ${RETRY_DELAY_MS / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      } else {
        throw new Error(`Command for ${entityId} failed after ${RETRY_MAX_ATTEMPTS} attempts: ${err?.message}`);
      }
    }
  }
}

/* ── Local Actuator Execution via HA REST API ────────────────────────────────── */

async function executeHAService(entityId: string, cmdValue: string): Promise<void> {
  const domain = entityId.split(".")[0];
  const cmd = (cmdValue || "toggle").toLowerCase();

  let service = "toggle";
  if (cmd === "on") service = "turn_on";
  else if (cmd === "off") service = "turn_off";
  else if (cmd === "toggle" || cmd === "pulse") service = "toggle";
  else if (domain === "cover") {
    if (cmd === "open") service = "open_cover";
    else if (cmd === "close") service = "close_cover";
    else if (cmd === "stop") service = "stop_cover";
  }

  const res = await fetch(`${HA_API_BASE}/services/${domain}/${service}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPERVISOR_TOKEN}`,
    },
    body: JSON.stringify({ entity_id: entityId }),
  });

  if (!res.ok) {
    throw new Error(`HA service call failed: ${res.status} ${await res.text()}`);
  }
}

/* ── Cloud Sync: Automations ─────────────────────────────────────────────────── */

let lastAutomationSync = "";
let automationSyncCount = 0;
let lastAutomationCount = -1;

async function syncAutomationsFromCloud(): Promise<void> {
  // Always attempt sync – use result to update connectivity status

  try {
    // Force full sync if:
    //  - first run (no lastAutomationSync)
    //  - every 6th cycle (≈30min) for pruning
    //  - previous sync returned 0 cloud automations but local DB is empty/out-of-date
    //    (incremental syncs would otherwise never recover after a stale prune)
    automationSyncCount++;
    const localCount = (db.prepare(`SELECT COUNT(*) as c FROM automations_local`).get() as { c: number }).c;
    const mismatch = lastAutomationCount >= 0 && localCount !== lastAutomationCount;
    const isFullSync = !lastAutomationSync || automationSyncCount % 6 === 0 || mismatch;

    const tenantIdParam = config.tenant_id || cloudWsAssignment.tenant_id || "";
    const params = new URLSearchParams({
      action: "sync-automations",
      tenant_id: tenantIdParam,
      device_name: config.device_name,
    });
    if (cloudWsAssignment.location_id) {
      params.set("location_id", cloudWsAssignment.location_id);
    }
    if (cloudWsAssignment.location_integration_id) {
      params.set("location_integration_id", cloudWsAssignment.location_integration_id);
    }
    if (!isFullSync && lastAutomationSync) {
      params.set("since", lastAutomationSync);
    }

    const res = await fetch(`${INGEST_URL}?${params.toString()}`, {
      headers: await cloudAuthHeaders(),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      markCloudUnreachable();
      console.error(`[sync] sync-automations returned ${res.status}`);
      return;
    }
    markCloudReachable();

    const data = await res.json() as { success: boolean; automations?: any[] };
    if (!data.success || !Array.isArray(data.automations)) return;

    const upsert = db.prepare(
      `INSERT OR REPLACE INTO automations_local (id, data, updated_at, last_executed_at)
       VALUES (?, ?, ?, COALESCE((SELECT last_executed_at FROM automations_local WHERE id = ?), NULL))`
    );

    const syncTransaction = db.transaction((automations: any[]) => {
      for (const auto of automations) {
        const ruleData = {
          ...auto,
          timezone: auto.location_timezone || auto.timezone || "Europe/Berlin",
        };
        upsert.run(auto.id, JSON.stringify(ruleData), auto.updated_at, auto.id);
      }
    });

    syncTransaction(data.automations);
    lastAutomationSync = new Date().toISOString();
    console.log(`[sync] Synced ${data.automations.length} automations from cloud (${isFullSync ? "full" : "incremental"})`);

    // Remove local automations that are no longer in the cloud.
    // Only prune on FULL sync. Important: also prune when the cloud returns
    // an EMPTY list, otherwise stale automations from a previous gateway
    // assignment (e.g. wrong tenant/location) would stay in the local DB
    // forever and keep being executed.
    if (isFullSync) {
      const cloudIds = new Set<string>(data.automations.map((a: any) => a.id));
      const localAutomations = getLocalAutomations();
      for (const local of localAutomations) {
        if (!cloudIds.has(local.id)) {
          db.prepare(`DELETE FROM automations_local WHERE id = ?`).run(local.id);
          console.log(`[sync] Pruned local automation ${local.id} (no longer in cloud)`);
        }
      }
      lastAutomationCount = data.automations.length;
    }
  } catch (err) {
    markCloudUnreachable();
    console.error("[sync] Error syncing automations:", err);
  }
}

async function pushExecutionLogs(): Promise<void> {
  // Always attempt – connectivity is tracked by heartbeat/sync results

  const unsyncedLogs = db.prepare(
    `SELECT * FROM automation_exec_log WHERE synced = 0 ORDER BY id LIMIT 100`
  ).all() as Array<{
    id: number;
    automation_id: string;
    tenant_id: string;
    status: string;
    error_message: string | null;
    actions_executed: string | null;
    duration_ms: number | null;
    trigger_type: string;
    created_at: string;
  }>;

  if (unsyncedLogs.length === 0) return;

  try {
    const logs = unsyncedLogs.map((log) => ({
      automation_id: log.automation_id,
      tenant_id: log.tenant_id,
      status: log.status,
      error_message: log.error_message,
      actions_executed: log.actions_executed ? JSON.parse(log.actions_executed) : null,
      duration_ms: log.duration_ms,
      trigger_type: log.trigger_type,
      execution_source: "local",
      executed_at: log.created_at,
    }));

    const res = await fetch(`${INGEST_URL}?action=push-execution-logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader(),
      },
      body: JSON.stringify({ logs }),
    });

    if (res.ok) {
      const maxId = unsyncedLogs[unsyncedLogs.length - 1].id;
      db.prepare(`UPDATE automation_exec_log SET synced = 1 WHERE id <= ?`).run(maxId);
      console.log(`[sync] Pushed ${logs.length} execution logs to cloud`);
    }
  } catch (err) {
    console.warn("[sync] Failed to push execution logs:", err);
  }
}

/* ── Flush Buffer to Cloud ───────────────────────────────────────────────────── */

const FLUSH_BATCH_SIZE = 200;

async function flushBuffer(): Promise<void> {
  // Always attempt flush – cloud status is determined by heartbeat/sync

  const rows = fetchBatch.all(FLUSH_BATCH_SIZE) as Array<{
    id: number;
    meter_id: string;
    tenant_id: string;
    power_value: number;
    energy_type: string;
    recorded_at: string;
  }>;

  if (rows.length === 0) return;

  const readings = rows.map((r) => ({
    meter_id: r.meter_id,
    tenant_id: r.tenant_id,
    power_value: r.power_value,
    energy_type: r.energy_type,
    recorded_at: r.recorded_at,
  }));

  try {
    const res = await fetch(INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader(),
      },
      body: JSON.stringify({ readings }),
    });

    if (res.ok) {
      const lastId = rows[rows.length - 1].id;
      deleteBatch.run(lastId);
      const result = await res.json() as { inserted?: number };
      console.log(`[flush] Sent ${readings.length} readings, inserted: ${result.inserted}`);
    } else {
      console.warn(`[flush] Cloud returned ${res.status} – keeping readings in buffer`);
    }
  } catch (err) {
    console.warn("[flush] Network error – readings remain in offline buffer:", err);
  }
}

/* ── Device Inventory Snapshot Push (HA -> Cloud) ────────────────────────────── */
/**
 * Sendet das vollständige lokale Geräte-Inventar (Sensoren, Aktoren, Zähler)
 * an die Cloud, damit AICONO sie für Zuordnung und Steuerung anbieten kann.
 */
async function pushDeviceSnapshot(): Promise<void> {
  if (!isCloudReachable && !cloudWsConnected) return;
  if (latestHAStates.length === 0) return;

  const actuatorDomains = new Set(["switch", "light", "cover", "climate", "fan", "lock", "valve"]);
  const ignoredDomains = new Set([
    "automation", "script", "scene", "zone", "person", "persistent_notification",
    "update", "button", "number", "select", "input_boolean", "input_number",
    "input_select", "input_text", "input_datetime", "timer", "counter", "schedule",
    "todo", "conversation", "tts", "stt", "wake_word", "calendar", "device_tracker",
    "media_player", "camera", "weather", "sun", "moon",
  ]);

  const domainCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = { meter: 0, actuator: 0, sensor: 0 };
  let ignoredCount = 0;

  const devices: Array<Record<string, unknown>> = [];
  for (const s of latestHAStates) {
    const domain = s.entity_id.split(".")[0];
    domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    if (ignoredDomains.has(domain)) {
      ignoredCount++;
      continue;
    }

    let category = "sensor";
    if (actuatorDomains.has(domain)) {
      category = "actuator";
    } else if (domain === "sensor") {
      const unit = asString(s.attributes?.unit_of_measurement);
      const dc = asString(s.attributes?.device_class);
      if (["energy", "power", "gas", "water"].includes(dc) || /kwh|kw|wh|m³/i.test(unit)) {
        category = "meter";
      }
    }
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;

    devices.push({
      entity_id: s.entity_id,
      domain,
      category,
      friendly_name: asString(s.attributes?.friendly_name, s.entity_id),
      state: s.state,
      unit: asString(s.attributes?.unit_of_measurement),
      device_class: asString(s.attributes?.device_class),
      last_updated: s.last_updated,
    });
  }

  console.log(
    `[snapshot] inventory analysis: ha_states=${latestHAStates.length} ignored=${ignoredCount} ` +
    `meters=${categoryCounts.meter} actuators=${categoryCounts.actuator} sensors=${categoryCounts.sensor} ` +
    `domains=${JSON.stringify(domainCounts)}`,
  );
  if (devices.length > 0) {
    const sample = devices.slice(0, 20).map((d) => `${d.entity_id}[${d.category}]`);
    console.log(`[snapshot] sample entities: ${sample.join(", ")}`);
  }

  if (devices.length === 0) {
    console.warn("[snapshot] no devices to push (after filtering). Check HA entity_filter / available domains.");
    return;
  }

  try {
    const res = await fetch(`${INGEST_URL}?action=device-snapshot`, {
      method: "POST",
      headers: { ...(await cloudAuthHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ devices }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[snapshot] device-snapshot returned ${res.status} body=${errText.slice(0, 300)} sent_devices=${devices.length}`);
      return;
    }
    const data = await res.json() as { success?: boolean; upserted?: number; pruned?: number };
    if (data.success) {
      console.log(`[snapshot] pushed ${devices.length} devices (upserted=${data.upserted ?? 0}, pruned=${data.pruned ?? 0})`);
    }
  } catch (err) {
    console.warn("[snapshot] failed:", err);
  }
}

let haVersion = "unknown";

async function fetchHAVersion(): Promise<void> {
  try {
    const res = await fetch("http://supervisor/core/api/config", {
      headers: { Authorization: `Bearer ${SUPERVISOR_TOKEN}` },
    });
    if (res.ok) {
      const data = await res.json() as { version?: string };
      haVersion = data.version || "unknown";
    }
  } catch { /* ignore */ }
}

// (Legacy HTTP-Heartbeat in v3.0 entfernt – ersetzt durch sendCloudHeartbeat() via WSS.)


/* ── Cloud WebSocket Client (gateway-ws) ─────────────────────────────────────── */
/**
 * Persistente WSS-Verbindung zur AICONO Cloud:
 *  - Sendet `auth`-Frame mit MAC + Username + Passwort
 *  - Sendet alle 30s `heartbeat` (inkl. local_ip, ha/addon-Version, Buffer-Count)
 *  - Empfängt `command`-Frames aus gateway_commands und führt sie aus
 *  - Sendet `ack`-Frames mit Erfolg/Fehler zurück
 *
 * Reconnect-Strategie: exponentielles Backoff (max 60s) – gleicher Stil wie haWs.
 */

let cloudWs: import("ws") | null = null;
let cloudWsConnected = false;
let cloudWsReconnectDelay = 5_000;
const CLOUD_WS_RECONNECT_MAX = 60_000;
let cloudWsHeartbeatTimer: NodeJS.Timeout | null = null;
let cloudWsAssignment: {
  device_id?: string;
  tenant_id?: string;
  location_id?: string | null;
  location_integration_id?: string | null;
} = {};

function safeWsSend(ws: import("ws") | null, msg: unknown): void {
  if (!ws || ws.readyState !== 1 /* OPEN */) return;
  try { ws.send(JSON.stringify(msg)); } catch { /* ignore */ }
}

async function sendCloudHeartbeat(): Promise<void> {
  if (!cloudWs || !cloudWsConnected) return;
  safeWsSend(cloudWs, {
    type: "heartbeat",
    local_ip: await getLocalIP(),
    local_time: new Date().toISOString(),
    addon_version: ADDON_VERSION,
    ha_version: haVersion,
    offline_buffer_count: getBufferCount(),
  });
}

async function connectCloudWebSocket(): Promise<void> {
  if (!WebSocketClient) {
    console.error("[cloud-ws] ws module not available – cannot connect");
    return;
  }
  if (!config.gateway_username || !config.gateway_password) {
    console.warn("[cloud-ws] gateway_username/password missing – skipping WS connect");
    setTimeout(connectCloudWebSocket, 30_000);
    return;
  }
  const mac = await getHostMAC();
  if (!mac) {
    console.warn("[cloud-ws] MAC not yet available – retry in 10s");
    setTimeout(connectCloudWebSocket, 10_000);
    return;
  }

  console.log(`[cloud-ws] Connecting to ${GATEWAY_WS_URL} (mac=${mac.slice(0, 4)}…)`);
  try {
    cloudWs = new WebSocketClient(GATEWAY_WS_URL);
  } catch (err) {
    console.error("[cloud-ws] Constructor failed:", err);
    scheduleCloudReconnect();
    return;
  }

  cloudWs.on("open", async () => {
    console.log("[cloud-ws] TCP/WS open – sending auth frame");
    safeWsSend(cloudWs, {
      type: "auth",
      mac,
      username: config.gateway_username,
      password: config.gateway_password,
      addon_version: ADDON_VERSION,
      ha_version: haVersion,
      local_ip: await getLocalIP(),
      local_time: new Date().toISOString(),
    });
  });

  cloudWs.on("message", async (data: Buffer) => {
    let msg: any;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    switch (msg?.type) {
      case "auth_ok": {
        cloudWsConnected = true;
        cloudWsReconnectDelay = 5_000;
        cloudWsAssignment = {
          device_id: msg.device_id,
          tenant_id: msg.tenant_id,
          location_id: msg.location_id,
          location_integration_id: msg.location_integration_id,
        };
        currentAssignmentStatus = msg.tenant_id ? "assigned" : "pending_assignment";
        markCloudReachable();
        console.log(`[cloud-ws] Authenticated. device=${msg.device_id} tenant=${msg.tenant_id || "(none)"}`);
        // Sofort einen Heartbeat senden, damit Backend-UI die Werte hat
        await sendCloudHeartbeat();
        // Periodischer Heartbeat
        if (cloudWsHeartbeatTimer) clearInterval(cloudWsHeartbeatTimer);
        cloudWsHeartbeatTimer = setInterval(sendCloudHeartbeat, 30_000);
        break;
      }
      case "auth_error": {
        console.error(`[cloud-ws] Auth failed: ${msg.error}`);
        // Bei Auth-Fehlern langsamer reconnecten (kein Brute-Force)
        cloudWsReconnectDelay = 60_000;
        try { cloudWs?.close(); } catch { /* ignore */ }
        break;
      }
      case "pong":
        // Server bestätigt Heartbeat
        markCloudReachable();
        break;
      case "command": {
        const cmdId = String(msg.id || "");
        const cmdType = String(msg.command_type || "");
        const payload = msg.payload || {};
        console.log(`[cloud-ws] command received: ${cmdType} (${cmdId})`);
        try {
          const response = await handleCloudCommand(cmdType, payload);
          safeWsSend(cloudWs, { type: "ack", command_id: cmdId, response });
        } catch (err: any) {
          console.error(`[cloud-ws] command ${cmdType} failed:`, err);
          safeWsSend(cloudWs, { type: "ack", command_id: cmdId, error: err?.message || String(err) });
        }
        break;
      }
      default:
        // unknown – ignore
        break;
    }
  });

  cloudWs.on("close", (code: number, reason: Buffer) => {
    cloudWsConnected = false;
    if (cloudWsHeartbeatTimer) {
      clearInterval(cloudWsHeartbeatTimer);
      cloudWsHeartbeatTimer = null;
    }
    console.warn(`[cloud-ws] closed (code=${code}, reason=${reason.toString().slice(0, 80) || "n/a"})`);
    scheduleCloudReconnect();
  });

  cloudWs.on("error", (err: Error) => {
    console.error("[cloud-ws] error:", err.message);
    markCloudUnreachable();
  });
}

function scheduleCloudReconnect(): void {
  const delay = cloudWsReconnectDelay;
  cloudWsReconnectDelay = Math.min(cloudWsReconnectDelay * 2, CLOUD_WS_RECONNECT_MAX);
  console.log(`[cloud-ws] reconnect in ${Math.round(delay / 1000)}s`);
  setTimeout(connectCloudWebSocket, delay);
}

/**
 * Mappt einen Cloud-Befehl auf eine lokale Aktion.
 * - `backup` / `restart` / `update`: nutzt bestehenden executePendingCommand-Pfad
 * - `execute_actuator`: Schaltbefehl an HA REST API (entity_id + command in payload)
 * - `sync_automations` / `sync_meters`: forciert Pull aus der Cloud
 */
async function handleCloudCommand(cmdType: string, payload: Record<string, unknown>): Promise<unknown> {
  switch (cmdType) {
    case "execute_actuator": {
      const entityId = String(payload.entity_id || payload.actuator_uuid || "");
      const commandValue = String(payload.command || payload.action_value || payload.action_type || "toggle");
      if (!entityId) throw new Error("entity_id missing");
      await executeWithRetry(entityId, commandValue);
      return { ok: true, entity_id: entityId, command: commandValue };
    }
    case "sync_automations":
      await syncAutomationsFromCloud();
      return { ok: true, count: getLocalAutomations().length };
    case "sync_meters":
      await fetchMeterMappings();
      return { ok: true, count: meterMappings.length };
    case "backup":
    case "restart":
    case "update":
      await executePendingCommand(cmdType, payload);
      return { ok: true };
    case "set_ui_pin": {
      // Cloud kann den UI-PIN-Hash live aktualisieren
      const hash = payload.ui_pin_hash;
      uiPinHash = (typeof hash === "string" && hash.length > 0) ? hash : null;
      console.log(`[cloud-ws] UI PIN ${uiPinHash ? "updated" : "cleared"}`);
      return { ok: true };
    }
    default:
      throw new Error(`Unknown command: ${cmdType}`);
  }
}

let cachedHostIPAt = 0;
const HOST_IP_TTL_MS = 5 * 60 * 1000; // refresh every 5 min to catch DHCP changes after reboot

let cachedHostMAC: string | null = null;
let cachedHostMACAt = 0;
const HOST_MAC_TTL_MS = 60 * 60 * 1000; // 1h – MAC is effectively static

function normalizeMac(mac: string): string {
  return mac.toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 12);
}

async function getHostMAC(): Promise<string> {
  if (cachedHostMAC && Date.now() - cachedHostMACAt < HOST_MAC_TTL_MS) {
    return cachedHostMAC;
  }
  // 1) Supervisor API – preferred (real host MAC, not docker bridge)
  try {
    const token = process.env.SUPERVISOR_TOKEN;
    if (token) {
      const res = await fetch("http://supervisor/network/info", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as any;
        const ifaces = data?.data?.interfaces;
        if (Array.isArray(ifaces)) {
          // Prefer enabled ethernet
          const pickMac = (it: any): string | null => {
            const candidates = [it?.mac, it?.mac_address, it?.hw_address, it?.hardware];
            for (const c of candidates) {
              if (typeof c === "string" && /[0-9a-f]/i.test(c)) {
                const norm = normalizeMac(c);
                if (norm.length === 12) return norm;
              }
            }
            return null;
          };
          for (const it of ifaces) {
            if (it.enabled && it.type === "ethernet") {
              const m = pickMac(it);
              if (m) { cachedHostMAC = m; cachedHostMACAt = Date.now(); return m; }
            }
          }
          for (const it of ifaces) {
            if (it.enabled) {
              const m = pickMac(it);
              if (m) { cachedHostMAC = m; cachedHostMACAt = Date.now(); return m; }
            }
          }
        }
      }
    }
  } catch { /* ignore */ }
  // 2) os.networkInterfaces fallback (container MAC – not ideal but stable)
  try {
    const os = require("os");
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === "IPv4" && !iface.internal && iface.mac && iface.mac !== "00:00:00:00:00:00") {
          const m = normalizeMac(iface.mac);
          if (m.length === 12) { cachedHostMAC = m; cachedHostMACAt = Date.now(); return m; }
        }
      }
    }
  } catch { /* ignore */ }
  return "";
}

let cachedHostIP: string | null = null;

async function getLocalIP(): Promise<string> {
  // Cached value is valid for HOST_IP_TTL_MS – ensures DHCP changes
  // (e.g. after a power outage / reboot) are picked up automatically.
  if (cachedHostIP && Date.now() - cachedHostIPAt < HOST_IP_TTL_MS) {
    return cachedHostIP;
  }
  cachedHostIP = null;

  // Use HA Supervisor API to get actual host LAN IP
  try {
    const token = process.env.SUPERVISOR_TOKEN;
    if (token) {
      const res = await fetch("http://supervisor/network/info", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as any;
        const ifaces = data?.data?.interfaces;
        if (Array.isArray(ifaces)) {
          for (const iface of ifaces) {
            if (iface.enabled && iface.type === "ethernet") {
              const ipv4 = iface.ipv4?.address?.[0];
              if (ipv4) {
                // Format is "192.168.1.100/24" – strip CIDR suffix
                cachedHostIP = ipv4.split("/")[0] ?? "localhost";
                cachedHostIPAt = Date.now();
                return cachedHostIP ?? "localhost";
              }
            }
          }
          // Fallback: try wifi or any enabled interface
          for (const iface of ifaces) {
            if (iface.enabled) {
              const ipv4 = iface.ipv4?.address?.[0];
              if (ipv4) {
                cachedHostIP = ipv4.split("/")[0] ?? "localhost";
                cachedHostIPAt = Date.now();
                return cachedHostIP ?? "localhost";
              }
            }
          }
        }
      }
    }
  } catch { /* Supervisor API not available */ }

  // Final fallback: container IP via os.networkInterfaces()
  try {
    const os = require("os");
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === "IPv4" && !iface.internal) return iface.address;
      }
    }
  } catch { /* ignore */ }
  return "unknown";
}

/* ── Remote Command Execution ─────────────────────────────────────────────────── */

async function executePendingCommand(command: string, params: Record<string, unknown>): Promise<void> {
  console.log(`[command] Executing remote command: ${command}`);
  try {
    switch (command) {
      case "backup":
        await sendBackup();
        console.log("[command] Backup completed successfully");
        break;

      case "restart":
        console.log("[command] Restart requested – restarting add-on in 3 seconds...");
        // Send a final heartbeat to confirm receipt, then restart via Supervisor API
        setTimeout(async () => {
          try {
            const addonSlug = process.env.HOSTNAME || "local_aicono_ems_gateway";
            const res = await fetch(`http://supervisor/addons/${addonSlug}/restart`, {
              method: "POST",
              headers: { Authorization: `Bearer ${SUPERVISOR_TOKEN}` },
            });
            if (!res.ok) {
              console.error(`[command] Restart API returned ${res.status}`);
              // Fallback: exit process (container orchestrator will restart)
              process.exit(0);
            }
          } catch (err) {
            console.error("[command] Restart via Supervisor failed, forcing exit:", err);
            process.exit(0);
          }
        }, 3000);
        break;

      case "update":
        console.log("[command] Update command received – triggering add-on update via Supervisor...");
        try {
          const addonSlug = process.env.HOSTNAME || "local_aicono_ems_gateway";
          const res = await fetch(`http://supervisor/addons/${addonSlug}/update`, {
            method: "POST",
            headers: { Authorization: `Bearer ${SUPERVISOR_TOKEN}` },
          });
          if (res.ok) {
            console.log("[command] Update triggered successfully");
          } else {
            console.error(`[command] Update API returned ${res.status}: ${await res.text()}`);
          }
        } catch (err) {
          console.error("[command] Update via Supervisor failed:", err);
        }
        break;

      default:
        console.warn(`[command] Unknown command: ${command}`);
    }
  } catch (err) {
    console.error(`[command] Error executing command '${command}':`, err);
  }
}

/* ── Auto Backup ─────────────────────────────────────────────────────────────── */

async function sendBackup(): Promise<void> {
  // Always attempt backup
  try {
    const res = await fetch(`${INGEST_URL}?action=gateway-backup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader(),
      },
      body: JSON.stringify({
        tenant_id: config.tenant_id,
        device_name: config.device_name,
        backup_data: {
          config: { ...config, gateway_api_key: "[redacted]" },
          meter_mappings: meterMappings.map((m) => ({ id: m.id, sensor_uuid: m.sensor_uuid })),
          buffer_count: getBufferCount(),
          automation_count: getLocalAutomations().length,
          ha_version: haVersion,
          addon_version: ADDON_VERSION,
        },
      }),
    });
    if (res.ok) {
      console.log("[backup] Gateway backup sent to cloud");
    }
  } catch (err) {
    console.warn("[backup] Failed:", err);
  }
}

/* ── HTTP Server (Health + UI + APIs) ────────────────────────────────────────── */

const UI_DIR = path.join(__dirname, "ui");

function serveStaticFile(filePath: string, res: http.ServerResponse): void {
  const extMap: Record<string, string> = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
  };

  const fullPath = path.join(UI_DIR, filePath);
  const safePath = path.resolve(fullPath);

  if (!safePath.startsWith(path.resolve(UI_DIR))) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = fs.readFileSync(safePath);
    const ext = path.extname(safePath);
    const contentType = extMap[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not Found");
  }
}

function startServer(): void {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:8099`);
    const pathname = url.pathname;

    // CORS for local requests
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // ── PIN Auth endpoint (always accessible) ──
    if (pathname === "/api/auth" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk: string) => { body += chunk; });
      req.on("end", () => {
        try {
          const { pin } = JSON.parse(body);

          // Check lockout
          if (Date.now() < pinLockoutUntil) {
            const waitSec = Math.ceil((pinLockoutUntil - Date.now()) / 1000);
            res.writeHead(429, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Zu viele Versuche", retry_after_seconds: waitSec }));
            return;
          }

          if (!uiPinHash) {
            // No PIN configured – auto-auth
            const token = generateSessionToken();
            activeSessions.set(token, Date.now() + SESSION_TTL_MS);
            res.setHeader("Set-Cookie", `ems_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true }));
            return;
          }

          const inputHash = sha256Sync(String(pin || ""));
          if (inputHash === uiPinHash) {
            // Success
            pinFailCount = 0;
            const token = generateSessionToken();
            activeSessions.set(token, Date.now() + SESSION_TTL_MS);
            cleanupSessions();
            res.setHeader("Set-Cookie", `ems_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true }));
          } else {
            pinFailCount++;
            if (pinFailCount >= PIN_MAX_ATTEMPTS) {
              pinLockoutUntil = Date.now() + PIN_LOCKOUT_MS;
              pinFailCount = 0;
              console.warn("[auth] PIN lockout activated (60s)");
            }
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Falscher PIN", remaining_attempts: PIN_MAX_ATTEMPTS - pinFailCount }));
          }
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid request" }));
        }
      });
      return;
    }

    // ── Auth check: is PIN required? ──
    if (pathname === "/api/auth-status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ pin_required: !!uiPinHash, authenticated: isSessionValid(req) }));
      return;
    }

    // ── Session check for all other /api/* and UI routes ──
    if (uiPinHash && !isSessionValid(req)) {
      // Allow version endpoint without auth (for health checks)
      if (pathname !== "/api/version") {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized", pin_required: true }));
        return;
      }
    }

    // API endpoints
    if (pathname === "/api/status") {
      const mac = await getHostMAC();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "running",
        addon_version: ADDON_VERSION,
        ha_version: haVersion,
        buffer_count: getBufferCount(),
        meter_mappings: meterMappings.length,
        automation_count: getLocalAutomations().length,
        uptime_seconds: Math.floor(process.uptime()),
        cloud_reachable: isCloudReachable,
        ha_ws_connected: haWsConnected,
        mac_address: mac,
        gateway_username: config.gateway_username || "",
        assignment_status: currentAssignmentStatus,
        credentials_configured: !!(config.gateway_username && config.gateway_password),
        cloud_ws_connected: cloudWsConnected,
        cloud_ws_device_id: cloudWsAssignment.device_id || null,
        cloud_ws_location_id: cloudWsAssignment.location_id || null,
      }));
      return;
    }

    if (pathname === "/api/config") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ...config,
        gateway_api_key: "[redacted]",
      }));
      return;
    }

    if (pathname === "/api/version") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ version: ADDON_VERSION }));
      return;
    }

    if (pathname === "/api/sensors") {
      const filtered = latestHAStates
        .filter((s) => matchesEntityFilter(s.entity_id) || s.entity_id.startsWith("sensor."))
        .map((s) => ({
          entity_id: s.entity_id,
          state: s.state,
          unit: s.attributes?.unit_of_measurement || "",
          friendly_name: s.attributes?.friendly_name || s.entity_id,
          last_updated: s.last_updated,
        }))
        .slice(0, 200);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, sensors: filtered, total: latestHAStates.length }));
      return;
    }

    // ── NEW: Controllable entities (switches, lights, covers) ──
    if (pathname === "/api/actuators") {
      const actuators = latestHAStates
        .filter((s) => s.entity_id.startsWith("switch.") || s.entity_id.startsWith("light.") || s.entity_id.startsWith("cover.") || s.entity_id.startsWith("climate."))
        .map((s) => ({
          entity_id: s.entity_id,
          state: s.state,
          domain: s.entity_id.split(".")[0],
          friendly_name: s.attributes?.friendly_name || s.entity_id,
          last_updated: s.last_updated,
        }))
        .slice(0, 100);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, actuators }));
      return;
    }

    // ── Devices overview: all entities grouped by type ──
    if (pathname === "/api/devices") {
      const actuatorDomains = new Set(["switch", "light", "cover", "climate", "fan", "lock", "valve"]);
      const meterDomains = new Set(["sensor"]);
      const ignoredDomains = new Set(["automation", "script", "scene", "zone", "person", "persistent_notification", "update", "button", "number", "select", "input_boolean", "input_number", "input_select", "input_text", "input_datetime", "timer", "counter", "schedule", "todo", "conversation", "tts", "stt", "wake_word", "calendar", "device_tracker", "media_player", "camera", "weather", "sun", "moon"]);

      const devices: { entity_id: string; state: string; domain: string; friendly_name: string; unit: string; device_class: string; last_updated: string; category: string }[] = [];

      for (const s of latestHAStates) {
        const domain = s.entity_id.split(".")[0];
        if (ignoredDomains.has(domain)) continue;

        let category = "sensor";
        if (actuatorDomains.has(domain)) {
          category = "actuator";
        } else if (domain === "sensor") {
          const unit = asString(s.attributes?.unit_of_measurement);
          const dc = asString(s.attributes?.device_class);
          if (["energy", "power", "gas", "water"].includes(dc) || /kwh|kw|wh|m³/i.test(unit)) {
            category = "meter";
          }
        } else if (domain === "binary_sensor") {
          category = "sensor";
        }

        devices.push({
          entity_id: s.entity_id,
          state: s.state,
          domain,
          friendly_name: asString(s.attributes?.friendly_name, s.entity_id),
          unit: asString(s.attributes?.unit_of_measurement),
          device_class: asString(s.attributes?.device_class),
          last_updated: s.last_updated,
          category,
        });
      }

      const grouped = {
        meters: devices.filter((d) => d.category === "meter"),
        sensors: devices.filter((d) => d.category === "sensor"),
        actuators: devices.filter((d) => d.category === "actuator"),
      };

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, devices: grouped, total: devices.length }));
      return;
    }

    // ── NEW: Execute HA service (local actuator control) ──
    if (pathname === "/api/execute" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", async () => {
        try {
          const { entity_id, service } = JSON.parse(body);
          if (!entity_id || !service) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "entity_id and service required" }));
            return;
          }
          await executeHAService(entity_id, service);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, entity_id, service }));
        } catch (err: any) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err?.message || "Execution failed" }));
        }
      });
      return;
    }

    if (pathname === "/api/automations") {
      const automations = getLocalAutomations().map((a) => {
        let rule: any = {};
        try { rule = JSON.parse(a.data); } catch { /* ignore */ }
        return {
          id: a.id,
          name: rule.name || "Unnamed",
          is_active: rule.is_active ?? true,
          conditions: rule.conditions || [],
          actions: rule.actions || [],
          logic_operator: rule.logic_operator || "AND",
          conditions_count: (rule.conditions || []).length,
          actions_count: (rule.actions || []).length,
          actuator_uuid: rule.actuator_uuid || null,
          actuator_name: rule.actuator_name || null,
          action_type: rule.action_type || null,
          action_value: rule.action_value || null,
          last_executed_at: a.last_executed_at,
          updated_at: a.updated_at,
        };
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, automations }));
      return;
    }

    if (pathname === "/api/logs") {
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);
      const logs = db.prepare(
        `SELECT automation_id, tenant_id, status, error_message, duration_ms, trigger_type, created_at
         FROM automation_exec_log ORDER BY id DESC LIMIT ?`
      ).all(Math.min(limit, 200)) as Array<{
        automation_id: string;
        tenant_id: string;
        status: string;
        error_message: string | null;
        duration_ms: number | null;
        trigger_type: string | null;
        created_at: string;
      }>;

      const automationRows = db.prepare(`SELECT id, data FROM automations_local`).all() as Array<{ id: string; data: string }>;
      const automationNameById = new Map<string, string>();
      for (const row of automationRows) {
        try {
          const parsed = JSON.parse(row.data) as { name?: string };
          automationNameById.set(row.id, parsed.name || row.id);
        } catch {
          automationNameById.set(row.id, row.id);
        }
      }

      const enrichedLogs = logs.map((log) => ({
        ...log,
        automation_name: automationNameById.get(log.automation_id) || log.automation_id,
      }));

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, logs: enrichedLogs }));
      return;
    }

    if (pathname === "/api/backup" && req.method === "POST") {
      sendBackup().then(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      }).catch(() => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Backup failed" }));
      });
      return;
    }

    // UI: serve static files
    if (pathname === "/" || pathname === "/ui" || pathname === "/ui/") {
      serveStaticFile("index.html", res);
      return;
    }
    if (pathname.startsWith("/ui/")) {
      serveStaticFile(pathname.replace("/ui/", ""), res);
      return;
    }

    // Ingress: HA adds /api/hassio_ingress/<token>/ prefix
    // Extract the sub-path after the ingress token
    const ingressMatch = pathname.match(/\/api\/hassio_ingress\/[^/]+(\/.*)?$/);
    if (ingressMatch) {
      const subPath = (ingressMatch[1] || "/").replace(/^\/+/, "/");

      // Re-dispatch: feed the sub-path back into the same handler
      const fakeUrl = new URL(subPath + url.search, `http://localhost:8099`);
      const fakeReq = Object.create(req, {
        url: { value: fakeUrl.pathname + fakeUrl.search },
      });
      server.emit("request", fakeReq, res);
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  server.listen(8099, () => {
    console.log("[server] AICONO EMS Gateway API + UI listening on port 8099");
  });
}

/* ── Main ────────────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  AICONO EMS Gateway v${ADDON_VERSION}`);
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Device:     ${config.device_name}`);
  console.log(`  Tenant:     ${config.tenant_id}`);
  console.log(`  Poll:       ${config.poll_interval_seconds}s`);
  console.log(`  Flush:      ${config.flush_interval_seconds}s`);
  console.log(`  Heartbeat:  ${config.heartbeat_interval_seconds}s`);
  console.log(`  Automation: ${config.automation_eval_seconds}s`);
  console.log("═══════════════════════════════════════════════════════");

  compileEntityFilter();

  // Load offline caches before starting server
  const cachedMappings = loadMeterMappingsFromCache();
  if (cachedMappings.length > 0) {
    meterMappings = cachedMappings;
    console.log(`[offline] Loaded ${cachedMappings.length} meter mappings from cache`);
  }
  const cachedStates = loadHAStatesFromCache();
  if (cachedStates.length > 0) {
    latestHAStates = cachedStates;
    console.log(`[offline] Loaded ${cachedStates.length} HA states from cache`);
  }

  startServer();

  // Initial setup
  await checkCloudConnectivity();
  await fetchHAVersion();
  await fetchMeterMappings();
  await syncAutomationsFromCloud();

  // Connect HA WebSocket for live sensor updates
  connectHAWebSocket();

  // Connect persistent WSS to AICONO Cloud (gateway-ws) for heartbeat + commands
  connectCloudWebSocket();

  // Polling loop (REST-based, for readings)
  // WICHTIG: initialer Poll sofort ausführen, damit latestHAStates die volle
  // HA-Entity-Liste enthält BEVOR der erste Device-Snapshot gepusht wird.
  // Ohne diesen Init-Poll würde nur der lokale SQLite-Cache (max 500, ggf. nur
  // wenige System-Sensoren) als Inventar an die Cloud gehen.
  pollHAStates().catch((e) => console.error("[ha-poll] initial poll failed", e));
  setInterval(() => pollHAStates(), config.poll_interval_seconds * 1000);

  // Flush loop
  setInterval(() => flushBuffer(), config.flush_interval_seconds * 1000);

  // Cloud-Health-Watchdog: prüft alle 60s ob die WS noch lebt; falls nein,
  // wird der Reconnect bereits durch das `close`-Event getriggert. Wir nutzen
  // diesen Tick zusätzlich, um HA-Version aktuell zu halten.
  setInterval(async () => {
    try {
      await fetchHAVersion();
      if (!cloudWsConnected) {
        // markCloudUnreachable kümmert sich um den UI-Status
        markCloudUnreachable();
      }
    } catch (err) {
      console.error("[watchdog] tick failed:", err);
    }
  }, 60_000);

  // Automation evaluation loop
  setInterval(() => evaluateAndExecuteAutomations(), config.automation_eval_seconds * 1000);

  // Sync automations from cloud every 5 minutes
  setInterval(async () => {
    await syncAutomationsFromCloud();
    await pushExecutionLogs();
  }, 5 * 60 * 1000);

  // Refresh meter mappings every 5 minutes
  setInterval(() => fetchMeterMappings(), 5 * 60 * 1000);

  // Push device inventory snapshot to cloud.
  // Erster Push erst nach 25s, damit der initiale pollHAStates() (oben) sicher
  // alle Entities von HA geladen hat. Danach alle 2 Minuten erneut.
  setTimeout(() => pushDeviceSnapshot(), 25_000);
  setInterval(() => pushDeviceSnapshot(), 2 * 60 * 1000);

  // Auto backup
  if (config.auto_backup_hours > 0) {
    setInterval(() => sendBackup(), config.auto_backup_hours * 60 * 60 * 1000);
  }

  console.log("[main] All loops started. AICONO EMS Gateway is running.");
}

main().catch((err) => {
  console.error("[main] Fatal error:", err);
  process.exit(1);
});
