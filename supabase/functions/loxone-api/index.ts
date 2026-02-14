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
  totalDay?: number | null;
}

// ── Control-type-specific state mapping table ──
interface StateMapping {
  primaryState: string;
  primaryUnit: string;
  secondaryState?: string;
  secondaryUnit?: string;
  sensorType: string;
}

const CONTROL_TYPE_MAPPINGS: Record<string, StateMapping> = {
  Meter:          { primaryState: "actual",   primaryUnit: "kW",  secondaryState: "total",    secondaryUnit: "kWh", sensorType: "power" },
  EFM:            { primaryState: "Ppwr",     primaryUnit: "kW",  secondaryState: "Gpwr",     secondaryUnit: "kW",  sensorType: "power" },
  EnergyManager2: { primaryState: "Gpwr",     primaryUnit: "kW",  secondaryState: "Ppwr",     secondaryUnit: "kW",  sensorType: "power" },
  Fronius:        { primaryState: "consCurr", primaryUnit: "kW",  secondaryState: "prodCurr", secondaryUnit: "kW",  sensorType: "power" },
  InfoOnlyAnalog: { primaryState: "value",    primaryUnit: "",    sensorType: "analog" },
  InfoOnlyDigital:{ primaryState: "active",   primaryUnit: "",    sensorType: "digital" },
  Pushbutton:     { primaryState: "active",   primaryUnit: "",    sensorType: "button" },
  TextState:      { primaryState: "textAndIcon", primaryUnit: "", sensorType: "text" },
};

// Mapping from Loxone /all output names to our internal state names
const LOXONE_OUTPUT_TO_STATE: Record<string, string> = {
  "Pf": "actual",       // Power (Leistung)
  "Mr": "total",        // Meter reading total (Zählerstand)
  "Mrc": "total",       // Meter reading consumption total
  "Mrd": "total",       // Meter reading delivery total
  "Rd": "totalDay",     // Reading day
  "Rdc": "totalDay",    // Reading day consumption
  "Rdd": "totalDay",    // Reading day delivery
  "Rw": "totalWeek",    // Reading week
  "Rwc": "totalWeek",   // Reading week consumption
  "Rwd": "totalWeek",   // Reading week delivery
  "Rm": "totalMonth",   // Reading month
  "Rmc": "totalMonth",  // Reading month consumption
  "Rmd": "totalMonth",  // Reading month delivery
  "Ry": "totalYear",    // Reading year
  "Ryc": "totalYear",   // Reading year consumption
  "Ryd": "totalYear",   // Reading year delivery
  "Rld": "totalDayLast",
  "Rldc": "totalDayLast",
  "Rldd": "totalDayLast",
  "Rlw": "totalWeekLast",
  "Rlm": "totalMonthLast",
  "Rly": "totalYearLast",
  "Ppwr": "Ppwr",       // Production power
  "Gpwr": "Gpwr",       // Grid power
  "consCurr": "consCurr",
  "prodCurr": "prodCurr",
};

// States to never use as fallback
const IGNORED_STATES = new Set(["jLocked", "locked"]);

// Fallback priority list for unknown control types
const FALLBACK_STATES = ["value", "actual", "position", "level", "brightness", "temperature"];

function getStateMapping(controlType: string, availableStates: string[]): { primary?: string; secondary?: string; mapping?: StateMapping } {
  // 1. Check exact match in mapping table
  const mapping = CONTROL_TYPE_MAPPINGS[controlType];
  if (mapping) {
    const primary = availableStates.includes(mapping.primaryState) ? mapping.primaryState : undefined;
    const secondary = mapping.secondaryState && availableStates.includes(mapping.secondaryState) ? mapping.secondaryState : undefined;
    return { primary, secondary, mapping };
  }

  // 2. Fallback: use priority list, skip ignored states
  for (const stateName of FALLBACK_STATES) {
    if (availableStates.includes(stateName)) {
      return { primary: stateName };
    }
  }

  // 3. Last resort: first available state that isn't ignored
  const firstUsable = availableStates.find(s => !IGNORED_STATES.has(s));
  return { primary: firstUsable };
}

