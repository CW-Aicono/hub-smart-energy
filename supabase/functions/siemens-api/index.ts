import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

interface SiemensConfig {
  api_url: string;
  client_id: string;
  client_secret: string;
  partition_id: string;
}

async function updateSyncStatus(supabase: ReturnType<typeof createClient>, id: string, status: string) {
  await supabase.from("location_integrations").update({ sync_status: status, last_sync_at: new Date().toISOString() }).eq("id", id);
}

async function getAccessToken(config: SiemensConfig): Promise<string> {
  const res = await fetch("https://login.siemens.com/access/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: config.client_id, client_secret: config.client_secret }),
  });
  if (!res.ok) throw new Error(`Siemens OAuth fehlgeschlagen: HTTP ${res.status}`);
  const data = await res.json();
  return data.access_token;
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
    const token = authHeader.replace("Bearer ", "");
    const isServiceRole = token === supabaseServiceKey;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let userTenantId: string | null = null;
    if (isServiceRole) {
      console.log("Service-role call detected – skipping user JWT validation");
    } else {
      const authClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user: claimsUser }, error: claimsError } = await authClient.auth.getUser(token);
      if (claimsError || !claimsUser) {
        return new Response(JSON.stringify({ success: false, error: "Ungültiges Token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("user_id", claimsUser.id).single();
      if (!profile?.tenant_id) {
        return new Response(JSON.stringify({ success: false, error: "Kein Mandant zugeordnet" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      userTenantId = profile.tenant_id;
    }

    const { locationIntegrationId, action } = await req.json();
    if (!locationIntegrationId) throw new Error("Location Integration ID ist erforderlich");

    const { data: li, error: liErr } = await supabase.from("location_integrations").select("*, integration:integrations(*), location:locations!inner(tenant_id)").eq("id", locationIntegrationId).maybeSingle();
    if (liErr || !li) throw new Error("Standort-Integration nicht gefunden");
    if (!isServiceRole && (li as any).location?.tenant_id !== userTenantId) {
      return new Response(JSON.stringify({ success: false, error: "Zugriff verweigert" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const config = li.config as SiemensConfig;
    if (!config?.api_url || !config?.client_id || !config?.client_secret) throw new Error("API-Konfiguration unvollständig");

    if (action === "test") {
      try {
        const token = await getAccessToken(config);
        const res = await fetch(`${config.api_url}/api/v1/partitions/${config.partition_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          await updateSyncStatus(supabase, locationIntegrationId, "error");
          throw new Error(`Building X nicht erreichbar: HTTP ${res.status}`);
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

      const res = await fetch(`${config.api_url}/api/v1/partitions/${config.partition_id}/points?page[size]=500`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        await updateSyncStatus(supabase, locationIntegrationId, "error");
        throw new Error(`Datenpunkte konnten nicht geladen werden: HTTP ${res.status}`);
      }
      const data = await res.json();
      const points = data?.data || [];

      const sensors: any[] = [];
      for (const point of points) {
        const attrs = point.attributes || {};
        const value = attrs.presentValue ?? attrs.value;
        const numVal = parseFloat(String(value));
        sensors.push({
          id: point.id, name: attrs.name || attrs.description || point.id,
          type: attrs.pointType?.includes("analog") ? "analog" : "digital",
          controlType: attrs.objectType || "unknown",
          room: attrs.location || "", category: attrs.pointType || "Siemens",
          value: !isNaN(numVal) ? numVal.toFixed(2) : String(value ?? "-"),
          rawValue: !isNaN(numVal) ? numVal : null, unit: attrs.unit || "",
          status: "online", stateName: "presentValue",
          secondaryValue: "", secondaryStateName: "", secondaryUnit: "", totalDay: null,
        });
      }

      sensors.sort((a, b) => a.name.localeCompare(b.name));
      await updateSyncStatus(supabase, locationIntegrationId, "success");
      return new Response(JSON.stringify({ success: true, sensors }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error(`Unbekannte Aktion: ${action}`);
  } catch (error) {
    console.error("Siemens API error:", error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unbekannter Fehler" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
