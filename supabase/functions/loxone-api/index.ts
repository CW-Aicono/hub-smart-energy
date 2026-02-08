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

interface StateValueResult {
  value: number | string | null;
  stateName: string;
  secondaryValue?: number | string | null;
  secondaryStateName?: string;
  secondaryUnit?: string;
}

// Resolve Loxone Cloud DNS by following the redirect
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
    if (data?.LL?.value !== undefined) {
      const val = data.LL.value;
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

// Check if control is an energy monitor type
function isEnergyMonitor(controlType: string): boolean {
  const ct = controlType.toLowerCase();
  return ct.includes("meter") || ct.includes("zähler") || ct.includes("energymonitor");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    const { locationIntegrationId, action, sensorName } = requestBody;

    if (!locationIntegrationId) {
      throw new Error("Location Integration ID ist erforderlich");
    }

    console.log(`Loxone API request: action=${action}, locationIntegrationId=${locationIntegrationId}, sensorName=${sensorName || "N/A"}`);

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
      // For energy monitors, we want both Pf (power) and Mrc (meter reading)
      interface StateQuery {
        controlUuid: string;
        stateName: string;
        stateUuid: string;
        isPrimary: boolean;
      }
      
      const stateUuidsToQuery: StateQuery[] = [];
      
      for (const [uuid, control] of Object.entries(controls)) {
        if (!control.states) continue;
        
        const controlType = control.type || "";
        
        if (isEnergyMonitor(controlType)) {
          // For energy monitors, query both Pf (power in kW) and Mrc (meter reading in kWh)
          if (control.states["Pf"]) {
            stateUuidsToQuery.push({
              controlUuid: uuid,
              stateName: "Pf",
              stateUuid: control.states["Pf"],
              isPrimary: true,
            });
          }
          if (control.states["Mrc"]) {
            stateUuidsToQuery.push({
              controlUuid: uuid,
              stateName: "Mrc",
              stateUuid: control.states["Mrc"],
              isPrimary: control.states["Pf"] ? false : true, // Secondary if Pf exists
            });
          }
          // If neither Pf nor Mrc, try other common states
          if (!control.states["Pf"] && !control.states["Mrc"]) {
            const fallbackStates = ["value", "actual", "Mrt"];
            for (const stateName of fallbackStates) {
              if (control.states[stateName]) {
                stateUuidsToQuery.push({
                  controlUuid: uuid,
                  stateName,
                  stateUuid: control.states[stateName],
                  isPrimary: true,
                });
                break;
              }
            }
          }
        } else {
          // For other controls, prioritize certain state names
          const priorityStates = ["value", "actual", "position", "level", "brightness", "temperature"];
          let found = false;
          for (const stateName of priorityStates) {
            if (control.states[stateName]) {
              stateUuidsToQuery.push({
                controlUuid: uuid,
                stateName,
                stateUuid: control.states[stateName],
                isPrimary: true,
              });
              found = true;
              break;
            }
          }
          // If no priority state found, take the first available
          if (!found) {
            const firstStateName = Object.keys(control.states)[0];
            if (firstStateName) {
              stateUuidsToQuery.push({
                controlUuid: uuid,
                stateName: firstStateName,
                stateUuid: control.states[firstStateName],
                isPrimary: true,
              });
            }
          }
        }
      }

      console.log(`Querying ${stateUuidsToQuery.length} state values...`);

      // Batch fetch state values
      const stateResults: Record<string, StateValueResult> = {};
      const batchSize = 10;
      
      for (let i = 0; i < stateUuidsToQuery.length; i += batchSize) {
        const batch = stateUuidsToQuery.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async (item) => {
            const value = await fetchStateValue(baseUrl, authHeader, item.stateUuid);
            return { ...item, value };
          })
        );
        
        for (const result of results) {
          if (!stateResults[result.controlUuid]) {
            stateResults[result.controlUuid] = {
              value: null,
              stateName: "",
            };
          }
          
          if (result.isPrimary) {
            stateResults[result.controlUuid].value = result.value;
            stateResults[result.controlUuid].stateName = result.stateName;
          } else {
            // Secondary value (e.g., Mrc for energy monitors)
            stateResults[result.controlUuid].secondaryValue = result.value;
            stateResults[result.controlUuid].secondaryStateName = result.stateName;
            stateResults[result.controlUuid].secondaryUnit = result.stateName === "Mrc" ? "kWh" : "";
          }
        }
      }

      console.log(`Fetched values for ${Object.keys(stateResults).length} controls`);

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
        } else if (isEnergyMonitor(control.type || "")) {
          sensorType = "power";
          unit = "kW"; // Primary value is power in kW
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

        // Get the fetched value(s)
        const stateData = stateResults[uuid];
        let value = "-";
        let displayStateName = "";
        let secondaryValue = "";
        let secondaryStateName = "";
        let secondaryUnit = "";
        
        if (stateData?.value !== null && stateData?.value !== undefined) {
          displayStateName = stateData.stateName;
          const rawValue = stateData.value;
          
          if (typeof rawValue === "number") {
            if (sensorType === "switch" || sensorType === "digital") {
              value = rawValue > 0 ? "Ein" : "Aus";
              unit = "";
            } else if (sensorType === "power") {
              // Format power value with decimals
              value = rawValue.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            } else if (sensorType === "temperature") {
              value = rawValue.toFixed(1);
            } else {
              value = rawValue.toFixed(2);
            }
          } else {
            value = String(rawValue);
          }
        }

        // Handle secondary value (Mrc for energy monitors)
        if (stateData?.secondaryValue !== null && stateData?.secondaryValue !== undefined) {
          secondaryStateName = stateData.secondaryStateName || "";
          secondaryUnit = stateData.secondaryUnit || "kWh";
          const rawSecondary = stateData.secondaryValue;
          
          if (typeof rawSecondary === "number") {
            secondaryValue = rawSecondary.toLocaleString("de-DE", { maximumFractionDigits: 0 });
          } else {
            secondaryValue = String(rawSecondary);
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
          status: (stateData?.value !== null || stateData?.secondaryValue !== null) ? "online" : "offline",
          stateName: displayStateName,
          secondaryValue: secondaryValue,
          secondaryStateName: secondaryStateName,
          secondaryUnit: secondaryUnit,
        });
      }

      // Sort sensors: those with values first, then by name
      sensors.sort((a, b) => {
        const aHasValue = a.value !== "-" || a.secondaryValue !== "";
        const bHasValue = b.value !== "-" || b.secondaryValue !== "";
        if (aHasValue && !bHasValue) return -1;
        if (!aHasValue && bHasValue) return 1;
        return a.name.localeCompare(b.name);
      });

      console.log(`Parsed ${sensors.length} sensors with values`);
      await updateSyncStatus(supabase, locationIntegrationId, "success");

      return new Response(
        JSON.stringify({ success: true, sensors }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // New action: get all states for a specific sensor
    if (action === "getSensorDetails") {
      if (!sensorName) {
        throw new Error("sensorName ist erforderlich für getSensorDetails");
      }
      
      console.log(`Searching for sensor: "${sensorName}"`);
      
      const structureUrl = `${baseUrl}/data/LoxAPP3.json`;
      console.log(`Fetching structure: ${structureUrl}`);

      const structureResponse = await fetch(structureUrl, {
        method: "GET",
        headers: { Authorization: authHeader },
      });

      if (!structureResponse.ok) {
        throw new Error(`Struktur konnte nicht geladen werden: ${structureResponse.status}`);
      }

      const structure: LoxoneStructure = await structureResponse.json();
      const controls = structure.controls || {};
      
      // Find all sensors matching the name
      const matchingControls: Array<{ uuid: string; control: LoxoneControl }> = [];
      
      for (const [uuid, control] of Object.entries(controls)) {
        if (control.name && control.name.toLowerCase().includes(sensorName.toLowerCase())) {
          matchingControls.push({ uuid, control });
        }
      }
      
      console.log(`Found ${matchingControls.length} sensors matching "${sensorName}"`);
      
      if (matchingControls.length === 0) {
        // List all sensor names for debugging
        const allNames = Object.values(controls).map(c => c.name).filter(Boolean);
        console.log(`Available sensors: ${allNames.join(", ")}`);
        throw new Error(`Sensor "${sensorName}" nicht gefunden. Verfügbar: ${allNames.slice(0, 10).join(", ")}...`);
      }
      
      // Fetch all state values for all matching controls
      const results = [];
      
      for (const { uuid: targetUuid, control: targetControl } of matchingControls) {
        console.log(`Found sensor: ${targetControl.name} (${targetControl.type})`);
        console.log(`Available states: ${JSON.stringify(Object.keys(targetControl.states || {}))}`);
        
        const stateValues: Record<string, { uuid: string; value: number | string | null }> = {};
        const states = targetControl.states || {};
        
        for (const [stateName, stateUuid] of Object.entries(states)) {
          const value = await fetchStateValue(baseUrl, authHeader, stateUuid);
          stateValues[stateName] = { uuid: stateUuid, value };
          console.log(`State ${stateName}: ${value}`);
        }
        
        results.push({
          uuid: targetUuid,
          name: targetControl.name,
          type: targetControl.type,
          states: stateValues,
        });
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          sensors: results,
          count: results.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // New action: list all sensor names and types
    if (action === "listAllSensors") {
      const structureUrl = `${baseUrl}/data/LoxAPP3.json`;
      console.log(`Fetching structure for sensor list: ${structureUrl}`);

      const structureResponse = await fetch(structureUrl, {
        method: "GET",
        headers: { Authorization: authHeader },
      });

      if (!structureResponse.ok) {
        throw new Error(`Struktur konnte nicht geladen werden: ${structureResponse.status}`);
      }

      const structure: LoxoneStructure = await structureResponse.json();
      const controls = structure.controls || {};
      
      const sensorList = Object.entries(controls).map(([uuid, control]) => ({
        uuid,
        name: control.name,
        type: control.type,
        stateNames: Object.keys(control.states || {}),
      }));
      
      // Group by type
      const typeGroups: Record<string, string[]> = {};
      for (const sensor of sensorList) {
        const type = sensor.type || "unknown";
        if (!typeGroups[type]) typeGroups[type] = [];
        typeGroups[type].push(sensor.name);
      }
      
      // Find sensors with Pf/Mrc states
      const sensorsWithPfMrc = sensorList.filter(s => 
        s.stateNames.includes("Pf") || 
        s.stateNames.includes("Mrc") || 
        s.stateNames.includes("Mrd")
      );
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          sensors: sensorList,
          count: sensorList.length,
          typeGroups,
          sensorsWithPfMrc,
        }),
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
