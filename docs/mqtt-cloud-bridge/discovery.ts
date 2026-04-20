/**
 * Home-Assistant MQTT-Discovery support for the AICONO bridge.
 *
 * Subscribes to `aicono/<tenant>/homeassistant/+/+/+/config` and
 * `aicono/<tenant>/homeassistant/+/+/+/+/config`. Forwards parsed
 * discovery messages to the `mqtt-discovery` Edge Function which
 * upserts unconfirmed meters/actuators in the database.
 *
 * Per HA spec, an empty payload on a discovery topic deletes the device.
 */

import type { Logger } from "pino";

export interface DiscoveryConfig {
  edgeUrl: string;       // …/functions/v1/mqtt-discovery
  apiKey: string;        // GATEWAY_API_KEY
}

export interface DiscoveryMessage {
  tenant_id: string;
  component: string;     // sensor | binary_sensor | switch | light | …
  node_id: string;
  object_id: string;
  config?: Record<string, unknown>;
  removed: boolean;      // empty payload = delete
  raw_topic: string;
}

const DISCOVERY_RE =
  /^aicono\/([^/]+)\/homeassistant\/([^/]+)\/([^/]+)(?:\/([^/]+))?\/([^/]+)\/config$/;
//        tenantSlug    component       node_id       object_id?    object_id

/** Parse `aicono/<slug>/homeassistant/<component>/<node>/[<object>]/config` */
export function parseDiscoveryTopic(topic: string): {
  tenantSlug: string;
  component: string;
  nodeId: string;
  objectId: string;
} | null {
  const m = DISCOVERY_RE.exec(topic);
  if (!m) return null;
  // When 4th group exists it's the node_id, 5th is object_id; otherwise 3rd is node_id and 5th is object_id.
  const tenantSlug = m[1];
  const component = m[2];
  const nodeId = m[4] ? m[3] : m[3];
  const objectId = m[5];
  return { tenantSlug, component, nodeId, objectId };
}

export async function forwardDiscovery(
  cfg: DiscoveryConfig,
  msg: DiscoveryMessage,
  log: Logger,
): Promise<void> {
  try {
    const res = await fetch(cfg.edgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-gateway-api-key": cfg.apiKey,
      },
      body: JSON.stringify(msg),
    });
    if (!res.ok) {
      log.warn(
        { status: res.status, topic: msg.raw_topic },
        "mqtt-discovery rejected",
      );
    }
  } catch (err) {
    log.error({ err, topic: msg.raw_topic }, "Failed to POST mqtt-discovery");
  }
}

/**
 * Build an in-memory mapping cache from a discovery message.
 * Returns the state_topic and the meter UUID assigned by the Edge Function
 * (only after the Edge Function has confirmed creation).
 */
export interface CachedMapping {
  topic: string;
  meterId: string;
}

export function extractStateTopic(
  config: Record<string, unknown> | undefined,
): string | null {
  if (!config) return null;
  const t = config.state_topic ?? config.stat_t;
  return typeof t === "string" ? t : null;
}
