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

// ── Forward readings to gateway-ingest ──────────────────────────────────────
async function forward(tenantId: string, readings: Reading[]): Promise<void> {
  if (readings.length === 0) return;
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
    if (!res.ok) log.warn({ status: res.status, tenantId }, "gateway-ingest rejected");
  } catch (err) {
    log.error({ err, tenantId }, "Failed to POST to gateway-ingest");
  }
}

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
  if (readings.length > 0) void forward(route.tenantId, readings);
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
