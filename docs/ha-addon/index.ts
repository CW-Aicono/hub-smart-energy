/**
 * AICONO EMS Gateway v2.1
 * ==============================================
 * Lokaler Gateway-Hub: Pollt HA REST API, puffert offline via SQLite,
 * pusht Readings batched an gateway-ingest.
 * Features: Lokale Automationsausführung, WebSocket-Client, Preact-UI,
 * Priority-Buffer, Offline-Caches, Lokale Aktor-Steuerung.
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
  gateway_api_key: string;
  tenant_id: string;
  device_name: string;
  poll_interval_seconds: number;
  flush_interval_seconds: number;
  heartbeat_interval_seconds: number;
  entity_filter: string;
  offline_buffer_max_mb: number;
  auto_backup_hours: number;
  automation_eval_seconds: number;
}

function loadConfig(): AddonConfig {
  const optionsPath = "/data/options.json";
  try {
    const raw = fs.readFileSync(optionsPath, "utf-8");
    console.log("[config] Loaded /data/options.json");
    const parsed = JSON.parse(raw);
    // Fallback: support old 'supabase_url' field
    const cloudUrl = parsed.cloud_url || parsed.supabase_url || "";
    return { automation_eval_seconds: 30, ...parsed, cloud_url: cloudUrl };
  } catch (error: any) {
    console.warn(`[config] Cannot read ${optionsPath} (${error?.code || error?.message}), using env vars`);
  }
  return {
    cloud_url: process.env.CLOUD_URL || process.env.SUPABASE_URL || "",
    gateway_api_key: process.env.GATEWAY_API_KEY || "",
    tenant_id: process.env.TENANT_ID || "",
    device_name: process.env.DEVICE_NAME || "aicono-ems",
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
const ADDON_VERSION = "2.1.0";

/* ── Connectivity State ──────────────────────────────────────────────────────── */

let isCloudReachable = true;
let lastCloudCheck = 0;
let cloudFailCount = 0;

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
    const res = await fetch(`${config.cloud_url}/functions/v1/gateway-ingest?action=addon-version`, {
      headers: { Authorization: `Bearer ${config.gateway_api_key}` },
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
      headers: { Authorization: `Bearer ${config.gateway_api_key}` },
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
}

function getLocalTimeParts(timezone: string): { hours: number; minutes: number; weekday: number; timeStr: string } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("de-DE", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hours = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const minutes = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
  const timeStr = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

  const dayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" });
  const dayStr = dayFormatter.format(now);
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = dayMap[dayStr] ?? 0;

  return { hours, minutes, weekday, timeStr };
}

function isTimeInRange(currentTime: string, timeFrom: string, timeTo: string): boolean {
  if (timeFrom <= timeTo) {
    return currentTime >= timeFrom && currentTime <= timeTo;
  }
  return currentTime >= timeFrom || currentTime <= timeTo;
}

function isNearTimePoint(currentTimeStr: string, targetTime: string): boolean {
  const [tH, tM] = targetTime.split(":").map(Number);
  const targetMin = tH * 60 + tM;
  const [cH, cM] = currentTimeStr.split(":").map(Number);
  const currentMin = cH * 60 + cM;
  const diff = Math.abs(currentMin - targetMin);
  return diff <= 2 || diff >= (24 * 60 - 2);
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
          if (cond.time_point) result = isNearTimePoint(timeParts.timeStr, cond.time_point);
          break;
        case "time_switch":
          if (cond.time_points?.length > 0) {
            result = cond.time_points.some((tp: string) => isNearTimePoint(timeParts.timeStr, tp));
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
        await executeHAService(action.actuator_uuid, action.action_value || action.action_type || "pulse");
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
      console.error(`[auto-engine] "${rule.name}" failed: ${err?.message}`);
    }
  }

  if (executed > 0 || errors > 0) {
    console.log(`[auto-engine] Round done: executed=${executed}, errors=${errors}`);
  }
}

/* ── NEW: Local Actuator Execution via HA REST API ───────────────────────────── */

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

