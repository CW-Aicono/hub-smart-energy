/**
 * mqtt-discovery Edge Function
 * =============================
 * Receives Home-Assistant-Discovery messages from the AICONO MQTT bridge.
 * Upserts auto-discovered sensors as `meters` (discovery_confirmed=false)
 * or schaltbare Geräte as `mqtt_actuators` (discovery_confirmed=false).
 *
 * Auth: shared secret `x-gateway-api-key` (bridge ↔ Supabase).
 *
 * Request body (from bridge):
 * {
 *   tenant_id: string,
 *   component: "sensor" | "binary_sensor" | "switch" | "light" | …,
 *   node_id: string,
 *   object_id: string,
 *   config?: { name, state_topic, command_topic?, unit_of_measurement?,
 *              device_class?, unique_id?, device?: { identifiers, … } },
 *   removed: boolean,
 *   raw_topic: string
 * }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GATEWAY_API_KEY = Deno.env.get("GATEWAY_API_KEY") ?? "";

interface DiscoveryBody {
  tenant_id: string;
  component: string;
  node_id: string;
  object_id: string;
  config?: Record<string, unknown>;
  removed: boolean;
  raw_topic: string;
}

const SENSOR_COMPONENTS = new Set(["sensor", "binary_sensor"]);
const ACTUATOR_COMPONENTS = new Set(["switch", "light", "button", "cover", "fan"]);

function uniqueId(body: DiscoveryBody): string {
  const c = body.config;
  if (c && typeof c.unique_id === "string") return c.unique_id;
  return `${body.node_id}.${body.object_id}`;
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

  if (req.headers.get("x-gateway-api-key") !== GATEWAY_API_KEY) {
    return jsonResponse({ error: "Unauthorized" }, 401, cors);
  }

  const body = (await req.json().catch(() => null)) as DiscoveryBody | null;
  if (!body || !body.tenant_id || !body.component) {
    return jsonResponse({ error: "Invalid body" }, 400, cors);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const uid = uniqueId(body);

  // Find the location_integration for this tenant's mqtt_generic gateway.
  // We pick the most recently active mqtt_generic integration.
  const { data: locInts } = await admin
    .from("location_integrations")
    .select("id, location_id, integration:integrations(type, tenant_id)")
    .order("created_at", { ascending: false })
    .limit(50);
  const locInt = (locInts ?? []).find(
    (li: { integration?: { type?: string; tenant_id?: string } | null }) =>
      li.integration?.type === "mqtt_generic" && li.integration?.tenant_id === body.tenant_id,
  ) as { id: string; location_id: string } | undefined;

  if (!locInt) {
    return jsonResponse({ error: "No mqtt_generic integration for tenant" }, 404, cors);
  }

  // ── Removal (empty payload per HA spec) ───────────────────────────────────
  if (body.removed) {
    if (SENSOR_COMPONENTS.has(body.component)) {
      await admin.from("meters").delete()
        .eq("tenant_id", body.tenant_id)
        .eq("sensor_uuid", uid)
        .eq("discovery_source", "mqtt_homeassistant");
    } else if (ACTUATOR_COMPONENTS.has(body.component)) {
      await admin.from("mqtt_actuators").delete()
        .eq("tenant_id", body.tenant_id)
        .eq("actuator_uuid", uid);
    }
    return jsonResponse({ status: "removed", uid }, 200, cors);
  }

  const cfg = body.config ?? {};
  const name = (cfg.name as string) ?? `${body.node_id}/${body.object_id}`;

  // ── Upsert sensor → meters ────────────────────────────────────────────────
  if (SENSOR_COMPONENTS.has(body.component)) {
    const { error } = await admin.from("meters").upsert({
      tenant_id: body.tenant_id,
      location_id: locInt.location_id,
      location_integration_id: locInt.id,
      sensor_uuid: uid,
      name,
      capture_type: "automatic",
      discovery_source: "mqtt_homeassistant",
      discovery_payload: cfg,
      discovery_confirmed: false,
    }, { onConflict: "tenant_id,sensor_uuid", ignoreDuplicates: false });
    if (error) return jsonResponse({ error: error.message }, 500, cors);
    return jsonResponse({ status: "upserted_sensor", uid }, 200, cors);
  }

  // ── Upsert switch/light/… → mqtt_actuators ────────────────────────────────
  if (ACTUATOR_COMPONENTS.has(body.component)) {
    const commandTopic = (cfg.command_topic ?? cfg.cmd_t) as string | undefined;
    if (!commandTopic) {
      return jsonResponse({ error: "Actuator without command_topic ignored" }, 200, cors);
    }
    const { error } = await admin.from("mqtt_actuators").upsert({
      tenant_id: body.tenant_id,
      location_integration_id: locInt.id,
      actuator_uuid: uid,
      name,
      command_topic: commandTopic,
      state_topic: (cfg.state_topic ?? cfg.stat_t) as string ?? null,
      payload_on: (cfg.payload_on as string) ?? "ON",
      payload_off: (cfg.payload_off as string) ?? "OFF",
      qos: 1,
      retain: false,
      discovery_source: "mqtt_homeassistant",
      discovery_payload: cfg,
      discovery_confirmed: false,
    }, { onConflict: "tenant_id,actuator_uuid", ignoreDuplicates: false });
    if (error) return jsonResponse({ error: error.message }, 500, cors);
    return jsonResponse({ status: "upserted_actuator", uid }, 200, cors);
  }

  return jsonResponse({ status: "ignored_component", component: body.component }, 200, cors);
});
