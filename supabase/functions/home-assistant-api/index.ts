import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

interface HAConfig {
  api_url: string;
  access_token: string;
  entity_filter?: string;
}

interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

const DEVICE_CLASS_MAP: Record<string, { type: string; unit: string; category: string }> = {
  power: { type: "power", unit: "W", category: "Energie" },
  energy: { type: "energy", unit: "kWh", category: "Energie" },
  temperature: { type: "temperature", unit: "°C", category: "Klima" },
  voltage: { type: "voltage", unit: "V", category: "Elektrik" },
  current: { type: "current", unit: "A", category: "Elektrik" },
  humidity: { type: "humidity", unit: "%", category: "Klima" },
};

function mapHAEntity(entity: HAState): any | null {
  const entityId = entity.entity_id;
  const domain = entityId.split(".")[0];
  const attrs = entity.attributes;
  const friendlyName = (attrs.friendly_name as string) || entityId;
  const deviceClass = attrs.device_class as string | undefined;
  const unitOfMeasurement = (attrs.unit_of_measurement as string) || "";

  // Switches and lights → actuators
  if (domain === "switch" || domain === "light" || domain === "cover" || domain === "climate") {
    return {
      id: entityId,
      name: friendlyName,
      type: domain === "light" ? "light" : domain === "cover" ? "blind" : "switch",
      controlType: domain === "climate" ? "IRoomController" : domain === "cover" ? "Jalousie" : "Switch",
      room: "",
      category: domain === "climate" ? "Klima" : "Schalter",
      value: entity.state === "on" ? "Ein" : entity.state === "off" ? "Aus" : entity.state,
      rawValue: entity.state === "on" ? 1 : entity.state === "off" ? 0 : null,
      unit: "",
      status: entity.state === "unavailable" ? "offline" : "online",
      stateName: "state",
      secondaryValue: "",
      secondaryStateName: "",
      secondaryUnit: "",
      totalDay: null,
    };
  }

  // Sensors with known device_class
  if (domain === "sensor" && deviceClass && DEVICE_CLASS_MAP[deviceClass]) {
    const mapping = DEVICE_CLASS_MAP[deviceClass];
    const numVal = parseFloat(entity.state);
    return {
      id: entityId,
      name: friendlyName,
      type: mapping.type,
      controlType: "HomeAssistant",
      room: "",
      category: mapping.category,
      value: !isNaN(numVal) ? numVal.toFixed(1) : entity.state,
      rawValue: !isNaN(numVal) ? numVal : null,
      unit: unitOfMeasurement || mapping.unit,
      status: entity.state === "unavailable" ? "offline" : "online",
      stateName: entityId,
      secondaryValue: "",
      secondaryStateName: "",
      secondaryUnit: "",
      totalDay: null,
    };
  }

  // Binary sensors
  if (domain === "binary_sensor") {
    return {
      id: entityId,
      name: friendlyName,
      type: deviceClass === "motion" ? "motion" : "digital",
      controlType: "HomeAssistant",
      room: "",
      category: "Sensor",
      value: entity.state === "on" ? "Ein" : "Aus",
      rawValue: entity.state === "on" ? 1 : 0,
      unit: "",
      status: entity.state === "unavailable" ? "offline" : "online",
      stateName: entityId,
      secondaryValue: "",
      secondaryStateName: "",
      secondaryUnit: "",
      totalDay: null,
    };
  }

  return null;
}

function filterByPrefixes(entities: HAState[], filterStr?: string): HAState[] {
  if (!filterStr || filterStr.trim() === "") return entities;
  const prefixes = filterStr.split(",").map((p) => p.trim()).filter(Boolean);
  if (prefixes.length === 0) return entities;
  return entities.filter((e) => prefixes.some((p) => e.entity_id.startsWith(p)));
}

