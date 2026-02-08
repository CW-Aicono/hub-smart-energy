import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface LoxoneConfig {
  serial_number: string;
  username: string;
  password: string;
}

interface LoxoneControl {
  name: string;
  type: string;
  uuidAction: string;
  room: string;
  cat: string;
  states?: Record<string, string>;
}

interface LoxoneStructure {
  controls: Record<string, LoxoneControl>;
  rooms: Record<string, { name: string }>;
  cats: Record<string, { name: string }>;
}

// Resolve Loxone Cloud DNS by following the redirect from dns.loxonecloud.com/{serial}
async function resolveLoxoneCloudURL(serialNumber: string): Promise<string | null> {
  try {
    const dnsUrl = `http://dns.loxonecloud.com/${serialNumber}`;
    console.log(`Resolving via Loxone Cloud redirect: ${dnsUrl}`);
    
    const response = await fetch(dnsUrl, {
      method: "HEAD",
      redirect: "follow",
    });
    
    const finalUrl = response.url;
    console.log(`Resolved to final URL: ${finalUrl}`);
    
    const urlObj = new URL(finalUrl);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
    console.log(`Using base URL: ${baseUrl}`);
    
    return baseUrl;
  } catch (error) {
    console.error("Cloud DNS resolution error:", error);
    return null;
  }
}

// Fetch individual state value from Loxone
async function fetchStateValue(
  baseUrl: string,
  authHeader: string,
  stateUuid: string
): Promise<number | string | null> {
  try {
    const url = `${baseUrl}/jdev/sps/io/${stateUuid}/state`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: authHeader },
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    // Loxone returns: {"LL":{"control":"uuid","value":"123.45","Code":"200"}}
    if (data?.LL?.value !== undefined) {
      const val = data.LL.value;
      // Try to parse as number
      const numVal = parseFloat(val);
      return isNaN(numVal) ? val : numVal;
    }
    return null;
  } catch {
    return null;
  }
}