async function syncAutomationsFromCloud(): Promise<void> {
  // Always attempt sync – use result to update connectivity status

  try {
    const params = new URLSearchParams({
      action: "sync-automations",
      tenant_id: config.tenant_id,
    });
    if (lastAutomationSync) {
      params.set("since", lastAutomationSync);
    }

    const res = await fetch(`${INGEST_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${config.gateway_api_key}` },
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
    console.log(`[sync] Synced ${data.automations.length} automations from cloud`);

    // Remove local automations that are no longer in the cloud
    if (data.automations.length > 0) {
      const cloudIds = data.automations.map((a: any) => a.id);
      const localAutomations = getLocalAutomations();
      for (const local of localAutomations) {
        if (!cloudIds.includes(local.id)) {
          db.prepare(`DELETE FROM automations_local WHERE id = ?`).run(local.id);
        }
      }
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
        Authorization: `Bearer ${config.gateway_api_key}`,
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
  if (!isCloudReachable) return;

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
        Authorization: `Bearer ${config.gateway_api_key}`,
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

/* ── Heartbeat ───────────────────────────────────────────────────────────────── */

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

async function sendHeartbeat(): Promise<void> {
  // Always attempt heartbeat – use result to update connectivity status
  try {
    const res = await fetch(`${INGEST_URL}?action=heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.gateway_api_key}`,
      },
      body: JSON.stringify({
        device_name: config.device_name,
        device_type: "aicono-ems",
        tenant_id: config.tenant_id,
        local_ip: getLocalIP(),
        ha_version: haVersion,
        addon_version: ADDON_VERSION,
        offline_buffer_count: getBufferCount(),
        local_time: new Date().toISOString(),
        config: {
          poll_interval_seconds: config.poll_interval_seconds,
          entity_filter: config.entity_filter,
          meter_count: meterMappings.length,
          automation_count: getLocalAutomations().length,
          cloud_reachable: isCloudReachable,
        },
      }),
    });

    if (res.ok) {
      markCloudReachable();
      const data = await res.json() as { latest_available_version?: string };
      if (data.latest_available_version && data.latest_available_version !== ADDON_VERSION) {
        console.log(`[heartbeat] Update available: ${data.latest_available_version}`);
      }
    } else {
      markCloudUnreachable();
      console.warn(`[heartbeat] Cloud returned ${res.status}`);
    }
  } catch (err) {
    markCloudUnreachable();
    console.warn("[heartbeat] Failed:", err);
  }
}

function getLocalIP(): string {
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

/* ── Auto Backup ─────────────────────────────────────────────────────────────── */

async function sendBackup(): Promise<void> {
  if (!isCloudReachable) return;
  try {
    const res = await fetch(`${INGEST_URL}?action=gateway-backup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.gateway_api_key}`,
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

    // API endpoints
    if (pathname === "/api/status") {
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
          conditions_count: (rule.conditions || []).length,
          actions_count: (rule.actions || []).length,
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
      ).all(Math.min(limit, 200));

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, logs }));
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
  await sendHeartbeat();

  // Connect HA WebSocket for live sensor updates
  connectHAWebSocket();

  // Polling loop (REST-based, for readings)
  setInterval(() => pollHAStates(), config.poll_interval_seconds * 1000);

  // Flush loop
  setInterval(() => flushBuffer(), config.flush_interval_seconds * 1000);

  // Heartbeat loop
  setInterval(async () => {
    await checkCloudConnectivity();
    await fetchHAVersion();
    await sendHeartbeat();
  }, config.heartbeat_interval_seconds * 1000);

  // Automation evaluation loop
  setInterval(() => evaluateAndExecuteAutomations(), config.automation_eval_seconds * 1000);

  // Sync automations from cloud every 5 minutes
  setInterval(async () => {
    await syncAutomationsFromCloud();
    await pushExecutionLogs();
  }, 5 * 60 * 1000);

  // Refresh meter mappings every 5 minutes
  setInterval(() => fetchMeterMappings(), 5 * 60 * 1000);

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
