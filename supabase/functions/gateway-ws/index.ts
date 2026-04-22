/**
 * gateway-ws
 * ==========
 * WebSocket-Endpunkt für AICONO Gateway Worker (Raspberry Pi).
 *
 * Architektur (Push, kein Cloudflare-Tunnel mehr):
 *   1.  Pi öffnet WSS-Verbindung zu /functions/v1/gateway-ws
 *   2.  Pi sendet "auth"-Frame mit { mac, username, password }
 *   3.  Cloud verifiziert mac + bcrypt(password) gegen gateway_devices
 *   4.  Bei Erfolg: Verbindung wird "accepted", gateway_devices.status='online',
 *       ws_connected_since=now(). Pi schickt periodisch "ping"/"heartbeat".
 *   5.  Cloud horcht auf Postgres-Realtime für gateway_commands (status='pending'
 *       und gateway_device_id=<diese Verbindung>) und pusht jeden neuen Befehl
 *       als JSON-Frame. Pi antwortet mit "ack" → status='completed'.
 *
 * Mehrere Pis pro Liegenschaft sind erlaubt (jede MAC = 1 device-row).
 *
 * Nachrichtenformat (immer JSON):
 *   ── Pi → Cloud ─────────────────────────────────────────────────────────
 *   { type: "auth", mac, username, password, addon_version?, ha_version?,
 *     local_ip?, local_time? }
 *   { type: "heartbeat", local_ip?, local_time?, addon_version?, ha_version? }
 *   { type: "ack", command_id, response?, error? }
 *
 *   ── Cloud → Pi ────────────────────────────────────────────────────────
 *   { type: "auth_ok", device_id, tenant_id, location_id }
 *   { type: "auth_error", error }
 *   { type: "command", id, command_type, payload }
 *   { type: "pong" }
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function svc(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

function normalizeMac(input: string): string {
  return (input || "").toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 12);
}

async function bcryptVerify(plain: string, hash: string): Promise<boolean> {
  try {
    // Use bcryptjs via npm: specifier — pure JS, no Web Worker, works in Supabase Edge Runtime.
    // npm: avoids the email-obfuscation issue that mangles esm.sh URLs containing "@".
    const bcrypt: any = await import("npm:bcryptjs@2.4.3");
    const compare = bcrypt.compare ?? bcrypt.default?.compare;
    return await compare(plain, hash);
  } catch (e) {
    console.error("[gateway-ws] bcrypt error", e);
    return false;
  }
}

interface Session {
  socket: WebSocket;
  deviceId: string;
  tenantId: string;
  locationId: string | null;
  locationIntegrationId: string | null;
  channel: ReturnType<SupabaseClient["channel"]> | null;
  closeRequested: boolean;
}

/** Send safely (no throw if socket already closed). */
function safeSend(ws: WebSocket, msg: unknown) {
  try {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  } catch {
    /* ignored */
  }
}

function getExplicitBinaryState(value: unknown): "on" | "off" | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "on") return "on";
  if (normalized === "off") return "off";
  return null;
}

async function mirrorGatewayInventoryState(params: {
  gatewayDeviceId: string;
  entityId: string;
  nextState: "on" | "off";
  locationIntegrationId?: string | null;
}) {
  const nowIso = new Date().toISOString();
  const update: Record<string, unknown> = {
    state: params.nextState,
    last_state_at: nowIso,
    last_seen_at: nowIso,
    updated_at: nowIso,
  };
  if (params.locationIntegrationId) update.location_integration_id = params.locationIntegrationId;

  const { error } = await svc()
    .from("gateway_device_inventory")
    .update(update)
    .eq("gateway_device_id", params.gatewayDeviceId)
    .eq("entity_id", params.entityId);

  if (error) {
    console.warn("[gateway-ws] inventory mirror failed", {
      gatewayDeviceId: params.gatewayDeviceId,
      entityId: params.entityId,
      nextState: params.nextState,
      error: error.message,
    });
  }
}

