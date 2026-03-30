import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

interface ShellyConfig {
  server_uri: string;
  auth_key: string;
}

async function updateSyncStatus(supabase: ReturnType<typeof createClient>, id: string, status: string) {
  await supabase.from("location_integrations").update({ sync_status: status, last_sync_at: new Date().toISOString() }).eq("id", id);
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

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ success: false, error: "Ungültiges Token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claimsData.claims.sub;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("user_id", userId).single();
    if (!profile?.tenant_id) {
      return new Response(JSON.stringify({ success: false, error: "Kein Mandant zugeordnet" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { locationIntegrationId, action, controlUuid, commandValue } = body;
    if (!locationIntegrationId) throw new Error("Location Integration ID ist erforderlich");

    const { data: li, error: liErr } = await supabase.from("location_integrations").select("*, integration:integrations(*), location:locations!inner(tenant_id)").eq("id", locationIntegrationId).maybeSingle();
    if (liErr || !li) throw new Error("Standort-Integration nicht gefunden");

    // Verify tenant ownership
    if ((li as any).location?.tenant_id !== profile.tenant_id) {
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
      const res = await fetch(`${baseUrl}/device/all_status?auth_key=${config.auth_key}`);
      if (!res.ok) {
        await updateSyncStatus(supabase, locationIntegrationId, "error");
        throw new Error(`Geräte konnten nicht geladen werden: HTTP ${res.status}`);
      }
      const data = await res.json();
      const devices = data?.data?.devices_status || {};

      const sensors: any[] = [];
      for (const [deviceId, deviceStatus] of Object.entries(devices as Record<string, any>)) {
        const deviceName = deviceStatus?._dev_info?.name || deviceId;
        const model = deviceStatus?._dev_info?.model || "unknown";

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
        for (let ch = 0; ch < 4; ch++) {
          const sw = deviceStatus?.[`switch:${ch}`];
          if (sw) {
            sensors.push({
              id: `${deviceId}_switch${ch}`, name: `${deviceName} Kanal ${ch}`, type: "switch",
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
          deviceStatus.relays.forEach((relay: any, i: number) => {
            const power = Array.isArray(deviceStatus.meters) ? deviceStatus.meters[i]?.power : undefined;
            sensors.push({
              id: `${deviceId}_relay${i}`, name: `${deviceName} Kanal ${i}`, type: "switch",
              controlType: model, room: "", category: "Schalter",
              value: relay.ison ? "Ein" : "Aus", rawValue: relay.ison ? 1 : 0, unit: "",
              status: "online", stateName: "ison",
              secondaryValue: power != null ? power.toFixed(1) : "", secondaryStateName: "power", secondaryUnit: "W", totalDay: null,
            });
          });
        }

        // ── Gen 1: meters[] (standalone, only if no relay covered it) ──
        if (Array.isArray(deviceStatus.meters)) {
          deviceStatus.meters.forEach((m: any, i: number) => {
            sensors.push({
              id: `${deviceId}_meter${i}`, name: `${deviceName} Leistung ${i}`, type: "power",
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
        // Gen 2+: POST /device/rpc with Switch.Set
        controlRes = await fetch(`${baseUrl}/device/rpc`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            auth_key: config.auth_key,
            id: deviceId,
            method: "Switch.Set",
            params: { id: channel, on: turnOn },
          }),
        });
      }

      const result = await controlRes.json();
      if (!result?.isok && result?.errors) {
        throw new Error(`Shelly-Fehler: ${JSON.stringify(result.errors)}`);
      }
      if (!controlRes.ok && !result?.isok) {
        throw new Error(`Schaltbefehl fehlgeschlagen: HTTP ${controlRes.status}`);
      }

      return new Response(JSON.stringify({ success: true, turned: turnOn ? "on" : "off" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error(`Unbekannte Aktion: ${action}`);
  } catch (error) {
    console.error("Shelly API error:", error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unbekannter Fehler" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
