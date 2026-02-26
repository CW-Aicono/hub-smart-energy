import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

interface TuyaConfig {
  access_id: string;
  access_secret: string;
  region: string; // eu, us, cn, in
}

const REGION_URLS: Record<string, string> = {
  eu: "https://openapi.tuyaeu.com",
  us: "https://openapi.tuyaus.com",
  cn: "https://openapi.tuyacn.com",
  in: "https://openapi.tuyain.com",
};

async function updateSyncStatus(supabase: ReturnType<typeof createClient>, id: string, status: string) {
  await supabase.from("location_integrations").update({ sync_status: status, last_sync_at: new Date().toISOString() }).eq("id", id);
}

async function getAccessToken(config: TuyaConfig): Promise<{ token: string; baseUrl: string }> {
  const baseUrl = REGION_URLS[config.region] || REGION_URLS.eu;
  const t = Date.now().toString();
  const signStr = config.access_id + t;
  
  // HMAC-SHA256 sign
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(config.access_secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(signStr));
  const sign = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();

  const res = await fetch(`${baseUrl}/v1.0/token?grant_type=1`, {
    headers: { client_id: config.access_id, sign, t, sign_method: "HMAC-SHA256" },
  });
  if (!res.ok) throw new Error(`Tuya Token-Abruf fehlgeschlagen: HTTP ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(`Tuya Auth Fehler: ${data.msg || "Unknown"}`);
  return { token: data.result.access_token, baseUrl };
}

async function tuyaRequest(baseUrl: string, path: string, token: string, config: TuyaConfig): Promise<any> {
  const t = Date.now().toString();
  const signStr = config.access_id + token + t;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(config.access_secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(signStr));
  const sign = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();

  const res = await fetch(`${baseUrl}${path}`, {
    headers: { client_id: config.access_id, access_token: token, sign, t, sign_method: "HMAC-SHA256" },
  });
  if (!res.ok) throw new Error(`Tuya API Fehler: HTTP ${res.status}`);
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
    if ((li as any).location?.tenant_id !== profile.tenant_id) {
      return new Response(JSON.stringify({ success: false, error: "Zugriff verweigert" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const config = li.config as TuyaConfig;
    if (!config?.access_id || !config?.access_secret) throw new Error("Access ID und Secret müssen konfiguriert sein");

    if (action === "test") {
      try {
        await getAccessToken(config);
        await updateSyncStatus(supabase, locationIntegrationId, "success");
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (err) {
        await updateSyncStatus(supabase, locationIntegrationId, "error");
        throw err;
      }
    }

    if (action === "getSensors") {
      await updateSyncStatus(supabase, locationIntegrationId, "syncing");
      const { token, baseUrl } = await getAccessToken(config);

      // Get all devices
      const devicesData = await tuyaRequest(baseUrl, "/v1.0/iot-01/associated-users/devices", token, config);
      if (!devicesData.success) {
        await updateSyncStatus(supabase, locationIntegrationId, "error");
        throw new Error(`Geräte-Abruf fehlgeschlagen: ${devicesData.msg}`);
      }

      const devices = devicesData.result?.devices || [];
      const sensors: any[] = [];

      for (const device of devices) {
        // Get device status
        try {
          const statusData = await tuyaRequest(baseUrl, `/v1.0/devices/${device.id}/status`, token, config);
          const statuses = statusData?.result || [];
          for (const st of statuses) {
            const numVal = parseFloat(String(st.value));
            sensors.push({
              id: `${device.id}_${st.code}`, name: `${device.name || device.id} – ${st.code}`,
              type: st.code.includes("power") || st.code.includes("energy") ? "power" : "analog",
              controlType: device.category || "unknown",
              room: device.room_name || "", category: device.category || "Tuya",
              value: !isNaN(numVal) ? numVal.toFixed(2) : String(st.value ?? "-"),
              rawValue: !isNaN(numVal) ? numVal : null, unit: "",
              status: device.online ? "online" : "offline", stateName: st.code,
              secondaryValue: "", secondaryStateName: "", secondaryUnit: "", totalDay: null,
            });
          }
        } catch (e) {
          console.warn(`Fehler beim Abruf von ${device.id}:`, e);
        }
      }

      sensors.sort((a, b) => a.name.localeCompare(b.name));
      await updateSyncStatus(supabase, locationIntegrationId, "success");
      return new Response(JSON.stringify({ success: true, sensors }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error(`Unbekannte Aktion: ${action}`);
  } catch (error) {
    console.error("Tuya API error:", error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unbekannter Fehler" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
