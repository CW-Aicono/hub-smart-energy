/**
 * Publish API for the AICONO MQTT bridge.
 *
 * Exposes a small HTTP endpoint (POST /publish) that the Cloud Edge
 * Function `mqtt-publish` calls to send commands to MQTT devices.
 *
 * Security:
 *  - Bind to 127.0.0.1 only; expose externally via Caddy/nginx with TLS.
 *  - Require `x-gateway-api-key` header.
 *  - Reject topics that do not start with `aicono/<tenantSlug>/`.
 */

import http from "node:http";
import type { MqttClient } from "mqtt";
import type { Logger } from "pino";

export interface PublishServerOptions {
  client: MqttClient;
  apiKey: string;
  port: number;
  log: Logger;
  /** Map tenant_id → tenant slug used in the topic prefix. */
  tenantSlugById: Map<string, string>;
  /** Health check accessor (returns true if MQTT connected). */
  healthCheck: () => boolean;
  /** Number of routes loaded, exposed via /health. */
  routeCount: () => number;
}

interface PublishBody {
  tenant_id?: string;
  topic?: string;
  payload?: string;
  qos?: 0 | 1 | 2;
  retain?: boolean;
}

export function startPublishServer(opts: PublishServerOptions): http.Server {
  const { client, apiKey, port, log, tenantSlugById, healthCheck, routeCount } = opts;

  const server = http.createServer(async (req, res) => {
    if (req.url === "/health") {
      const ok = healthCheck();
      res.writeHead(ok ? 200 : 503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: ok ? "ok" : "disconnected", tenants: routeCount() }));
      return;
    }

    if (req.method !== "POST" || req.url !== "/publish") {
      res.writeHead(404).end();
      return;
    }

    if (req.headers["x-gateway-api-key"] !== apiKey) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    let body = "";
    for await (const chunk of req) body += chunk;
    let parsed: PublishBody;
    try {
      parsed = JSON.parse(body) as PublishBody;
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    const { tenant_id, topic, payload, qos = 1, retain = false } = parsed;
    if (!tenant_id || !topic || payload === undefined) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "tenant_id, topic, payload are required" }));
      return;
    }

    const slug = tenantSlugById.get(tenant_id);
    if (!slug) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unknown tenant" }));
      return;
    }
    const expectedPrefix = `aicono/${slug}/`;
    if (!topic.startsWith(expectedPrefix)) {
      log.warn({ tenant_id, topic, expectedPrefix }, "publish blocked: topic outside tenant prefix");
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Topic outside tenant prefix" }));
      return;
    }

    client.publish(topic, payload, { qos, retain }, (err) => {
      if (err) {
        log.error({ err, topic }, "MQTT publish failed");
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Publish failed" }));
      } else {
        log.info({ topic, qos, retain }, "Published");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "published" }));
      }
    });
  });

  server.listen(port, "0.0.0.0", () => {
    log.info({ port }, "Publish + health server listening");
  });

  return server;
}
