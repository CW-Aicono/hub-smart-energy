/**
 * EMS Gateway Hub – Home Assistant Add-on
 * =========================================
 * Lokaler Gateway-Hub: Pollt HA REST API, puffert offline via SQLite,
 * pusht Readings batched an gateway-ingest.
 */

import http from "http";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

/* ── Configuration ───────────────────────────────────────────────────────────── */

interface AddonConfig {
  supabase_url: string;
  gateway_api_key: string;
  tenant_id: string;
  device_name: string;
  poll_interval_seconds: number;
  flush_interval_seconds: number;
  heartbeat_interval_seconds: number;
  entity_filter: string;
  offline_buffer_max_mb: number;
  auto_backup_hours: number;
}

function loadConfig(): AddonConfig {
  const optionsPath = "/data/options.json";
  try {
    const raw = fs.readFileSync(optionsPath, "utf-8");
    console.log("[config] Loaded /data/options.json");
    return JSON.parse(raw) as AddonConfig;
  } catch (error: any) {
    console.warn(`[config] Cannot read ${optionsPath} (${error?.code || error?.message}), using env vars`);
  }
  return {
    supabase_url: process.env.SUPABASE_URL || "",
    gateway_api_key: process.env.GATEWAY_API_KEY || "",
    tenant_id: process.env.TENANT_ID || "",
    device_name: process.env.DEVICE_NAME || "ha-addon",
    poll_interval_seconds: Number(process.env.POLL_INTERVAL_SECONDS) || 30,
    flush_interval_seconds: Number(process.env.FLUSH_INTERVAL_SECONDS) || 5,
    heartbeat_interval_seconds: Number(process.env.HEARTBEAT_INTERVAL_SECONDS) || 60,
    entity_filter: process.env.ENTITY_FILTER || "sensor.*_energy,sensor.*_power",
    offline_buffer_max_mb: Number(process.env.OFFLINE_BUFFER_MAX_MB) || 100,
    auto_backup_hours: Number(process.env.AUTO_BACKUP_HOURS) || 24,
  };
}

const config = loadConfig();
const SUPERVISOR_TOKEN = process.env.SUPERVISOR_TOKEN || "";
const HA_API_BASE = "http://supervisor/core/api";
const INGEST_URL = `${config.supabase_url}/functions/v1/gateway-ingest`;

/* ── SQLite Offline Buffer ───────────────────────────────────────────────────── */

const DB_PATH = "/data/db/buffer.sqlite3";
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS readings_buffer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meter_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    power_value REAL NOT NULL,
    energy_type TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_buffer_created ON readings_buffer(created_at);