async function handleHttpAction(req: Request): Promise<Response | null> {
  if (req.method !== "POST") return null;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req, { error: "Invalid JSON body" }, 400);
  }

  if (body?.action === "executeCommand") {
    return await handleExecuteCommand(req, body);
  }

  if (body?.action !== "getSensors") return null;

  const locationIntegrationId = String(body.locationIntegrationId || "").trim();
  if (!locationIntegrationId) {
    return jsonResponse(req, { success: false, error: "locationIntegrationId is required" }, 400);
  }

  console.log("[gateway-ws] getSensors request", { locationIntegrationId });

  const sb = svc();
  const { data: meters, error: meterError } = await sb
    .from("meters")
    .select("id, name, sensor_uuid, unit, energy_type")
    .eq("location_integration_id", locationIntegrationId)
    .eq("is_archived", false)
    .not("sensor_uuid", "is", null)
    .order("name");

  if (meterError) {
    console.error("[gateway-ws] getSensors meter query failed", meterError);
    return jsonResponse(req, { success: false, error: "Database error" }, 500);
  }

  const { data: automations } = await sb
    .from("location_automations")
    .select("actuator_uuid, actuator_name")
    .eq("location_integration_id", locationIntegrationId)
    .not("actuator_uuid", "is", null);

  // Pull live device inventory pushed by the HA add-on (any gateway_device
  // linked to this location_integration).
  const { data: gateways } = await sb
    .from("gateway_devices")
    .select("id")
    .eq("location_integration_id", locationIntegrationId);
  const gatewayIds = (gateways ?? []).map((g: any) => g.id);

  let inventory: any[] = [];
  if (gatewayIds.length > 0) {
    const { data: inv } = await sb
      .from("gateway_device_inventory")
      .select("entity_id, domain, category, friendly_name, state, unit, device_class, last_state_at")
      .in("gateway_device_id", gatewayIds)
      .order("friendly_name");
    inventory = inv || [];
  }

  const mappedSensorIds = new Set((meters ?? []).map((m: any) => m.sensor_uuid));
  const mappedActuatorIds = new Set((automations ?? []).map((a: any) => a.actuator_uuid));

  // Build entity_id -> latest inventory row map (inventory may contain duplicates,
  // pick the row with the most recent last_state_at).
  const latestByEntity = new Map<string, any>();
  for (const inv of inventory) {
    const eid = String(inv.entity_id || "");
    if (!eid) continue;
    const existing = latestByEntity.get(eid);
    if (!existing) {
      latestByEntity.set(eid, inv);
      continue;
    }
    const a = existing.last_state_at ? new Date(existing.last_state_at).getTime() : 0;
    const b = inv.last_state_at ? new Date(inv.last_state_at).getTime() : 0;
    if (b > a) latestByEntity.set(eid, inv);
  }

  /** Try to convert a HA state string to a number; returns null if not numeric. */
  const toNumeric = (s: any): number | null => {
    if (s == null) return null;
    if (typeof s === "number") return isFinite(s) ? s : null;
    const str = String(s).trim();
    if (str === "" || str === "—" || str === "unknown" || str === "unavailable") return null;
    if (str === "on") return 1;
    if (str === "off") return 0;
    const n = parseFloat(str.replace(",", "."));
    return isFinite(n) ? n : null;
  };

  const sensorItems = (meters ?? []).map((meter: any) => {
    const inv = latestByEntity.get(String(meter.sensor_uuid));
    const rawState = inv?.state ?? null;
    const numeric = toNumeric(rawState);
    const unit = inv?.unit || meter.unit || "";
    return {
      id: meter.sensor_uuid,
      name: meter.name,
      type: meter.energy_type === "strom" ? "power" : meter.energy_type,
      controlType: "Meter",
      room: "",
      category: "Zähler",
      value: rawState ?? "—",
      rawValue: numeric,
      unit,
      status: "online",
      stateName: meter.energy_type,
      isMapped: true,
      lastStateAt: inv?.last_state_at ?? null,
    };
  });

  const seenActuators = new Set<string>();
  const actuatorItems = (automations ?? [])
    .filter((row: any) => row.actuator_uuid)
    .filter((row: any) => {
      const key = String(row.actuator_uuid);
      if (seenActuators.has(key)) return false;
      seenActuators.add(key);
      return true;
    })
    .map((row: any) => {
      const inv = latestByEntity.get(String(row.actuator_uuid));
      const rawState = inv?.state ?? null;
      const numeric = toNumeric(rawState);
      return {
        id: row.actuator_uuid,
        name: row.actuator_name || row.actuator_uuid,
        type: "actuator",
        controlType: row.actuator_uuid?.split?.(".")?.[0] || "switch",
        room: "",
        category: "Aktor",
        value: rawState ?? "—",
        rawValue: numeric,
        unit: inv?.unit || "",
        status: "online",
        stateName: "state",
        isMapped: true,
        lastStateAt: inv?.last_state_at ?? null,
      };
    });

  // Append discovered (unmapped) entities from the live inventory so the UI
  // can offer them for assignment to a meter / automation.
  const inventoryItems = inventory
    .filter((d: any) => !mappedSensorIds.has(d.entity_id) && !mappedActuatorIds.has(d.entity_id))
    .map((d: any) => {
      const cat = String(d.category || "sensor");
      const isActuator = cat === "actuator";
      const isMeter = cat === "meter";
      return {
        id: d.entity_id,
        name: d.friendly_name || d.entity_id,
        type: isActuator ? "actuator" : (d.device_class || "sensor"),
        controlType: isActuator ? d.domain : (isMeter ? "Meter" : "Sensor"),
        room: "",
        category: isActuator ? "Aktor" : (isMeter ? "Zähler" : "Sensor"),
        value: d.state ?? "—",
        unit: d.unit || "",
        status: "online",
        stateName: d.device_class || "state",
        isMapped: false,
      };
    });

  console.log("[gateway-ws] getSensors response", {
    locationIntegrationId,
    meters: sensorItems.length,
    actuators: actuatorItems.length,
    inventory: inventoryItems.length,
    gatewayCount: gatewayIds.length,
  });

  return jsonResponse(req, {
    success: true,
    sensors: [...sensorItems, ...actuatorItems, ...inventoryItems],
  });
}

