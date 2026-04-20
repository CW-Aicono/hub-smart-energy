/**
 * mqtt-publish Edge Function
 * ===========================
 * Forwards MQTT publish commands from the AICONO automation engine to the
 * VPS bridge service, which holds the only outbound MQTT connection.
 *
 * The bridge endpoint URL + API key are stored as Supabase secrets:
 *   - MQTT_BRIDGE_PUBLISH_URL  (e.g. https://mqtt.aicono.org/publish)
 *   - GATEWAY_API_KEY          (shared secret with the bridge)
 *
 * Two call modes:
 *   1) From the user UI (manual switch): JWT auth → resolve user tenant
 *   2) From `automation-scheduler`: x-gateway-api-key auth → tenant_id in body
 *
 * Topic-prefix is validated TWICE (here and on the bridge) to guarantee
 * cross-tenant isolation.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const BRIDGE_URL = Deno.env.get("MQTT_BRIDGE_PUBLISH_URL") ?? "";
const GATEWAY_API_KEY = Deno.env.get("GATEWAY_API_KEY") ?? "";

interface PublishRequest {
  locationIntegrationId?: string;
  actuatorUuid?: string;       // mqtt_actuators.actuator_uuid
  commandValue?: string;       // "on" | "off" | "toggle" | raw payload
  // Direct-publish mode (used by automation engine):
  tenant_id?: string;
  topic?: string;
  payload?: string;
  qos?: 0 | 1 | 2;
  retain?: boolean;
}

function tenantSlug(tenantId: string): string {
  return `t-${tenantId.slice(0, 8)}`;
}

function jsonResponse(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return jsonResponse({ error: "Method Not Allowed" }, 405, cors);

  if (!BRIDGE_URL || !GATEWAY_API_KEY) {
    return jsonResponse({ error: "Bridge not configured" }, 500, cors);
  }

  const body = (await req.json().catch(() => null)) as PublishRequest | null;
  if (!body) return jsonResponse({ error: "Invalid JSON" }, 400, cors);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // ── Resolve tenant_id (two auth paths) ────────────────────────────────────
  let tenantId: string | undefined;

  const gwKey = req.headers.get("x-gateway-api-key");
  if (gwKey && gwKey === GATEWAY_API_KEY && body.tenant_id) {
    // Server-to-server (automation-scheduler / HA add-on)
    tenantId = body.tenant_id;
  } else {
    // User-initiated via Supabase JWT
    const auth = req.headers.get("Authorization");
    if (!auth) return jsonResponse({ error: "Unauthorized" }, 401, cors);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return jsonResponse({ error: "Unauthenticated" }, 401, cors);

    const { data: profile } = await admin
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", user.id)
      .maybeSingle();
    tenantId = profile?.tenant_id ?? undefined;
    if (!tenantId) return jsonResponse({ error: "No tenant" }, 403, cors);
  }

  // ── Resolve topic + payload ───────────────────────────────────────────────
  let topic = body.topic;
  let payload = body.payload;
  let qos = body.qos ?? 1;
  let retain = body.retain ?? false;

  if (!topic && body.actuatorUuid) {
    const { data: act, error } = await admin
      .from("mqtt_actuators")
      .select("command_topic, payload_on, payload_off, payload_template, qos, retain")
      .eq("tenant_id", tenantId)
      .eq("actuator_uuid", body.actuatorUuid)
      .maybeSingle();
    if (error || !act) {
      return jsonResponse({ error: "Actuator not found" }, 404, cors);
    }
    topic = act.command_topic as string;
    qos = (act.qos as 0 | 1 | 2) ?? 1;
    retain = (act.retain as boolean) ?? false;

    const cmd = (body.commandValue ?? "toggle").toLowerCase();
    if (cmd === "on" || cmd === "open" || cmd === "pulse") {
      payload = act.payload_on as string;
    } else if (cmd === "off" || cmd === "close") {
      payload = act.payload_off as string;
    } else if (act.payload_template) {
      payload = (act.payload_template as string).replace("{{value}}", body.commandValue ?? "");
    } else {
      payload = body.commandValue ?? (act.payload_on as string);
    }
  }

  if (!topic || payload === undefined) {
    return jsonResponse({ error: "topic and payload (or actuatorUuid) required" }, 400, cors);
  }

  // ── Topic-prefix isolation check ──────────────────────────────────────────
  const expectedPrefix = `aicono/${tenantSlug(tenantId)}/`;
  if (!topic.startsWith(expectedPrefix)) {
    return jsonResponse(
      { error: `Topic must start with ${expectedPrefix}` },
      403,
      cors,
    );
  }

  // ── Forward to bridge ─────────────────────────────────────────────────────
  try {
    const res = await fetch(BRIDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-gateway-api-key": GATEWAY_API_KEY,
      },
      body: JSON.stringify({ tenant_id: tenantId, topic, payload, qos, retain }),
    });
    const text = await res.text();
    if (!res.ok) {
      return jsonResponse({ error: "Bridge rejected", status: res.status, detail: text }, 502, cors);
    }
    return jsonResponse({ status: "published", topic }, 200, cors);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 502, cors);
  }
});
