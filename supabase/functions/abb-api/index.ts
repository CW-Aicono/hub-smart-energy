import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ABBConfig {
  api_url: string;
  client_id: string;
  client_secret: string;
  system_id: string;
}

async function updateSyncStatus(supabase: ReturnType<typeof createClient>, id: string, status: string) {
  await supabase.from("location_integrations").update({ sync_status: status, last_sync_at: new Date().toISOString() }).eq("id", id);
}

async function getAccessToken(config: ABBConfig): Promise<string> {
  const tokenUrl = `${config.api_url}/oauth/token`;
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: config.client_id, client_secret: config.client_secret }),
  });
  if (!res.ok) throw new Error(`OAuth Token-Abruf fehlgeschlagen: HTTP ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { locationIntegrationId, action } = await req.json();
    if (!locationIntegrationId) throw new Error("Location Integration ID ist erforderlich");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: li, error: liErr } = await supabase.from("location_integrations").select("*, integration:integrations(*)").eq("id", locationIntegrationId).maybeSingle();
    if (liErr || !li) throw new Error("Standort-Integration nicht gefunden");

    const config = li.config as ABBConfig;
    if (!config?.api_url || !config?.client_id || !config?.client_secret) throw new Error("API-Konfiguration unvollständig");

    if (action === "test") {
      try {
        const token = await getAccessToken(config);
        const res = await fetch(`${config.api_url}/api/v1/sysaps/${config.system_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          await updateSyncStatus(supabase, locationIntegrationId, "error");
          throw new Error(`System nicht erreichbar: HTTP ${res.status}`);
        }
        await updateSyncStatus(supabase, locationIntegrationId, "success");
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (err) {
        await updateSyncStatus(supabase, locationIntegrationId, "error");
        throw err;
      }
    }

    if (action === "getSensors") {
      await updateSyncStatus(supabase, locationIntegrationId, "syncing");
      const token = await getAccessToken(config);

      const res = await fetch(`${config.api_url}/api/v1/sysaps/${config.system_id}/devices`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        await updateSyncStatus(supabase, locationIntegrationId, "error");
        throw new Error(`Geräte-Abruf fehlgeschlagen: HTTP ${res.status}`);
      }
      const data = await res.json();
      const devices = data?.devices || data || [];

      const sensors: any[] = [];
      for (const device of (Array.isArray(devices) ? devices : Object.values(devices))) {
        const d = device as any;
        const channels = d.channels || {};
        for (const [chId, channel] of Object.entries(channels as Record<string, any>)) {
          const datapoints = channel.outputs || channel.datapoints || {};
          for (const [dpId, dp] of Object.entries(datapoints as Record<string, any>)) {
            const value = typeof dp === "object" ? dp.value : dp;
            const numVal = parseFloat(String(value));
            sensors.push({
              id: `${d.serial || d.deviceId}_${chId}_${dpId}`,
              name: `${d.displayName || d.serial || "Gerät"} – ${channel.displayName || chId}`,
              type: "analog", controlType: d.deviceType || "unknown",
              room: channel.room || "", category: d.deviceType || "ABB",
              value: !isNaN(numVal) ? numVal.toFixed(2) : String(value ?? "-"),
              rawValue: !isNaN(numVal) ? numVal : null, unit: dp.unit || "",
              status: "online", stateName: dpId,
              secondaryValue: "", secondaryStateName: "", secondaryUnit: "", totalDay: null,
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
    console.error("ABB API error:", error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unbekannter Fehler" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