/**
 * HTTP → enqueue actuator command for the connected Pi via gateway_commands.
 * The Pi receives it through the realtime subscription set up in subscribeCommands().
 */
async function handleExecuteCommand(req: Request, body: any): Promise<Response> {
  const locationIntegrationId = String(body.locationIntegrationId || "").trim();
  const entityId = String(body.entity_id || body.controlUuid || "").trim();
  const service = String(body.service || "").trim().toLowerCase();
  const command = String(
    body.command
      || body.commandValue
      || body.action_value
      || body.action_type
      || (service === "turn_on" ? "on" : service === "turn_off" ? "off" : service === "toggle" ? "toggle" : "toggle"),
  ).trim().toLowerCase();

  if (!locationIntegrationId || !entityId) {
    return jsonResponse(req, { success: false, error: "locationIntegrationId and entity_id (or controlUuid) are required" }, 400);
  }

  const sb = svc();

  const { data: devices, error: devErr } = await sb
    .from("gateway_devices")
    .select("id, tenant_id, status")
    .eq("location_integration_id", locationIntegrationId);
  if (devErr || !devices || devices.length === 0) {
    return jsonResponse(req, { success: false, error: "No gateway device found for this integration" }, 404);
  }
  const device = devices.find((d: any) => d.status === "online") || devices[0];

  console.log("[gateway-ws] executeCommand enqueue", { deviceId: device.id, entityId, command });

  const payload: Record<string, unknown> = { entity_id: entityId, command };
  if (body.domain) payload.domain = body.domain;
  if (body.service) payload.service = body.service;

  const { data: cmd, error: insErr } = await sb
    .from("gateway_commands")
    .insert({
      tenant_id: device.tenant_id,
      gateway_device_id: device.id,
      command_type: "execute_actuator",
      payload,
      status: "pending",
    })
    .select("id")
    .single();

  if (insErr || !cmd) {
    console.error("[gateway-ws] executeCommand insert failed", insErr);
    return jsonResponse(req, { success: false, error: insErr?.message || "Failed to enqueue command" }, 500);
  }

  // Poll for ack long enough to cover observed gateway delivery delays.
  // Real requests have been acknowledged just after ~6s, which produced false
  // 504s even though the command ultimately completed successfully.
  const cmdId = cmd.id as string;
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    const { data: row } = await sb
      .from("gateway_commands")
      .select("status, error_message, response")
      .eq("id", cmdId)
      .maybeSingle();
    if (!row) continue;
    if (row.status === "completed") {
      const explicitState = getExplicitBinaryState(command);
      if (explicitState) {
        await mirrorGatewayInventoryState({
          gatewayDeviceId: device.id,
          entityId,
          nextState: explicitState,
          locationIntegrationId,
        });
      }
      return jsonResponse(req, { success: true, response: row.response ?? null });
    }
    if (row.status === "failed") {
      return jsonResponse(req, { success: false, error: row.error_message || "Command failed on gateway" }, 502);
    }
  }
  return jsonResponse(req, { success: false, error: "Gateway did not acknowledge command in time" }, 504);
}

