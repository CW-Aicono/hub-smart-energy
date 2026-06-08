/**
 * AICONO MQTT Cloud Bridge (Phase 2)
 * ===================================
 * - Subscribes to all tenant topics on the AICONO Mosquitto broker
 * - Parses payloads via ./parsers and forwards to `gateway-ingest`
 * - Subscribes to HA-Discovery topics and forwards to `mqtt-discovery`
 * - Exposes POST /publish so the `mqtt-publish` Edge Function can send commands
 *
 * Stateless — config from env + (later) Supabase REST.
 */

import mqtt, { MqttClient } from "mqtt";
import pino from "pino";
import { parsePayload, type PayloadFormat, type Reading } from "./parsers.js";
import {
  parseDiscoveryTopic,
  forwardDiscovery,
  extractStateTopic,
} from "./discovery.js";
import { startPublishServer } from "./publish.js";

const log = pino({ level: process.env.LOG_LEVEL ?? "info" });

const {
  MQTT_BROKER_URL = "mqtts://localhost:8883",
  MQTT_ADMIN_USER = "bridge",
  MQTT_ADMIN_PASSWORD = "",
  GATEWAY_INGEST_URL = "",
  MQTT_DISCOVERY_URL = "",
  GATEWAY_API_KEY = "",
  HEALTH_PORT = "8080",
  RECONNECT_DELAY_MS = "5000",
  TOPIC_FILTER = "aicono/#",
  ENABLE_DISCOVERY = "true",
  // Coalescing window: alle MQTT-Readings pro Tenant innerhalb dieses Fensters
  // werden zu EINEM gateway-ingest-POST gebündelt → drastisch weniger
  // DB-Transaktionen / WAL-Schreiblast in der Cloud.
  COALESCE_INTERVAL_MS = "30000",
  COALESCE_MAX_BATCH = "1000",
} = process.env;

if (!GATEWAY_INGEST_URL || !GATEWAY_API_KEY) {
  log.fatal("GATEWAY_INGEST_URL and GATEWAY_API_KEY are required");
  process.exit(1);
}

// ── Tenant routing ──────────────────────────────────────────────────────────
interface TenantRoute {
  tenantId: string;
  payloadFormat: PayloadFormat;
  deviceMapping: Map<string, string>; // topic-pattern → meter_id
}
const routes = new Map<string, TenantRoute>();        // slug → route
const tenantSlugById = new Map<string, string>();     // tenantId → slug (for /publish)

try {
  const raw = process.env.ROUTES_JSON ?? "{}";
  const parsed = JSON.parse(raw) as Record<
    string,
    { tenant_id: string; payload_format: string; device_mapping?: Record<string, string> }
  >;
  for (const [slug, cfg] of Object.entries(parsed)) {
    routes.set(slug, {
      tenantId: cfg.tenant_id,
      payloadFormat: (cfg.payload_format as PayloadFormat) ?? "json",
      deviceMapping: new Map(Object.entries(cfg.device_mapping ?? {})),
    });
    tenantSlugById.set(cfg.tenant_id, slug);
  }
  log.info({ tenants: routes.size }, "Loaded tenant routes");
} catch (err) {
  log.error({ err }, "Failed to parse ROUTES_JSON");
}

// ── Forward readings to gateway-ingest (mit Coalescing-Buffer) ─────────────
// Jeder MQTT-Frame wird zunächst in einen In-Memory-Puffer geschrieben.
// Ein Timer flusht die Puffer alle COALESCE_INTERVAL_MS pro Tenant gebündelt
// an die Cloud. Falls der Puffer COALESCE_MAX_BATCH überschreitet, wird
// sofort geflusht. Bei Prozess-Shutdown wird ebenfalls geflusht.
const coalesceIntervalMs = Math.max(1000, parseInt(COALESCE_INTERVAL_MS, 10) || 30000);
const coalesceMaxBatch = Math.max(1, parseInt(COALESCE_MAX_BATCH, 10) || 1000);
const readingBuffers = new Map<string, Reading[]>(); // tenantId → readings

async function flushTenant(tenantId: string): Promise<void> {
  const buf = readingBuffers.get(tenantId);
  if (!buf || buf.length === 0) return;
  const readings = buf.splice(0, buf.length); // drain
  const body = {
    source: "mqtt-cloud-bridge",
    tenant_id: tenantId,
    readings: readings.map((r) => ({
      meter_id: r.meterId,
      recorded_at: r.recordedAt,
      power_w: r.powerW,
      energy_kwh: r.energyKwh,
      value: r.rawValue,
      unit: r.unit,
    })),
  };
  try {
    const res = await fetch(GATEWAY_INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-gateway-api-key": GATEWAY_API_KEY,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      log.warn({ status: res.status, tenantId, count: readings.length }, "gateway-ingest rejected — readings dropped");
    } else {
      log.debug({ tenantId, count: readings.length }, "Flushed readings batch");
    }
  } catch (err) {
    log.error({ err, tenantId, count: readings.length }, "Failed to POST to gateway-ingest");
  }
}

