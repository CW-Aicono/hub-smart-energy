import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

interface HomematicConfig {
  access_point_sgtin: string;
  auth_token: string;
  client_id: string;
}

const HMIP_CLOUD_URL = "https://lookup.homematic.com:48335";
const HMIP_API_URL = "https://ps1.homematic.com:6969";

async function updateSyncStatus(supabase: ReturnType<typeof createClient>, id: string, status: string) {
  await supabase.from("location_integrations").update({ sync_status: status, last_sync_at: new Date().toISOString() }).eq("id", id);
}

async function hmipRequest(path: string, config: HomematicConfig, body?: any): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    AUTHTOKEN: config.auth_token,
    CLIENTAUTH: config.client_id,
  };

  const res = await fetch(`${HMIP_API_URL}/hmip${path}`, {
    method: "POST",
    headers,
    body: body ? JSON.stringify(body) : JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Homematic IP Fehler: HTTP ${res.status}`);
  return res.json();
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── AUTH ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Nicht authentifiziert" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: claimsUser }, error: claimsError } = await authClient.auth.getUser(token);
    if (claimsError || !claimsUser) {
      return new Response(JSON.stringify({ success: false, error: "Ungültiges Token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claimsUser.id;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("user_id", userId).single();
    if (!profile?.tenant_id) {
      return new Response(JSON.stringify({ success: false, error: "Kein Mandant zugeordnet" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { locationIntegrationId, action } = await req.json();
    if (!locationIntegrationId) throw new Error("Location Integration ID ist erforderlich");

    const { data: li, error: liErr } = await supabase.from("location_integrations").select("*, integration:integrations(*), location:locations!inner(tenant_id)").eq("id", locationIntegrationId).maybeSingle();
    if (liErr || !li) throw new Error("Standort-Integration nicht gefunden");
    if ((li as any).location?.tenant_id !== profile.tenant_id) {
      return new Response(JSON.stringify({ success: false, error: "Zugriff verweigert" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const config = li.config as HomematicConfig;
    if (!config?.auth_token || !config?.client_id) throw new Error("Auth Token und Client ID müssen konfiguriert sein");

    if (action === "test") {
      try {
        const data = await hmipRequest("/home/getCurrentState", config);
        if (data?.home) {
          await updateSyncStatus(supabase, locationIntegrationId, "success");
          return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        throw new Error("Ungültige Antwort vom Access Point");
      } catch (err) {
        await updateSyncStatus(supabase, locationIntegrationId, "error");
        throw err;
      }
    }

    if (action === "getSensors") {
      await updateSyncStatus(supabase, locationIntegrationId, "syncing");

      const data = await hmipRequest("/home/getCurrentState", config);
      if (!data?.home) {
        await updateSyncStatus(supabase, locationIntegrationId, "error");
        throw new Error("Keine Gerätedaten empfangen");
      }

      const devices = data.home.devices || {};
      const groups = data.home.groups || {};
      const sensors: any[] = [];

      for (const [deviceId, device] of Object.entries(devices as Record<string, any>)) {
        const channels = device.functionalChannels || {};
        const deviceName = device.label || device.type || deviceId;
        const roomId = device.roomId;

        for (const [chId, channel] of Object.entries(channels as Record<string, any>)) {
          const chType = channel.functionalChannelType || "";

          // Climate sensors
          if (channel.actualTemperature != null) {
            sensors.push({
              id: `${deviceId}_${chId}_temp`, name: `${deviceName} Temperatur`,
              type: "temperature", controlType: chType, room: roomId || "", category: "Klima",
              value: channel.actualTemperature.toFixed(1), rawValue: channel.actualTemperature,
              unit: "°C", status: "online", stateName: "actualTemperature",
              secondaryValue: channel.humidity != null ? channel.humidity.toFixed(0) : "",
              secondaryStateName: "humidity", secondaryUnit: "%", totalDay: null,
            });
          }

          // Switch / relay
          if (channel.on !== undefined) {
            sensors.push({
              id: `${deviceId}_${chId}_switch`, name: `${deviceName} Schalter`,
              type: "switch", controlType: chType, room: roomId || "", category: "Schalter",
              value: channel.on ? "Ein" : "Aus", rawValue: channel.on ? 1 : 0,
              unit: "", status: "online", stateName: "on",
              secondaryValue: "", secondaryStateName: "", secondaryUnit: "", totalDay: null,
            });
          }

          // Energy counter
          if (channel.energyCounter != null) {
            sensors.push({
              id: `${deviceId}_${chId}_energy`, name: `${deviceName} Energie`,
              type: "energy", controlType: chType, room: roomId || "", category: "Energie",
              value: (channel.energyCounter / 1000).toFixed(1), rawValue: channel.energyCounter / 1000,
              unit: "kWh", status: "online", stateName: "energyCounter",
              secondaryValue: channel.currentPowerConsumption != null ? channel.currentPowerConsumption.toFixed(1) : "",
              secondaryStateName: "currentPowerConsumption", secondaryUnit: "W", totalDay: null,
            });
          }
        }
      }

      sensors.sort((a, b) => a.name.localeCompare(b.name));
      await updateSyncStatus(supabase, locationIntegrationId, "success");
      return new Response(JSON.stringify({ success: true, sensors }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error(`Unbekannte Aktion: ${action}`);
  } catch (error) {
    console.error("Homematic IP API error:", error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unbekannter Fehler" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