`);

const insertReading = db.prepare(
  `INSERT INTO readings_buffer (meter_id, tenant_id, power_value, energy_type, recorded_at) VALUES (?, ?, ?, ?, ?)`
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

function enforceBufferLimit(): void {
  const maxBytes = config.offline_buffer_max_mb * 1024 * 1024;
  try {
    const stats = fs.statSync(DB_PATH);
    if (stats.size > maxBytes) {
      // FIFO eviction: delete oldest 10%
      const total = getBufferCount();
      const toDelete = Math.max(1, Math.floor(total * 0.1));
      const oldest = db.prepare(`SELECT id FROM readings_buffer ORDER BY id LIMIT ?`).all(toDelete) as { id: number }[];
      if (oldest.length > 0) {
        deleteBatch.run(oldest[oldest.length - 1].id);
        console.log(`[buffer] Evicted ${oldest.length} oldest readings (FIFO)`);
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

async function fetchMeterMappings(): Promise<void> {
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
    let buffered = 0;

    for (const state of states) {
      if (!matchesEntityFilter(state.entity_id)) continue;

      const value = parseFloat(state.state);
      if (!isFinite(value)) continue;

      // Match entity_id to sensor_uuid in meter mappings
      const mapping = meterMappings.find((m) => m.sensor_uuid === state.entity_id);
      if (!mapping) continue;

      insertReading.run(
        mapping.id,
        mapping.tenant_id,
        value,
        mapping.energy_type,
        state.last_updated || new Date().toISOString()
      );
      buffered++;
    }

    if (buffered > 0) {
      console.log(`[ha-poll] Buffered ${buffered} readings`);
    }
    enforceBufferLimit();
  } catch (err) {
    console.error("[ha-poll] Error:", err);
  }
}

/* ── Flush Buffer to Cloud ───────────────────────────────────────────────────── */

const FLUSH_BATCH_SIZE = 200;

async function flushBuffer(): Promise<void> {
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
let pendingCommand: string | null = null;

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
  try {
    const res = await fetch(`${INGEST_URL}?action=heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.gateway_api_key}`,
      },
      body: JSON.stringify({
        device_name: config.device_name,
        device_type: "ha-addon",
        tenant_id: config.tenant_id,
        local_ip: getLocalIP(),
        ha_version: haVersion,
        addon_version: "1.0.0",
        offline_buffer_count: getBufferCount(),
        config: {
          poll_interval_seconds: config.poll_interval_seconds,
          entity_filter: config.entity_filter,
          meter_count: meterMappings.length,
        },
      }),
    });

    if (res.ok) {
      const data = await res.json() as { latest_available_version?: string };
      // Check for pending commands from the cloud
      if (data.latest_available_version && data.latest_available_version !== "1.0.0") {
        console.log(`[heartbeat] Update available: ${data.latest_available_version}`);
      }
    }
  } catch (err) {
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
          ha_version: haVersion,
          addon_version: "1.0.0",
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

/* ── Health HTTP Server ──────────────────────────────────────────────────────── */

function startHealthServer(): void {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://localhost:8099`);

    if (url.pathname === "/api/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "running",
        addon_version: "1.0.0",
        ha_version: haVersion,
        buffer_count: getBufferCount(),
        meter_mappings: meterMappings.length,
        uptime_seconds: Math.floor(process.uptime()),
      }));
      return;
    }

    if (url.pathname === "/api/config") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ...config,
        gateway_api_key: "[redacted]",
      }));
      return;
    }

    if (url.pathname === "/api/version") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ version: "1.0.0" }));
      return;
    }

    if (url.pathname === "/api/backup" && req.method === "POST") {
      sendBackup().then(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      }).catch(() => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Backup failed" }));
      });
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  server.listen(8099, () => {
    console.log("[health] Status API listening on port 8099");
  });
}

/* ── Main ────────────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  EMS Gateway Hub v1.0.0 – Home Assistant Add-on");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Device:    ${config.device_name}`);
  console.log(`  Tenant:    ${config.tenant_id}`);
  console.log(`  Poll:      ${config.poll_interval_seconds}s`);
  console.log(`  Flush:     ${config.flush_interval_seconds}s`);
  console.log(`  Heartbeat: ${config.heartbeat_interval_seconds}s`);
  console.log("═══════════════════════════════════════════════════════");

  compileEntityFilter();
  startHealthServer();

  // Initial setup
  await fetchHAVersion();
  await fetchMeterMappings();
  await sendHeartbeat();

  // Polling loop
  setInterval(() => pollHAStates(), config.poll_interval_seconds * 1000);

  // Flush loop
  setInterval(() => flushBuffer(), config.flush_interval_seconds * 1000);

  // Heartbeat loop
  setInterval(async () => {
    await fetchHAVersion();
    await sendHeartbeat();
  }, config.heartbeat_interval_seconds * 1000);

  // Refresh meter mappings every 5 minutes
  setInterval(() => fetchMeterMappings(), 5 * 60 * 1000);

  // Auto backup
  if (config.auto_backup_hours > 0) {
    setInterval(() => sendBackup(), config.auto_backup_hours * 60 * 60 * 1000);
  }

  console.log("[main] All loops started. Waiting for data...");
}

main().catch((err) => {
  console.error("[main] Fatal error:", err);
  process.exit(1);
});