function enqueue(tenantId: string, readings: Reading[]): void {
  if (readings.length === 0) return;
  const buf = readingBuffers.get(tenantId) ?? [];
  buf.push(...readings);
  readingBuffers.set(tenantId, buf);
  if (buf.length >= coalesceMaxBatch) {
    void flushTenant(tenantId);
  }
}

// Periodischer Flush für alle Tenants
setInterval(() => {
  for (const tenantId of readingBuffers.keys()) {
    void flushTenant(tenantId);
  }
}, coalesceIntervalMs).unref();

// Sauberer Shutdown: nochmal alles wegflushen
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    log.info({ sig }, "Shutdown — flushing buffers");
    await Promise.all([...readingBuffers.keys()].map(flushTenant));
    process.exit(0);
  });
}

log.info({ coalesceIntervalMs, coalesceMaxBatch }, "Coalescing buffer aktiv");

// ── MQTT client ─────────────────────────────────────────────────────────────
const client: MqttClient = mqtt.connect(MQTT_BROKER_URL, {
  username: MQTT_ADMIN_USER,
  password: MQTT_ADMIN_PASSWORD,
  reconnectPeriod: parseInt(RECONNECT_DELAY_MS, 10),
  rejectUnauthorized: true,
});

client.on("connect", () => {
  log.info({ broker: MQTT_BROKER_URL, filter: TOPIC_FILTER }, "Connected to broker");
  client.subscribe(TOPIC_FILTER, { qos: 1 }, (err) => {
    if (err) log.error({ err }, "Subscribe failed");
  });
  if (ENABLE_DISCOVERY === "true" && MQTT_DISCOVERY_URL) {
    const discoFilter = "aicono/+/homeassistant/#";
    client.subscribe(discoFilter, { qos: 1 }, (err) => {
      if (err) log.error({ err }, "Discovery subscribe failed");
      else log.info({ filter: discoFilter }, "Subscribed to HA-Discovery topics");
    });
  }
});

client.on("error", (err) => log.error({ err }, "MQTT error"));
client.on("reconnect", () => log.info("MQTT reconnecting"));

client.on("message", (topic, payload) => {
  // 1) HA-Discovery messages
  if (topic.includes("/homeassistant/") && topic.endsWith("/config")) {
    handleDiscovery(topic, payload);
    return;
  }

  // 2) Regular tenant payload
  const parts = topic.split("/");
  if (parts[0] !== "aicono" || parts.length < 3) return;
  const slug = parts[1];
  const route = routes.get(slug);
  if (!route) {
    log.debug({ slug }, "Unknown tenant slug");
    return;
  }
  const readings = parsePayload(topic, payload, route.payloadFormat, route.deviceMapping);
  if (readings.length > 0) enqueue(route.tenantId, readings);
});

function handleDiscovery(topic: string, payload: Buffer): void {
  if (!MQTT_DISCOVERY_URL) return;
  const parsed = parseDiscoveryTopic(topic);
  if (!parsed) {
    log.debug({ topic }, "Could not parse discovery topic");
    return;
  }
  const route = routes.get(parsed.tenantSlug);
  if (!route) return;

  const text = payload.toString("utf8").trim();
  if (text.length === 0) {
    void forwardDiscovery(
      { edgeUrl: MQTT_DISCOVERY_URL, apiKey: GATEWAY_API_KEY },
      {
        tenant_id: route.tenantId,
        component: parsed.component,
        node_id: parsed.nodeId,
        object_id: parsed.objectId,
        removed: true,
        raw_topic: topic,
      },
      log,
    );
    return;
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(text);
  } catch {
    log.warn({ topic }, "Discovery payload not JSON");
    return;
  }

  // Auto-extend in-memory mapping so following state messages route correctly.
  const stateTopic = extractStateTopic(config);
  if (stateTopic && config.unique_id) {
    const meterId = `discovery:${parsed.tenantSlug}:${config.unique_id}`;
    route.deviceMapping.set(stateTopic, meterId);
  }

  void forwardDiscovery(
    { edgeUrl: MQTT_DISCOVERY_URL, apiKey: GATEWAY_API_KEY },
    {
      tenant_id: route.tenantId,
      component: parsed.component,
      node_id: parsed.nodeId,
      object_id: parsed.objectId,
      config,
      removed: false,
      raw_topic: topic,
    },
    log,
  );
}

// ── HTTP server: /health + /publish ─────────────────────────────────────────
startPublishServer({
  client,
  apiKey: GATEWAY_API_KEY,
  port: parseInt(HEALTH_PORT, 10),
  log,
  tenantSlugById,
  healthCheck: () => client.connected,
  routeCount: () => routes.size,
});