// Determine sensorType and unit from control type string (for types not in the mapping table)
function detectSensorMeta(controlType: string): { sensorType: string; unit: string } {
  const ct = controlType.toLowerCase();
  if (ct.includes("temperature") || ct.includes("temp")) return { sensorType: "temperature", unit: "°C" };
  if (ct.includes("humidity") || ct.includes("feuchte")) return { sensorType: "humidity", unit: "%" };
  if (ct.includes("switch") || ct.includes("schalter")) return { sensorType: "switch", unit: "" };
  if (ct.includes("dimmer") || ct.includes("light")) return { sensorType: "light", unit: "%" };
  if (ct.includes("jalousie") || ct.includes("blind")) return { sensorType: "blind", unit: "%" };
  if (ct.includes("presence") || ct.includes("motion")) return { sensorType: "motion", unit: "" };
  if (ct.includes("meter") || ct.includes("zähler") || ct.includes("energymonitor")) return { sensorType: "power", unit: "kW" };
  return { sensorType: "unknown", unit: "" };
}

// Resolve Loxone Cloud DNS by following the redirect
async function resolveLoxoneCloudURL(serialNumber: string): Promise<string | null> {
  try {
    const dnsUrl = `http://dns.loxonecloud.com/${serialNumber}`;
    console.log(`Resolving via Loxone Cloud redirect: ${dnsUrl}`);
    const response = await fetch(dnsUrl, { method: "HEAD", redirect: "follow" });
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

// Fetch state value using control UUID (not state UUID!)
// Loxone HTTP API: /jdev/sps/io/{controlUuid}/state returns primary value
async function fetchStateValue(
  baseUrl: string,
  authHeader: string,
  controlUuid: string
): Promise<number | string | null> {
  try {
    const url = `${baseUrl}/jdev/sps/io/${controlUuid}/state`;
    console.log(`Fetching state: ${url}`);
    const response = await fetch(url, { method: "GET", headers: { Authorization: authHeader } });
    if (!response.ok) {
      console.warn(`State fetch failed for ${controlUuid}: HTTP ${response.status}`);
      return null;
    }
    const data = await response.json();
    console.log(`State response for ${controlUuid}:`, JSON.stringify(data).substring(0, 200));
    if (data?.LL?.value !== undefined) {
      const val = data.LL.value;
      const numVal = parseFloat(val);
      return isNaN(numVal) ? val : numVal;
    }
    return null;
  } catch (err) {
    console.error(`Error fetching state ${controlUuid}:`, err);
    return null;
  }
}

// Fetch all states of a control using /all endpoint
async function fetchAllStates(
  baseUrl: string,
  authHeader: string,
  controlUuid: string
): Promise<Record<string, number | string | null>> {
  const results: Record<string, number | string | null> = {};
  try {
    const url = `${baseUrl}/jdev/sps/io/${controlUuid}/all`;
    console.log(`Fetching all states: ${url}`);
    const response = await fetch(url, { method: "GET", headers: { Authorization: authHeader } });
    if (!response.ok) {
      console.warn(`All-states fetch failed for ${controlUuid}: HTTP ${response.status}`);
      return results;
    }
    const data = await response.json();
    console.log(`All-states response for ${controlUuid}: ${JSON.stringify(data).substring(0, 500)}`);
    
    if (data?.LL) {
      const ll = data.LL;
      // Primary value
      if (ll.value !== undefined) {
        const numVal = parseFloat(String(ll.value));
        results["_primary"] = isNaN(numVal) ? String(ll.value) : numVal;
      }
      // Parse output0, output1, ... which contain { name, nr, value }
      for (const key of Object.keys(ll)) {
        if (key.startsWith("output")) {
          const output = ll[key];
          if (output?.name !== undefined && output?.value !== undefined) {
            const numVal = parseFloat(String(output.value));
            results[output.name] = isNaN(numVal) ? String(output.value) : numVal;
          }
        }
      }
    }
  } catch (err) {
    console.error(`Error fetching all states for ${controlUuid}:`, err);
  }
  return results;
}

// Update sync status in database
async function updateSyncStatus(
  supabase: ReturnType<typeof createClient>,
  locationIntegrationId: string,
  status: "success" | "error" | "syncing"
) {
  await supabase
    .from("location_integrations")
    .update({ sync_status: status, last_sync_at: new Date().toISOString() })
    .eq("id", locationIntegrationId);
  console.log(`Updated sync_status to: ${status}`);
}

// Format a numeric value for display
function formatValue(rawValue: number | string, sensorType: string): string {
  if (typeof rawValue === "number") {
    if (sensorType === "switch" || sensorType === "digital" || sensorType === "button") {
      return rawValue > 0 ? "Ein" : "Aus";
    }
    if (sensorType === "power") {
      return rawValue.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (sensorType === "temperature") {
      return rawValue.toFixed(1);
    }
    return rawValue.toFixed(2);
  }
  return String(rawValue);
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
    if (!config?.serial_number) throw new Error("Seriennummer nicht konfiguriert");
    if (!config.username || !config.password) throw new Error("Benutzername oder Passwort nicht konfiguriert");

    console.log(`Config: serial=${config.serial_number}, user=${config.username}`);

    const baseUrl = await resolveLoxoneCloudURL(config.serial_number);
    if (!baseUrl) {
      await updateSyncStatus(supabase, locationIntegrationId, "error");
      throw new Error("Cloud DNS Auflösung fehlgeschlagen. Miniserver nicht erreichbar.");
    }

    const credentials = btoa(`${config.username}:${config.password}`);
    const authHeader = `Basic ${credentials}`;

    // ── ACTION: test ──
    if (action === "test") {
      const testUrl = `${baseUrl}/jdev/cfg/api`;
      console.log(`Testing connection: ${testUrl}`);
      const response = await fetch(testUrl, { method: "GET", headers: { Authorization: authHeader } });
      if (!response.ok) {
        await updateSyncStatus(supabase, locationIntegrationId, "error");
        throw new Error(`Verbindung fehlgeschlagen: ${response.status}`);
      }
      const data = await response.json();
      await updateSyncStatus(supabase, locationIntegrationId, "success");
      return new Response(JSON.stringify({ success: true, data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACTION: getSensors ──
    if (action === "getSensors") {
      await updateSyncStatus(supabase, locationIntegrationId, "syncing");

      const structureUrl = `${baseUrl}/data/LoxAPP3.json`;
      console.log(`Fetching structure: ${structureUrl}`);
      const structureResponse = await fetch(structureUrl, { method: "GET", headers: { Authorization: authHeader } });

      if (!structureResponse.ok) {
        await updateSyncStatus(supabase, locationIntegrationId, "error");
        if (structureResponse.status === 401) throw new Error("Authentifizierung fehlgeschlagen.");
        throw new Error(`Struktur konnte nicht geladen werden: ${structureResponse.status}`);
      }

      const structure: LoxoneStructure = await structureResponse.json();
      const controls = structure.controls || {};
      const rooms = structure.rooms || {};
      const categories = structure.cats || {};

      console.log(`Loaded structure with ${Object.keys(controls).length} controls`);

      // Collect control UUIDs that need state fetching
      const controlUuids = Object.keys(controls);

      console.log(`Querying states for ${controlUuids.length} controls via /all endpoint...`);

      // Batch fetch all states using control UUIDs
      const stateResults: Record<string, StateValueResult> = {};
      const batchSize = 20;

      for (let i = 0; i < controlUuids.length; i += batchSize) {
        const batch = controlUuids.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async (controlUuid) => {
            const allStates = await fetchAllStates(baseUrl, authHeader, controlUuid);
            return { controlUuid, allStates };
          })
        );

        for (const { controlUuid, allStates } of results) {
          const control = controls[controlUuid];
          const controlType = control?.type || "";
          const mapping = CONTROL_TYPE_MAPPINGS[controlType];

          // Map Loxone output names to our state names
          const mappedStates: Record<string, number | string | null> = {};
          for (const [outputName, value] of Object.entries(allStates)) {
            if (outputName === "_primary") continue;
            const stateName = LOXONE_OUTPUT_TO_STATE[outputName] || outputName;
            mappedStates[stateName] = value;
          }

          // Determine primary and secondary values
          let primaryStateName = "";
          let primaryValue: number | string | null = null;
          let secondaryStateName = "";
          let secondaryValue: number | string | null = null;
          let secondaryUnit = "";

          if (mapping) {
            primaryStateName = mapping.primaryState;
            primaryValue = mappedStates[mapping.primaryState] ?? allStates["_primary"] ?? null;
            if (mapping.secondaryState) {
              secondaryStateName = mapping.secondaryState;
              secondaryValue = mappedStates[mapping.secondaryState] ?? null;
              secondaryUnit = mapping.secondaryUnit || "";
            }
          } else {
            // Fallback: use _primary value
            primaryValue = allStates["_primary"] ?? null;
            primaryStateName = "value";
          }

          // Extract totalDay from mapped states
          // Priority: Rd/Rdc/Rdd (mapped to "totalDay"), then Cd (consumption day for EFM/EnergyManager2)
          const totalDayRaw = mappedStates["totalDay"] ?? mappedStates["Cd"] ?? allStates["Cd"] ?? null;
          const totalDay = totalDayRaw !== null ? (typeof totalDayRaw === "number" ? totalDayRaw : parseFloat(String(totalDayRaw))) : null;

          stateResults[controlUuid] = {
            value: primaryValue,
            stateName: primaryStateName,
            secondaryValue,
            secondaryStateName,
            secondaryUnit,
            totalDay: totalDay !== null && !isNaN(totalDay) ? totalDay : null,
          };
        }
      }

      console.log(`Fetched values for ${Object.keys(stateResults).length} controls`);

      // Build sensors array
      const sensors = [];

      for (const [uuid, control] of Object.entries(controls)) {
        const roomName = control.room ? rooms[control.room]?.name || "Unbekannt" : "Unbekannt";
        const catName = control.cat ? categories[control.cat]?.name || "Sonstige" : "Sonstige";
        const controlType = control.type || "";

        // Determine sensor type and unit – mapping table takes priority
        const mappingEntry = CONTROL_TYPE_MAPPINGS[controlType];
        let sensorType: string;
        let unit: string;

        if (mappingEntry) {
          sensorType = mappingEntry.sensorType;
          unit = mappingEntry.primaryUnit;
        } else {
          const detected = detectSensorMeta(controlType);
          sensorType = detected.sensorType;
          unit = detected.unit;
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
          value = formatValue(stateData.value, sensorType);
          // Clear unit for switch-like types
          if (sensorType === "switch" || sensorType === "digital" || sensorType === "button") {
            unit = "";
          }
        }

        if (stateData?.secondaryValue !== null && stateData?.secondaryValue !== undefined) {
          secondaryStateName = stateData.secondaryStateName || "";
          secondaryUnit = stateData.secondaryUnit || (mappingEntry?.secondaryUnit || "");
          const rawSecondary = stateData.secondaryValue;
          if (typeof rawSecondary === "number") {
            secondaryValue = rawSecondary.toLocaleString("de-DE", { maximumFractionDigits: secondaryUnit === "kWh" ? 0 : 2 });
          } else {
            secondaryValue = String(rawSecondary);
          }
        }

        // Compute rawValue as a proper number (not German-formatted string)
        let rawValue: number | null = null;
        if (stateData?.value !== null && stateData?.value !== undefined) {
          rawValue = typeof stateData.value === "number" ? stateData.value : parseFloat(String(stateData.value));
          if (isNaN(rawValue)) rawValue = null;
        }

        sensors.push({
          id: uuid,
          name: control.name || "Unbekannt",
          type: sensorType,
          controlType: control.type,
          room: roomName,
          category: catName,
          value,
          rawValue,
          unit,
          status: (stateData?.value !== null || stateData?.secondaryValue !== null) ? "online" : "offline",
          stateName: displayStateName,
          secondaryValue,
          secondaryStateName,
          secondaryUnit,
          totalDay: stateData?.totalDay ?? null,
        });
      }

      // Sort: sensors with values first, then by name
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

    // ── ACTION: getSensorDetails ──
    if (action === "getSensorDetails") {
      if (!sensorName) throw new Error("sensorName ist erforderlich für getSensorDetails");

      console.log(`Searching for sensor: "${sensorName}"`);
      const structureUrl = `${baseUrl}/data/LoxAPP3.json`;
      const structureResponse = await fetch(structureUrl, { method: "GET", headers: { Authorization: authHeader } });
      if (!structureResponse.ok) throw new Error(`Struktur konnte nicht geladen werden: ${structureResponse.status}`);

      const structure: LoxoneStructure = await structureResponse.json();
      const controls = structure.controls || {};

      const matchingControls: Array<{ uuid: string; control: LoxoneControl }> = [];
      for (const [uuid, control] of Object.entries(controls)) {
        if (control.name && control.name.toLowerCase().includes(sensorName.toLowerCase())) {
          matchingControls.push({ uuid, control });
        }
      }

      console.log(`Found ${matchingControls.length} sensors matching "${sensorName}"`);
      if (matchingControls.length === 0) {
        const allNames = Object.values(controls).map(c => c.name).filter(Boolean);
        throw new Error(`Sensor "${sensorName}" nicht gefunden. Verfügbar: ${allNames.slice(0, 10).join(", ")}...`);
      }

      const results = [];
      for (const { uuid: targetUuid, control: targetControl } of matchingControls) {
        console.log(`Found sensor: ${targetControl.name} (${targetControl.type})`);
        
        // Use control UUID to fetch state value and all states
        const primaryValue = await fetchStateValue(baseUrl, authHeader, targetUuid);
        const allStates = await fetchAllStates(baseUrl, authHeader, targetUuid);
        
        // Build reverse mapping: output name -> state name (e.g. "Pf" -> "actual")
        const reverseOutputMap: Record<string, string> = {};
        for (const [outputName, stateName] of Object.entries(LOXONE_OUTPUT_TO_STATE)) {
          reverseOutputMap[outputName] = stateName;
        }
        
        // Map allStates output names to state names and fill stateValues
        const stateValues: Record<string, { uuid: string; value: number | string | null }> = {};
        const states = targetControl.states || {};
        
        // Create forward map: state name -> output name
        const stateToOutput: Record<string, string> = {};
        for (const [outputName, stateName] of Object.entries(LOXONE_OUTPUT_TO_STATE)) {
          stateToOutput[stateName] = outputName;
        }
        
        for (const [stateName, stateUuid] of Object.entries(states)) {
          const outputName = stateToOutput[stateName];
          const value = outputName && allStates[outputName] !== undefined 
            ? allStates[outputName] 
            : allStates[stateName] !== undefined 
              ? allStates[stateName] 
              : null;
          stateValues[stateName] = { uuid: stateUuid, value };
        }
        
        results.push({ 
          uuid: targetUuid, 
          name: targetControl.name, 
          type: targetControl.type, 
          states: stateValues,
          primaryValue,
          allStatesRaw: allStates,
        });
      }

      return new Response(
        JSON.stringify({ success: true, sensors: results, count: results.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ACTION: listAllSensors ──
    if (action === "listAllSensors") {
      const structureUrl = `${baseUrl}/data/LoxAPP3.json`;
      const structureResponse = await fetch(structureUrl, { method: "GET", headers: { Authorization: authHeader } });
      if (!structureResponse.ok) throw new Error(`Struktur konnte nicht geladen werden: ${structureResponse.status}`);

      const structure: LoxoneStructure = await structureResponse.json();
      const controls = structure.controls || {};

      const sensorList = Object.entries(controls).map(([uuid, control]) => ({
        uuid, name: control.name, type: control.type, stateNames: Object.keys(control.states || {}),
      }));

      const typeGroups: Record<string, string[]> = {};
      for (const sensor of sensorList) {
        const type = sensor.type || "unknown";
        if (!typeGroups[type]) typeGroups[type] = [];
        typeGroups[type].push(sensor.name);
      }

      const sensorsWithPfMrc = sensorList.filter(s =>
        s.stateNames.includes("Pf") || s.stateNames.includes("Mrc") || s.stateNames.includes("Mrd")
      );

      return new Response(
        JSON.stringify({ success: true, sensors: sensorList, count: sensorList.length, typeGroups, sensorsWithPfMrc }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ACTION: executeCommand ──
    if (action === "executeCommand") {
      const { controlUuid, commandValue } = requestBody;
      if (!controlUuid) throw new Error("controlUuid ist erforderlich");
      
      // Default command: "pulse" (for Pushbutton), or specific value
      const cmd = commandValue !== undefined ? commandValue : "pulse";
      const cmdUrl = `${baseUrl}/jdev/sps/io/${controlUuid}/${cmd}`;
      console.log(`Executing command: ${cmdUrl}`);
      
      const response = await fetch(cmdUrl, {
        method: "GET",
        headers: { Authorization: authHeader },
      });
      
      if (!response.ok) {
        throw new Error(`Befehl fehlgeschlagen: HTTP ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`Command response:`, JSON.stringify(data).substring(0, 300));
      
      // Check Loxone response code (200 = OK)
      const code = data?.LL?.Code || data?.LL?.code;
      if (code && String(code) !== "200") {
        throw new Error(`Loxone meldet Fehler: Code ${code}`);
      }
      
      return new Response(
        JSON.stringify({ success: true, response: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unbekannte Aktion: ${action}`);
  } catch (error) {
    console.error("Loxone API error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unbekannter Fehler" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