/** Mark device offline + tear down realtime subscription. */
async function tearDown(session: Session) {
  if (session.closeRequested) return;
  session.closeRequested = true;
  try {
    if (session.channel) {
      await svc().removeChannel(session.channel);
    }
  } catch (e) {
    console.warn("[gateway-ws] removeChannel failed", e);
  }
  try {
    await svc()
      .from("gateway_devices")
      .update({
        status: "offline",
        ws_connected_since: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.deviceId);
  } catch (e) {
    console.warn("[gateway-ws] mark offline failed", e);
  }
}

/** Try to send a command to the Pi over WS, mark sent_at. */
async function pushCommand(session: Session, cmd: any) {
  safeSend(session.socket, {
    type: "command",
    id: cmd.id,
    command_type: cmd.command_type,
    payload: cmd.payload ?? {},
  });
  await svc()
    .from("gateway_commands")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", cmd.id)
    .eq("status", "pending"); // don't overwrite ack races
}

/** After auth: subscribe to pending commands and flush already-queued ones. */
async function subscribeCommands(session: Session) {
  const sb = svc();

  // 1. Flush already-pending commands (commands written while Pi was offline)
  const { data: pending } = await sb
    .from("gateway_commands")
    .select("id, command_type, payload")
    .eq("gateway_device_id", session.deviceId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(50);
  for (const cmd of pending ?? []) {
    await pushCommand(session, cmd);
  }

  // 2. Realtime subscription for new INSERTs
  session.channel = sb
    .channel(`gw-cmds-${session.deviceId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "gateway_commands",
        filter: `gateway_device_id=eq.${session.deviceId}`,
      },
      async (payload) => {
        const cmd = payload.new as any;
        if (cmd.status !== "pending") return;
        await pushCommand(session, cmd);
      },
    )
    .subscribe();
}

/** Handle the very first frame: must be `auth`. */
async function handleAuth(
  socket: WebSocket,
  raw: any,
): Promise<Session | null> {
  if (raw?.type !== "auth") {
    safeSend(socket, { type: "auth_error", error: "First frame must be 'auth'" });
    return null;
  }
  const mac = normalizeMac(String(raw.mac || ""));
  const username = String(raw.username || "").trim();
  const password = String(raw.password || "");
  if (!mac || mac.length !== 12 || !username || !password) {
    safeSend(socket, { type: "auth_error", error: "Missing/invalid credentials" });
    return null;
  }

  const sb = svc();
  const { data: device, error } = await sb
    .from("gateway_devices")
    .select(`
      id,
      tenant_id,
      location_id,
      location_integration_id,
      gateway_username,
      gateway_password_hash,
      mac_address,
      tenants:tenant_id (name),
      locations:location_id (name)
    `)
    .eq("mac_address", mac)
    .maybeSingle();

  if (error || !device) {
    safeSend(socket, { type: "auth_error", error: "Unknown device (MAC not provisioned)" });
    return null;
  }
  if (!device.tenant_id) {
    safeSend(socket, { type: "auth_error", error: "Device not yet assigned to a tenant" });
    return null;
  }
  if (!device.gateway_username || !device.gateway_password_hash) {
    safeSend(socket, { type: "auth_error", error: "Device has no credentials configured" });
    return null;
  }
  if (device.gateway_username !== username) {
    safeSend(socket, { type: "auth_error", error: "Invalid username/password" });
    return null;
  }
  const ok = await bcryptVerify(password, device.gateway_password_hash);
  if (!ok) {
    safeSend(socket, { type: "auth_error", error: "Invalid username/password" });
    return null;
  }

  // Update presence fields + optional metadata from auth frame
  const nowIso = new Date().toISOString();
  await sb
    .from("gateway_devices")
    .update({
      status: "online",
      ws_connected_since: nowIso,
      last_heartbeat_at: nowIso,
      last_ws_ping_at: nowIso,
      addon_version: raw.addon_version ?? undefined,
      ha_version: raw.ha_version ?? undefined,
      local_ip: raw.local_ip ?? undefined,
      local_time: raw.local_time ?? undefined,
      updated_at: nowIso,
    })
    .eq("id", device.id);

  // Mark the parent location_integration as successfully connected so the
  // map / locations overview shows the gateway as online (not "pending").
  if (device.location_integration_id) {
    await sb
      .from("location_integrations")
      .update({
        sync_status: "success",
        last_sync_at: nowIso,
        sync_error: null,
        updated_at: nowIso,
      })
      .eq("id", device.location_integration_id);
  }

  safeSend(socket, {
    type: "auth_ok",
    device_id: device.id,
    tenant_id: device.tenant_id,
    location_id: device.location_id,
    location_integration_id: device.location_integration_id,
    tenant_name: (device as any).tenants?.name ?? null,
    location_name: (device as any).locations?.name ?? null,
  });

  return {
    socket,
    deviceId: device.id,
    tenantId: device.tenant_id,
    locationId: device.location_id,
    locationIntegrationId: device.location_integration_id ?? null,
    channel: null,
    closeRequested: false,
  };
}

/** Handle subsequent frames after auth. */
async function handleFrame(session: Session, raw: any) {
  switch (raw?.type) {
    case "heartbeat":
    case "ping": {
      const nowIso = new Date().toISOString();
      const update: Record<string, unknown> = {
        last_heartbeat_at: nowIso,
        last_ws_ping_at: nowIso,
        status: "online",
        updated_at: nowIso,
      };
      if (raw.local_ip) update.local_ip = raw.local_ip;
      if (raw.local_time) update.local_time = raw.local_time;
      if (raw.addon_version) update.addon_version = raw.addon_version;
      if (raw.ha_version) update.ha_version = raw.ha_version;
      if (typeof raw.offline_buffer_count === "number") {
        update.offline_buffer_count = raw.offline_buffer_count;
      }
      await svc().from("gateway_devices").update(update).eq("id", session.deviceId);
      if (session.locationIntegrationId) {
        await svc()
          .from("location_integrations")
          .update({ sync_status: "success", last_sync_at: nowIso, sync_error: null, updated_at: nowIso })
          .eq("id", session.locationIntegrationId);
      }
      safeSend(session.socket, { type: "pong" });
      break;
    }
    case "ack": {
      const cmdId = String(raw.command_id || "");
      if (!cmdId) return;
      const isError = !!raw.error;
      const sb = svc();
      const { data: cmdRow } = await sb
        .from("gateway_commands")
        .select("payload")
        .eq("id", cmdId)
        .eq("gateway_device_id", session.deviceId)
        .maybeSingle();

      await sb
        .from("gateway_commands")
        .update({
          status: isError ? "failed" : "completed",
          response: raw.response ?? null,
          error_message: isError ? String(raw.error) : null,
          acked_at: new Date().toISOString(),
        })
        .eq("id", cmdId)
        .eq("gateway_device_id", session.deviceId);

      if (!isError) {
        const payload = (cmdRow?.payload ?? {}) as Record<string, unknown>;
        const entityId = String(payload.entity_id || "").trim();
        const explicitState = getExplicitBinaryState(payload.command);
        if (entityId && explicitState) {
          await mirrorGatewayInventoryState({
            gatewayDeviceId: session.deviceId,
            entityId,
            nextState: explicitState,
            locationIntegrationId: session.locationIntegrationId,
          });
        }
      }
      break;
    }
    default:
      // Unknown frame – ignore
      break;
  }
}

Deno.serve((req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return handleHttpAction(req).then((response) =>
      response ?? jsonResponse(req, { ok: true, service: "gateway-ws" }),
    );
  }

  // Health probe (HTTP GET)
  const { socket, response } = Deno.upgradeWebSocket(req);
  let session: Session | null = null;
  let authTimeout: number | undefined = setTimeout(() => {
    if (!session) {
      safeSend(socket, { type: "auth_error", error: "auth timeout" });
      try { socket.close(4001, "auth timeout"); } catch { /* ignore */ }
    }
  }, 10_000);

  socket.onmessage = async (ev) => {
    let raw: any;
    try { raw = JSON.parse(typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data)); }
    catch { return; }

    if (!session) {
      session = await handleAuth(socket, raw);
      if (session) {
        if (authTimeout) { clearTimeout(authTimeout); authTimeout = undefined; }
        await subscribeCommands(session);
      } else {
        try { socket.close(4003, "auth failed"); } catch { /* ignore */ }
      }
      return;
    }
    await handleFrame(session, raw).catch((e) =>
      console.error("[gateway-ws] frame error", e),
    );
  };

  socket.onclose = async () => {
    if (authTimeout) clearTimeout(authTimeout);
    if (session) await tearDown(session);
  };
  socket.onerror = async (e) => {
    console.error("[gateway-ws] socket error", e);
    if (session) await tearDown(session);
  };

  return response;
});