async function updateSyncStatus(supabase: ReturnType<typeof createClient>, id: string, status: string) {
  await supabase.from("location_integrations").update({
    sync_status: status,
    last_sync_at: new Date().toISOString(),
  }).eq("id", id);
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Nicht authentifiziert" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth: validate JWT or accept service-role key for cron
    const token = authHeader.replace("Bearer ", "");
    let supabase: ReturnType<typeof createClient>;

    if (token === supabaseServiceKey) {
      // Called from gateway-periodic-sync with service role key
      supabase = createClient(supabaseUrl, supabaseServiceKey);
    } else {
      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ success: false, error: "Ungültiges Token" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userId = claimsData.claims.sub;
      supabase = createClient(supabaseUrl, supabaseServiceKey);

      const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("user_id", userId).single();
      if (!profile?.tenant_id) {
        return new Response(JSON.stringify({ success: false, error: "Kein Mandant zugeordnet" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { locationIntegrationId, action, domain, service, entity_id: targetEntityId, service_data } = await req.json();
    if (!locationIntegrationId) throw new Error("Location Integration ID ist erforderlich");

    const { data: li, error: liErr } = await supabase
      .from("location_integrations")
      .select("*, integration:integrations(*), location:locations!inner(tenant_id)")
      .eq("id", locationIntegrationId)
      .maybeSingle();
    if (liErr || !li) throw new Error("Standort-Integration nicht gefunden");

    const config = li.config as unknown as HAConfig;
    if (!config?.api_url || !config?.access_token) {
      throw new Error("API URL und Access Token müssen konfiguriert sein");
    }

    const baseUrl = config.api_url.replace(/\/+$/, "");
    const haHeaders = {
      "Authorization": `Bearer ${config.access_token}`,
      "Content-Type": "application/json",
    };

    // ── ACTION: test ──
    if (action === "test") {
      const res = await fetch(`${baseUrl}/api/`, { headers: haHeaders });
      if (!res.ok) {
        await updateSyncStatus(supabase, locationIntegrationId, "error");
        const body = await res.text();
        throw new Error(`Verbindung fehlgeschlagen: HTTP ${res.status} – ${body.substring(0, 200)}`);
      }
      const data = await res.json();
      await updateSyncStatus(supabase, locationIntegrationId, "success");
      return new Response(JSON.stringify({ success: true, message: data.message || "OK" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ACTION: getSensors ──
    if (action === "getSensors") {
      await updateSyncStatus(supabase, locationIntegrationId, "syncing");
      const res = await fetch(`${baseUrl}/api/states`, { headers: haHeaders });
      if (!res.ok) {
        await updateSyncStatus(supabase, locationIntegrationId, "error");
        throw new Error(`States konnten nicht geladen werden: HTTP ${res.status}`);
      }
      const states: HAState[] = await res.json();

      const filtered = filterByPrefixes(states, config.entity_filter);
      const sensors = filtered
        .map(mapHAEntity)
        .filter((s): s is NonNullable<typeof s> => s !== null);

      sensors.sort((a, b) => a.name.localeCompare(b.name));
      await updateSyncStatus(supabase, locationIntegrationId, "success");
      return new Response(JSON.stringify({ success: true, sensors }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ACTION: executeCommand ──
    if (action === "executeCommand") {
      if (!domain || !service) throw new Error("domain und service sind erforderlich");
      const body: Record<string, unknown> = {};
      if (targetEntityId) body.entity_id = targetEntityId;
      if (service_data) Object.assign(body, service_data);

      const res = await fetch(`${baseUrl}/api/services/${domain}/${service}`, {
        method: "POST",
        headers: haHeaders,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Service-Aufruf fehlgeschlagen: HTTP ${res.status} – ${errText.substring(0, 200)}`);
      }
      const result = await res.json();
      return new Response(JSON.stringify({ success: true, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unbekannte Aktion: ${action}`);
  } catch (error) {
    console.error("Home Assistant API error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Unbekannter Fehler",
    }), { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
  }
});
