import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

interface ShellyConfig {
  server_uri: string;
  auth_key: string;
}

/** Strip colons, dashes, whitespace and lowercase for stable ID comparison */
function normalizeShellyId(id: string): string {
  return String(id).toLowerCase().replace(/[:\-\s]/g, "").trim();
}

async function updateSyncStatus(supabase: ReturnType<typeof createClient>, id: string, status: string) {
  await supabase.from("location_integrations").update({ sync_status: status, last_sync_at: new Date().toISOString() }).eq("id", id);
}

/**
 * Fetch device names via Shelly Cloud v2 API.
 * POST /v2/devices/api/get with select: ["settings"]
 * Returns a map of normalized deviceId → user-assigned name.
 */
async function fetchDeviceNamesV2(baseUrl: string, authKey: string, deviceIds: string[]): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();
  // v2 API allows max 10 IDs per request
  const chunks: string[][] = [];
  for (let i = 0; i < deviceIds.length; i += 10) {
    chunks.push(deviceIds.slice(i, i + 10));
  }
  for (const chunk of chunks) {
    try {
      const res = await fetch(`${baseUrl}/v2/devices/api/get?auth_key=${authKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: chunk, select: ["settings"] }),
      });
      if (!res.ok) {
        console.warn(`[shelly] v2 /devices/api/get returned HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      // Response is { data: { devices: [ { id, settings: { name: "..." } } ] } } or similar
      const devices = data?.data?.devices || data?.data || [];
      if (Array.isArray(devices)) {
        for (const dev of devices) {
          const id = dev.id || dev._id;
          const name = dev.settings?.name || dev.name;
          if (id && name) {
            nameMap.set(normalizeShellyId(id), String(name));
          }
        }
      }
    } catch (e) {
      console.warn("[shelly] v2 API name fetch failed:", e);
    }
    // Respect rate limit: 1 req/s
    if (chunks.length > 1) await new Promise(r => setTimeout(r, 1100));
  }
  return nameMap;
}

/**
 * Extract device name from status object using multiple fallback sources.
 * Priority: sys.device.name (Gen2) > _dev_info.name > cloud.name > null
 */
