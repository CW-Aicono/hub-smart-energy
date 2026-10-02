/**
 * gateway-device-provision
 * ========================
 * Phase 3 (Remote-Setup): Provisioniert eine Sensor-/Aktor-/Zähler-Integration
 * remote auf einem AICONO Gateway. Persistiert die Konfiguration in
 * `gateway_device_entities` und stößt die Provisionierung über
 * `gateway_commands` an (HA Supervisor API für Shelly/MQTT, AICONO-eigener
 * Modbus-Worker für Modbus TCP).
 *
 * Endpoints (POST mit body.action):
 *   { action: "create",  device_id, integration_type, entity_kind, entity_label,
 *     config_json, ha_entity_id?, meter_id?, sensor_uuid?, actuator_uuid?,
 *     discovery_method?, discovery_id? }
 *   { action: "update",  entity_id, patch }
 *   { action: "delete",  entity_id }
 *   { action: "retry",   entity_id }    – stößt Provisioning erneut an
 *   { action: "list",    device_id }
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function svc(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

const INTEGRATION_TYPES = new Set([
  "shelly",
  "mqtt",
  "modbus_tcp",
  "ha_native",
  "tasmota",
  "esphome",
  "manual",
]);
const ENTITY_KINDS = new Set(["meter", "sensor", "actuator"]);

async function resolveUser(token: string) {
  const sb = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data } = await sb.auth.getUser();
  if (!data?.user) return null;
  const sbSvc = svc();
  const [{ data: profile }, { data: superRow }] = await Promise.all([
    sbSvc.from("profiles").select("tenant_id").eq("user_id", data.user.id).maybeSingle(),
    sbSvc.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "super_admin").maybeSingle(),
  ]);
  return {
    userId: data.user.id,
    tenantId: (profile as any)?.tenant_id ?? null,
    isSuperAdmin: Boolean(superRow),
  };
}

async function getDevice(deviceId: string) {
  const { data } = await svc()
    .from("gateway_devices").select("id, tenant_id").eq("id", deviceId).maybeSingle();
  return data;
}

async function getEntity(entityId: string) {
  const { data } = await svc()
    .from("gateway_device_entities").select("*").eq("id", entityId).maybeSingle();
  return data as any;
}

function tenantOk(tenantId: string | null, ctx: { tenantId: string | null; isSuperAdmin: boolean }) {
  return ctx.isSuperAdmin || (tenantId && tenantId === ctx.tenantId);
}

async function enqueueProvisionCommand(entity: any) {
  const sb = svc();
  await sb.from("gateway_commands").insert({
    gateway_device_id: entity.gateway_device_id,
    tenant_id: entity.tenant_id,
    command_type: "provision_entity",
    payload: {
      entity_id: entity.id,
      integration_type: entity.integration_type,
      entity_kind: entity.entity_kind,
      ha_entity_id: entity.ha_entity_id,
      config: entity.config_json,
      version: entity.version,
    },
    status: "pending",
  });
  await sb.from("gateway_device_entities")
    .update({ provision_status: "provisioning", last_error: null })
    .eq("id", entity.id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json({ error: "Unauthorized" }, 401);

  const ctx = await resolveUser(token);
  if (!ctx) return json({ error: "Unauthorized" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const action = String(body?.action || "");
  const sb = svc();

  if (action === "create") {
    const deviceId = String(body?.device_id || "");
    const integrationType = String(body?.integration_type || "");
    const entityKind = String(body?.entity_kind || "sensor");
    const entityLabel = String(body?.entity_label || "").trim();
    if (!deviceId || !INTEGRATION_TYPES.has(integrationType) || !ENTITY_KINDS.has(entityKind) || !entityLabel) {
      return json({ error: "Invalid input" }, 400);
    }
    const device = await getDevice(deviceId);
    if (!device || !tenantOk(device.tenant_id, ctx)) return json({ error: "Forbidden" }, 403);

    const insertRow: Record<string, unknown> = {
      gateway_device_id: deviceId,
      tenant_id: device.tenant_id,
      integration_type: integrationType,
      entity_kind: entityKind,
      entity_label: entityLabel,
      config_json: body?.config_json && typeof body.config_json === "object" ? body.config_json : {},
      ha_entity_id: body?.ha_entity_id || null,
      meter_id: body?.meter_id || null,
      sensor_uuid: body?.sensor_uuid || null,
      actuator_uuid: body?.actuator_uuid || null,
      discovery_method: body?.discovery_method || "manual",
      provision_status: "pending",
      created_by: ctx.userId,
    };
    const { data: row, error } = await sb
      .from("gateway_device_entities")
      .insert(insertRow)
      .select("*")
      .maybeSingle();
    if (error || !row) {
      console.error("[gateway-device-provision] insert error", error?.message);
      return json({ error: "Database error" }, 500);
    }

    if (body?.discovery_id) {
      await sb.from("gateway_device_discoveries")
        .update({ is_provisioned: true })
        .eq("id", body.discovery_id);
    }

    await enqueueProvisionCommand(row);
    return json({ success: true, entity: row });
  }

  if (action === "update") {
    const entityId = String(body?.entity_id || "");
    if (!entityId) return json({ error: "entity_id required" }, 400);
    const existing = await getEntity(entityId);
    if (!existing || !tenantOk(existing.tenant_id, ctx)) return json({ error: "Forbidden" }, 403);

    const patch: Record<string, unknown> = {};
    const allowed = ["entity_label", "config_json", "ha_entity_id", "meter_id", "sensor_uuid", "actuator_uuid"];
    for (const k of allowed) {
      if (body?.patch && k in body.patch) patch[k] = body.patch[k];
    }
    const { data: row, error } = await sb
      .from("gateway_device_entities")
      .update(patch).eq("id", entityId).select("*").maybeSingle();
    if (error || !row) return json({ error: "Database error" }, 500);
    await enqueueProvisionCommand(row);
    return json({ success: true, entity: row });
  }

  if (action === "retry") {
    const entityId = String(body?.entity_id || "");
    const existing = await getEntity(entityId);
    if (!existing || !tenantOk(existing.tenant_id, ctx)) return json({ error: "Forbidden" }, 403);
    await enqueueProvisionCommand(existing);
    return json({ success: true });
  }

  if (action === "delete") {
    const entityId = String(body?.entity_id || "");
    const existing = await getEntity(entityId);
    if (!existing || !tenantOk(existing.tenant_id, ctx)) return json({ error: "Forbidden" }, 403);

    await sb.from("gateway_commands").insert({
      gateway_device_id: existing.gateway_device_id,
      tenant_id: existing.tenant_id,
      command_type: "deprovision_entity",
      payload: {
        entity_id: existing.id,
        integration_type: existing.integration_type,
        ha_entity_id: existing.ha_entity_id,
      },
      status: "pending",
    });
    const { error } = await sb.from("gateway_device_entities").delete().eq("id", entityId);
    if (error) return json({ error: "Database error" }, 500);
    return json({ success: true });
  }

  if (action === "list") {
    const deviceId = String(body?.device_id || "");
    const device = await getDevice(deviceId);
    if (!device || !tenantOk(device.tenant_id, ctx)) return json({ error: "Forbidden" }, 403);
    const { data, error } = await sb
      .from("gateway_device_entities")
      .select("*")
      .eq("gateway_device_id", deviceId)
      .order("created_at", { ascending: false });
    if (error) return json({ error: "Database error" }, 500);
    return json({ success: true, entities: data ?? [] });
  }

  return json({ error: "Unknown action" }, 400);
});
