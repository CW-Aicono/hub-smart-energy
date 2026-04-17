/**
 * AICONO MQTT Cloud Bridge
 * ========================
 * Subscribes to all tenant topics on the AICONO Mosquitto broker, parses
 * payloads (json | tasmota | esphome | homie | raw_value) and forwards each
 * meter reading to the `gateway-ingest` Edge Function.
 *
 * Stateless design — config is loaded from environment + Supabase REST.
 */

import mqtt, { MqttClient } from "mqtt";
import pino from "pino";
import http from "node:http";

const log = pino({ level: process.env.LOG_LEVEL ?? "info" });

const {
  MQTT_BROKER_URL = "mqtts://localhost:8883",
  MQTT_ADMIN_USER = "bridge",
  MQTT_ADMIN_PASSWORD = "",
  GATEWAY_INGEST_URL = "",
  GATEWAY_API_KEY = "",
  HEALTH_PORT = "8080",
  RECONNECT_DELAY_MS = "5000",
  TOPIC_FILTER = "aicono/#",
} = process.env;

if (!GATEWAY_INGEST_URL || !GATEWAY_API_KEY) {
  log.fatal("GATEWAY_INGEST_URL and GATEWAY_API_KEY are required");
  process.exit(1);
}

// ── Tenant routing table ────────────────────────────────────────────────────
// Topic prefix `aicono/<tenant-slug>/...` → { tenant_id, device_mapping }
interface TenantRoute {
  tenantId: string;
  payloadFormat: "json" | "tasmota" | "esphome" | "homie" | "raw_value";
  deviceMapping: Map<string, string>; // topic-pattern → meter_id
}
const routes = new Map<string, TenantRoute>(); // key = tenant slug

// In production this should be hydrated from the `mqtt_credentials` table
// joined with `location_integrations.config` for `mqtt_generic` integrations.
// For brevity we read JSON from env: ROUTES_JSON='{"tenant-slug":{...}}'
try {
  const raw = process.env.ROUTES_JSON ?? "{}";
  const parsed = JSON.parse(raw) as Record<
    string,
    { tenant_id: string; payload_format: string; device_mapping?: Record<string, string> }
  >;
  for (const [slug, cfg] of Object.entries(parsed)) {
    routes.set(slug, {
      tenantId: cfg.tenant_id,
      payloadFormat: (cfg.payload_format as TenantRoute["payloadFormat"]) ?? "json",
      deviceMapping: new Map(Object.entries(cfg.device_mapping ?? {})),
    });
  }
  log.info({ tenants: routes.size }, "Loaded tenant routes");
} catch (err) {
  log.error({ err }, "Failed to parse ROUTES_JSON");
}

// ── Payload parsers ─────────────────────────────────────────────────────────
interface Reading {
  meterId: string;
  powerW?: number;
  energyKwh?: number;
  rawValue?: number;
  unit?: string;
  recordedAt: string;
}

function parsePayload(
  topic: string,
  payload: Buffer,
  route: TenantRoute,
): Reading[] {
  const text = payload.toString("utf8");
  const meterId = lookupMeterId(topic, route.deviceMapping);
  if (!meterId) {
    log.debug({ topic }, "No meter mapping — skipping");
    return [];
  }
  const recordedAt = new Date().toISOString();

  switch (route.payloadFormat) {
    case "json": {
      try {
        const obj = JSON.parse(text);
        return [{
          meterId,
          powerW: typeof obj.power === "number" ? obj.power : undefined,
          energyKwh: typeof obj.energy === "number" ? obj.energy : undefined,
          rawValue: typeof obj.value === "number" ? obj.value : undefined,
          unit: typeof obj.unit === "string" ? obj.unit : undefined,
          recordedAt,
        }];
      } catch {
        return [];
      }
    }
    case "tasmota": {
      // Tasmota SENSOR topic: {"ENERGY":{"Power":123.4,"Total":12.345}}
      try {
        const obj = JSON.parse(text);
        const e = obj.ENERGY ?? obj.energy;
        if (!e) return [];
        return [{
          meterId,
          powerW: typeof e.Power === "number" ? e.Power : undefined,
          energyKwh: typeof e.Total === "number" ? e.Total : undefined,
          recordedAt,
        }];
      } catch {
        return [];
      }
    }
    case "esphome": {
      // ESPHome state topic: simple numeric string
      const v = parseFloat(text);
      return Number.isFinite(v) ? [{ meterId, rawValue: v, recordedAt }] : [];
    }
    case "homie": {
      // Homie convention: $unit attribute would arrive on a sibling topic.
      const v = parseFloat(text);
      return Number.isFinite(v) ? [{ meterId, rawValue: v, recordedAt }] : [];
    }
    case "raw_value": {
      const v = parseFloat(text);
      return Number.isFinite(v) ? [{ meterId, rawValue: v, recordedAt }] : [];
    }
    default:
      return [];
  }
}

function lookupMeterId(topic: string, mapping: Map<string, string>): string | null {
  // 1) exact match
  if (mapping.has(topic)) return mapping.get(topic)!;
  // 2) wildcard match (suffix `#`)
  for (const [pattern, meterId] of mapping) {
    if (pattern.endsWith("#") && topic.startsWith(pattern.slice(0, -1))) {
      return meterId;
    }
  }
  return null;
}

// ── Forwarding to gateway-ingest ────────────────────────────────────────────
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
    if (!res.ok) {
      log.warn({ status: res.status, tenantId }, "gateway-ingest rejected");
    }
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
});

client.on("error", (err) => log.error({ err }, "MQTT error"));
client.on("reconnect", () => log.info("MQTT reconnecting"));

client.on("message", (topic, payload) => {
  // topic format: aicono/<tenant-slug>/...
  const parts = topic.split("/");
  if (parts[0] !== "aicono" || parts.length < 3) return;
  const slug = parts[1];
  const route = routes.get(slug);
  if (!route) {
    log.debug({ slug }, "Unknown tenant slug");
    return;
  }
  const readings = parsePayload(topic, payload, route);
  if (readings.length > 0) void forward(route.tenantId, readings);
});

// ── Health endpoint ─────────────────────────────────────────────────────────
http.createServer((req, res) => {
  if (req.url === "/health") {
    const ok = client.connected;
    res.writeHead(ok ? 200 : 503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: ok ? "ok" : "disconnected", tenants: routes.size }));
    return;
  }
  res.writeHead(404).end();
}).listen(parseInt(HEALTH_PORT, 10), () => {
  log.info({ port: HEALTH_PORT }, "Health endpoint listening");
});