function extractNameFromStatus(deviceStatus: any): string | null {
  // Gen2: sys.device.name is where the user-set name lives
  if (deviceStatus?.sys?.device?.name) return String(deviceStatus.sys.device.name);
  // Shelly Cloud adds _dev_info with name
  if (deviceStatus?._dev_info?.name) return String(deviceStatus._dev_info.name);
  // Some firmware versions store it in cloud
  if (deviceStatus?.cloud?.name) return String(deviceStatus.cloud.name);
  // Gen1: getinfo sometimes has name
  if (deviceStatus?.getinfo?.name) return String(deviceStatus.getinfo.name);
  return null;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── AUTH: Validate JWT and tenant ownership ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Nicht authentifiziert" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const isServiceInvocation = token === supabaseServiceKey;

    let tenantId: string | null = null;

    if (!isServiceInvocation) {
      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userError } = await authClient.auth.getUser(token);
      if (userError || !user) {
        return new Response(JSON.stringify({ success: false, error: "Ungültiges Token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("user_id", user.id).single();
      if (!profile?.tenant_id) {
        return new Response(JSON.stringify({ success: false, error: "Kein Mandant zugeordnet" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      tenantId = profile.tenant_id;
    }

    const body = await req.json();
    const { locationIntegrationId, action, controlUuid, commandValue } = body;
    if (!locationIntegrationId) throw new Error("Location Integration ID ist erforderlich");

    const { data: li, error: liErr } = await supabase.from("location_integrations").select("*, integration:integrations(*), location:locations!inner(tenant_id)").eq("id", locationIntegrationId).maybeSingle();
    if (liErr || !li) throw new Error("Standort-Integration nicht gefunden");

    // Verify tenant ownership
    if (!isServiceInvocation && (li as any).location?.tenant_id !== tenantId) {
      return new Response(JSON.stringify({ success: false, error: "Zugriff verweigert" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const config = li.config as ShellyConfig;
    if (!config?.server_uri || !config?.auth_key) throw new Error("Server URI und Auth Key müssen konfiguriert sein");

    const baseUrl = `https://${config.server_uri.replace(/^https?:\/\//, "")}`;

    if (action === "test") {
      const res = await fetch(`${baseUrl}/device/all_status?auth_key=${config.auth_key}`);
      if (!res.ok) {
        await updateSyncStatus(supabase, locationIntegrationId, "error");
        throw new Error(`Verbindung fehlgeschlagen: HTTP ${res.status}`);
      }
      await updateSyncStatus(supabase, locationIntegrationId, "success");
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "getSensors") {
      await updateSyncStatus(supabase, locationIntegrationId, "syncing");

      // Step 1: Fetch all device statuses
      const statusRes = await fetch(`${baseUrl}/device/all_status?auth_key=${config.auth_key}`);
      if (!statusRes.ok) {
        await updateSyncStatus(supabase, locationIntegrationId, "error");
        throw new Error(`Geräte konnten nicht geladen werden: HTTP ${statusRes.status}`);
      }
      const statusData = await statusRes.json();
      const devices = statusData?.data?.devices_status || {};
      const deviceIds = Object.keys(devices);

      // Step 2: Build name map from multiple sources
      // 2a: Extract names from status data itself (Gen2 sys.device.name, _dev_info.name)
      const statusNameMap = new Map<string, string>();
      for (const [deviceId, deviceStatus] of Object.entries(devices as Record<string, any>)) {
        const name = extractNameFromStatus(deviceStatus);
        if (name) {
          statusNameMap.set(normalizeShellyId(deviceId), name);
        }
      }
      console.log(`[shelly] Names from status: ${statusNameMap.size}/${deviceIds.length} devices`);

      // 2b: For devices still without names, try v2 API (sequential, respects rate limit)
      const missingNameIds = deviceIds.filter(id => !statusNameMap.has(normalizeShellyId(id)));
      let v2NameMap = new Map<string, string>();
      if (missingNameIds.length > 0) {
        console.log(`[shelly] ${missingNameIds.length} devices without name from status, trying v2 API...`);
        v2NameMap = await fetchDeviceNamesV2(baseUrl, config.auth_key, missingNameIds);
        console.log(`[shelly] v2 API resolved ${v2NameMap.size}/${missingNameIds.length} names`);
      }

      // Merged name resolver: status name > v2 name > deviceId
      function resolveDeviceName(deviceId: string, deviceStatus: any): string {
        const normalizedId = normalizeShellyId(deviceId);
        const statusName = statusNameMap.get(normalizedId);
        if (statusName) return statusName;
        const v2Name = v2NameMap.get(normalizedId);
        if (v2Name) return v2Name;
        // Last resort: log and use deviceId
        console.log(`[shelly] No name found for device "${deviceId}" (normalized: "${normalizedId}"), status keys: ${Object.keys(deviceStatus || {}).join(",")}`);
        return deviceId;
      }

      // Count channels per device to decide whether to append "Kanal X"
      const deviceChannelCount = new Map<string, number>();
      for (const [deviceId, deviceStatus] of Object.entries(devices as Record<string, any>)) {
        let count = 0;
        for (let ch = 0; ch < 4; ch++) {
          if (deviceStatus?.[`switch:${ch}`]) count++;
        }
        if (count === 0 && Array.isArray(deviceStatus.relays)) count = deviceStatus.relays.length;
        deviceChannelCount.set(deviceId, count);
      }

      const sensors: any[] = [];
      for (const [deviceId, deviceStatus] of Object.entries(devices as Record<string, any>)) {
        const deviceName = resolveDeviceName(deviceId, deviceStatus);
        const model = deviceStatus?._dev_info?.model || deviceStatus?.sys?.device?.model || "unknown";

        if (deviceStatus?.["em:0"]) {
          const em = deviceStatus["em:0"];
          sensors.push({
            id: `${deviceId}_em0_power`, name: `${deviceName} Leistung`, type: "power",
            controlType: model, room: "", category: "Energie",
            value: em.total_act_power != null ? em.total_act_power.toFixed(1) : "-",
            rawValue: em.total_act_power ?? null, unit: "W", status: "online",
            stateName: "total_act_power", secondaryValue: "", secondaryStateName: "", secondaryUnit: "", totalDay: null,
          });
        }
        if (deviceStatus?.["emdata:0"]) {
          const emd = deviceStatus["emdata:0"];
          sensors.push({
            id: `${deviceId}_emdata0_total`, name: `${deviceName} Zähler`, type: "energy",
            controlType: model, room: "", category: "Energie",
            value: emd.total_act != null ? (emd.total_act / 1000).toFixed(1) : "-",
            rawValue: emd.total_act != null ? emd.total_act / 1000 : null, unit: "kWh", status: "online",
            stateName: "total_act", secondaryValue: "", secondaryStateName: "", secondaryUnit: "", totalDay: null,
          });
        }
        const totalChannels = deviceChannelCount.get(deviceId) || 0;
        for (let ch = 0; ch < 4; ch++) {
          const sw = deviceStatus?.[`switch:${ch}`];
          if (sw) {
            const chLabel = totalChannels > 1 ? `${deviceName} Kanal ${ch}` : deviceName;
            sensors.push({
              id: `${deviceId}_switch${ch}`, name: chLabel, type: "switch",
              controlType: model, room: "", category: "Schalter",
              value: sw.output ? "Ein" : "Aus", rawValue: sw.output ? 1 : 0, unit: "",
              status: "online", stateName: "output",
              secondaryValue: sw.apower != null ? sw.apower.toFixed(1) : "", secondaryStateName: "apower", secondaryUnit: "W", totalDay: null,
            });
          }
        }
        if (deviceStatus?.["temperature:0"]) {
          const t = deviceStatus["temperature:0"];
          sensors.push({
            id: `${deviceId}_temp0`, name: `${deviceName} Temperatur`, type: "temperature",
            controlType: model, room: "", category: "Klima",
            value: t.tC != null ? t.tC.toFixed(1) : "-", rawValue: t.tC ?? null, unit: "°C",
            status: "online", stateName: "tC", secondaryValue: "", secondaryStateName: "", secondaryUnit: "", totalDay: null,
          });
        }

        // ── Gen 1: relays[] ──
        const hasGen2Switch = sensors.some((s) => s.id.startsWith(`${deviceId}_switch`));
        if (!hasGen2Switch && Array.isArray(deviceStatus.relays)) {
          const relayCount = deviceStatus.relays.length;
          deviceStatus.relays.forEach((relay: any, i: number) => {
            const power = Array.isArray(deviceStatus.meters) ? deviceStatus.meters[i]?.power : undefined;
            const relayLabel = relayCount > 1 ? `${deviceName} Kanal ${i}` : deviceName;
            sensors.push({
              id: `${deviceId}_relay${i}`, name: relayLabel, type: "switch",
              controlType: model, room: "", category: "Schalter",
              value: relay.ison ? "Ein" : "Aus", rawValue: relay.ison ? 1 : 0, unit: "",
              status: "online", stateName: "ison",
              secondaryValue: power != null ? power.toFixed(1) : "", secondaryStateName: "power", secondaryUnit: "W", totalDay: null,
            });
          });
        }

        // ── Gen 1: meters[] (standalone power sensors) ──
        if (Array.isArray(deviceStatus.meters)) {
          const meterCount = deviceStatus.meters.length;
          deviceStatus.meters.forEach((m: any, i: number) => {
            const meterLabel = meterCount > 1 ? `${deviceName} Leistung ${i}` : `${deviceName} Leistung`;
            sensors.push({
              id: `${deviceId}_meter${i}`, name: meterLabel, type: "power",
              controlType: model, room: "", category: "Energie",
              value: m.power != null ? m.power.toFixed(1) : "-", rawValue: m.power ?? null, unit: "W",
              status: "online", stateName: "power",
              secondaryValue: "", secondaryStateName: "", secondaryUnit: "", totalDay: null,
            });
          });
        }

        // ── Gen 1: tmp (temperature) ──
        if (deviceStatus.tmp && !deviceStatus["temperature:0"]) {
          const t = deviceStatus.tmp;
          if (t.is_valid !== false) {
            sensors.push({
              id: `${deviceId}_tmp`, name: `${deviceName} Temperatur`, type: "temperature",
              controlType: model, room: "", category: "Klima",
              value: t.tC != null ? t.tC.toFixed(1) : "-", rawValue: t.tC ?? null, unit: "°C",
              status: "online", stateName: "tC",
              secondaryValue: "", secondaryStateName: "", secondaryUnit: "", totalDay: null,
            });
          }
        }
      }

      sensors.sort((a, b) => a.name.localeCompare(b.name));
      await updateSyncStatus(supabase, locationIntegrationId, "success");
      return new Response(JSON.stringify({ success: true, sensors }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "executeCommand") {
      // controlUuid format: "<deviceId>_switch<ch>" or "<deviceId>_relay<ch>"
      if (!controlUuid) throw new Error("controlUuid ist erforderlich");

      // Parse deviceId and channel from controlUuid
      const switchMatch = controlUuid.match(/^(.+)_switch(\d+)$/);
      const relayMatch = controlUuid.match(/^(.+)_relay(\d+)$/);
      const match = switchMatch || relayMatch;
      if (!match) throw new Error(`Kein schaltbarer Aktor: ${controlUuid}`);

      const deviceId = match[1];
      const channel = parseInt(match[2], 10);
      const isGen1 = !!relayMatch;

      // Determine turn on/off
      let turnOn: boolean;
      const cmd = (commandValue || "toggle").toLowerCase();
      if (cmd === "on" || cmd === "1") turnOn = true;
      else if (cmd === "off" || cmd === "0") turnOn = false;
      else if (cmd === "toggle" || cmd === "pulse") {
        // Need current state to toggle — fetch status first
        const statusRes = await fetch(`${baseUrl}/device/status`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ auth_key: config.auth_key, id: deviceId }),
        });
        if (!statusRes.ok) throw new Error(`Gerätestatus nicht abrufbar: HTTP ${statusRes.status}`);
        const statusData = await statusRes.json();
        const devStatus = statusData?.data?.device_status;
        if (isGen1) {
          turnOn = !(devStatus?.relays?.[channel]?.ison ?? false);
        } else {
          turnOn = !(devStatus?.[`switch:${channel}`]?.output ?? false);
        }
      } else {
        throw new Error(`Unbekannter Befehl: ${commandValue}`);
      }

      let controlRes: Response;
      if (isGen1) {
        // Gen 1: POST /device/relay/control
        controlRes = await fetch(`${baseUrl}/device/relay/control`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            auth_key: config.auth_key,
            id: deviceId,
            channel: String(channel),
            turn: turnOn ? "on" : "off",
          }),
        });
      } else {
        // Gen 2+: POST /device/relay/control works for both Gen1 and Gen2 via Cloud API
        controlRes = await fetch(`${baseUrl}/device/relay/control`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            auth_key: config.auth_key,
            id: deviceId,
            channel: String(channel),
            turn: turnOn ? "on" : "off",
          }),
        });
      }

      const responseText = await controlRes.text();
      let result: any = {};
      try { result = JSON.parse(responseText); } catch { /* empty or non-JSON response */ }

      if (!result?.isok && result?.errors) {
        throw new Error(`Shelly-Fehler: ${JSON.stringify(result.errors)}`);
      }
      if (!controlRes.ok && !result?.isok) {
        throw new Error(`Schaltbefehl fehlgeschlagen: HTTP ${controlRes.status} – ${responseText}`);
      }

      return new Response(JSON.stringify({ success: true, turned: turnOn ? "on" : "off" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error(`Unbekannte Aktion: ${action}`);
  } catch (error) {
    console.error("Shelly API error:", error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unbekannter Fehler" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
