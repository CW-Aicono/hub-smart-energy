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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function svc(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

function normalizeMac(input: string): string {
  return (input || "").toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 12);
}

async function bcryptVerify(plain: string, hash: string): Promise<boolean> {
  try {
    // Use bcryptjs (pure JS, no Web Worker required) — works in Supabase Edge Runtime.
    const mod: any = await import("https://esm.sh/[email protected]");
    const bcrypt = mod.default ?? mod;
    return await bcrypt.compare(plain, hash);
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
    .select("id, tenant_id, location_id, gateway_username, gateway_password_hash, mac_address")
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

  safeSend(socket, {
    type: "auth_ok",
    device_id: device.id,
    tenant_id: device.tenant_id,
    location_id: device.location_id,
  });

  return {
    socket,
    deviceId: device.id,
    tenantId: device.tenant_id,
    locationId: device.location_id,
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
      safeSend(session.socket, { type: "pong" });
      break;
    }
    case "ack": {
      const cmdId = String(raw.command_id || "");
      if (!cmdId) return;
      const isError = !!raw.error;
      await svc()
        .from("gateway_commands")
        .update({
          status: isError ? "failed" : "completed",
          response: raw.response ?? null,
          error_message: isError ? String(raw.error) : null,
          acked_at: new Date().toISOString(),
        })
        .eq("id", cmdId)
        .eq("gateway_device_id", session.deviceId);
      break;
    }
    default:
      // Unknown frame – ignore
      break;
  }
}

Deno.serve((req) => {
  // Health probe (HTTP GET)
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response(
      JSON.stringify({ ok: true, service: "gateway-ws" }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

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
