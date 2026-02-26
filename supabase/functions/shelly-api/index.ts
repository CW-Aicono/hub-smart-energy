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

    const { locationIntegrationId, action } = await req.json();
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
      }

      sensors.sort((a, b) => a.name.localeCompare(b.name));
      await updateSyncStatus(supabase, locationIntegrationId, "success");
      return new Response(JSON.stringify({ success: true, sensors }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error(`Unbekannte Aktion: ${action}`);
  } catch (error) {
    console.error("Shelly API error:", error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unbekannter Fehler" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