// Update sync status in database
async function updateSyncStatus(
  supabase: ReturnType<typeof createClient>,
  locationIntegrationId: string,
  status: "success" | "error" | "syncing"
) {
  await supabase
    .from("location_integrations")
    .update({
      sync_status: status,
      last_sync_at: new Date().toISOString(),
    })
    .eq("id", locationIntegrationId);
    
  console.log(`Updated sync_status to: ${status}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { locationIntegrationId, action } = await req.json();

    if (!locationIntegrationId) {
      throw new Error("Location Integration ID ist erforderlich");
    }

    console.log(`Loxone API request: action=${action}, locationIntegrationId=${locationIntegrationId}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: locationIntegration, error: liError } = await supabase
      .from("location_integrations")
      .select("*, integration:integrations(*)")
      .eq("id", locationIntegrationId)
      .maybeSingle();

    if (liError || !locationIntegration) {
      console.error("Location integration not found:", liError);
      throw new Error("Standort-Integration nicht gefunden");
    }

    const config = locationIntegration.config as LoxoneConfig;
    
    if (!config?.serial_number) {
      throw new Error("Seriennummer nicht konfiguriert");
    }

    if (!config.username || !config.password) {
      throw new Error("Benutzername oder Passwort nicht konfiguriert");
    }

    console.log(`Config: serial=${config.serial_number}, user=${config.username}`);

    const baseUrl = await resolveLoxoneCloudURL(config.serial_number);
    
    if (!baseUrl) {
      await updateSyncStatus(supabase, locationIntegrationId, "error");
      throw new Error("Cloud DNS Auflösung fehlgeschlagen. Miniserver nicht erreichbar.");
    }

    const credentials = btoa(`${config.username}:${config.password}`);
    const authHeader = `Basic ${credentials}`;

    if (action === "test") {
      const testUrl = `${baseUrl}/jdev/cfg/api`;
      console.log(`Testing connection: ${testUrl}`);

      const response = await fetch(testUrl, {
        method: "GET",
        headers: { Authorization: authHeader },
      });

      if (!response.ok) {
        await updateSyncStatus(supabase, locationIntegrationId, "error");
        throw new Error(`Verbindung fehlgeschlagen: ${response.status}`);
      }

      const data = await response.json();
      await updateSyncStatus(supabase, locationIntegrationId, "success");

      return new Response(
        JSON.stringify({ success: true, data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "getSensors") {
      await updateSyncStatus(supabase, locationIntegrationId, "syncing");

      // Fetch structure file
      const structureUrl = `${baseUrl}/data/LoxAPP3.json`;
      console.log(`Fetching structure: ${structureUrl}`);

      const structureResponse = await fetch(structureUrl, {
        method: "GET",
        headers: { Authorization: authHeader },
      });

      if (!structureResponse.ok) {
        await updateSyncStatus(supabase, locationIntegrationId, "error");
        if (structureResponse.status === 401) {
          throw new Error("Authentifizierung fehlgeschlagen.");
        }
        throw new Error(`Struktur konnte nicht geladen werden: ${structureResponse.status}`);
      }

      const structure: LoxoneStructure = await structureResponse.json();
      const controls = structure.controls || {};
      const rooms = structure.rooms || {};
      const categories = structure.cats || {};
      
      console.log(`Loaded structure with ${Object.keys(controls).length} controls`);

      // Collect all state UUIDs we need to query
      const stateUuidsToQuery: { controlUuid: string; stateName: string; stateUuid: string }[] = [];
      
      for (const [uuid, control] of Object.entries(controls)) {
        if (control.states) {
          // Prioritize certain state names for value display
          const priorityStates = ["value", "actual", "Mrc", "Mrt", "position", "level", "brightness", "temperature"];
          for (const stateName of priorityStates) {
            if (control.states[stateName]) {
              stateUuidsToQuery.push({
                controlUuid: uuid,
                stateName,
                stateUuid: control.states[stateName],
              });
              break; // Only take first matching priority state
            }
          }
          // If no priority state found, take the first available
          if (!stateUuidsToQuery.find(s => s.controlUuid === uuid)) {
            const firstStateName = Object.keys(control.states)[0];
            if (firstStateName) {
              stateUuidsToQuery.push({
                controlUuid: uuid,
                stateName: firstStateName,
                stateUuid: control.states[firstStateName],
              });
            }
          }
        }
      }

      console.log(`Querying ${stateUuidsToQuery.length} state values...`);

      // Batch fetch state values (limit concurrent requests)
      const stateValues: Record<string, { value: number | string | null; stateName: string }> = {};
      const batchSize = 10;
      
      for (let i = 0; i < stateUuidsToQuery.length; i += batchSize) {
        const batch = stateUuidsToQuery.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async (item) => {
            const value = await fetchStateValue(baseUrl, authHeader, item.stateUuid);
            return { controlUuid: item.controlUuid, stateName: item.stateName, value };
          })
        );
        
        for (const result of results) {
          stateValues[result.controlUuid] = { value: result.value, stateName: result.stateName };
        }
      }

      console.log(`Fetched ${Object.keys(stateValues).length} state values`);

      // Build sensors array
      const sensors = [];
      
      for (const [uuid, control] of Object.entries(controls)) {
        const roomName = control.room ? rooms[control.room]?.name || "Unbekannt" : "Unbekannt";
        const catName = control.cat ? categories[control.cat]?.name || "Sonstige" : "Sonstige";

        // Determine sensor type and unit
        let sensorType = "unknown";
        let unit = "";
        const controlType = control.type?.toLowerCase() || "";

        if (controlType.includes("temperature") || controlType.includes("temp")) {
          sensorType = "temperature";
          unit = "°C";
        } else if (controlType.includes("humidity") || controlType.includes("feuchte")) {
          sensorType = "humidity";
          unit = "%";
        } else if (controlType.includes("meter") || controlType.includes("zähler") || controlType.includes("energymonitor")) {
          sensorType = "power";
          unit = "kWh";
        } else if (controlType.includes("switch") || controlType.includes("schalter")) {
          sensorType = "switch";
        } else if (controlType.includes("dimmer") || controlType.includes("light")) {
          sensorType = "light";
          unit = "%";
        } else if (controlType.includes("jalousie") || controlType.includes("blind")) {
          sensorType = "blind";
          unit = "%";
        } else if (controlType.includes("infoonlyanalog")) {
          sensorType = "analog";
        } else if (controlType.includes("infoonlydigital")) {
          sensorType = "digital";
        } else if (controlType.includes("pushbutton") || controlType.includes("taster")) {
          sensorType = "button";
        } else if (controlType.includes("presence") || controlType.includes("motion")) {
          sensorType = "motion";
        }

        // Get the fetched value
        const stateData = stateValues[uuid];
        let value = "-";
        let displayStateName = "";
        
        if (stateData?.value !== null && stateData?.value !== undefined) {
          displayStateName = stateData.stateName;
          const rawValue = stateData.value;
          
          if (typeof rawValue === "number") {
            if (sensorType === "switch" || sensorType === "digital") {
              value = rawValue > 0 ? "Ein" : "Aus";
              unit = "";
            } else if (sensorType === "power") {
              // Format large numbers with thousands separator
              value = rawValue.toLocaleString("de-DE", { maximumFractionDigits: 0 });
            } else if (sensorType === "temperature") {
              value = rawValue.toFixed(1);
            } else {
              value = rawValue.toFixed(2);
            }
          } else {
            value = String(rawValue);
          }
        }

        sensors.push({
          id: uuid,
          name: control.name || "Unbekannt",
          type: sensorType,
          controlType: control.type,
          room: roomName,
          category: catName,
          value: value,
          unit: unit,
          status: stateData?.value !== null ? "online" : "offline",
          stateName: displayStateName,
        });
      }

      // Sort sensors: those with values first
      sensors.sort((a, b) => {
        if (a.value !== "-" && b.value === "-") return -1;
        if (a.value === "-" && b.value !== "-") return 1;
        return a.name.localeCompare(b.name);
      });

      console.log(`Parsed ${sensors.length} sensors with values`);
      await updateSyncStatus(supabase, locationIntegrationId, "success");

      return new Response(
        JSON.stringify({ success: true, sensors }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unbekannte Aktion: ${action}`);
  } catch (error) {
    console.error("Loxone API error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unbekannter Fehler" 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
