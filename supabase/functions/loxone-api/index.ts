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

// Fetch individual state value from Loxone
async function fetchStateValue(
  baseUrl: string,
  authHeader: string,
  stateUuid: string
): Promise<number | string | null> {
  try {
    const url = `${baseUrl}/jdev/sps/io/${stateUuid}/state`;
    const response = await fetch(url, { method: "GET", headers: { Authorization: authHeader } });
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

      // Collect state UUIDs to query using the mapping table
      interface StateQuery {
        controlUuid: string;
        stateName: string;
        stateUuid: string;
        isPrimary: boolean;
      }

      const stateUuidsToQuery: StateQuery[] = [];

      for (const [uuid, control] of Object.entries(controls)) {
        if (!control.states) continue;
        const availableStates = Object.keys(control.states);
        const controlType = control.type || "";

        const { primary, secondary } = getStateMapping(controlType, availableStates);

        if (primary && control.states[primary]) {
          stateUuidsToQuery.push({
            controlUuid: uuid,
            stateName: primary,
            stateUuid: control.states[primary],
            isPrimary: true,
          });
        }

        if (secondary && control.states[secondary]) {
          stateUuidsToQuery.push({
            controlUuid: uuid,
            stateName: secondary,
            stateUuid: control.states[secondary],
            isPrimary: false,
          });
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
            stateResults[result.controlUuid] = { value: null, stateName: "" };
          }

          if (result.isPrimary) {
            stateResults[result.controlUuid].value = result.value;
            stateResults[result.controlUuid].stateName = result.stateName;
          } else {
            stateResults[result.controlUuid].secondaryValue = result.value;
            stateResults[result.controlUuid].secondaryStateName = result.stateName;
            stateResults[result.controlUuid].secondaryUnit = result.stateName === "total" || result.stateName === "Mrc" ? "kWh" : "kW";
          }
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

        sensors.push({
          id: uuid,
          name: control.name || "Unbekannt",
          type: sensorType,
          controlType: control.type,
          room: roomName,
          category: catName,
          value,
          unit,
          status: (stateData?.value !== null || stateData?.secondaryValue !== null) ? "online" : "offline",
          stateName: displayStateName,
          secondaryValue,
          secondaryStateName,
          secondaryUnit,
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
        const stateValues: Record<string, { uuid: string; value: number | string | null }> = {};
        const states = targetControl.states || {};
        for (const [stateName, stateUuid] of Object.entries(states)) {
          const value = await fetchStateValue(baseUrl, authHeader, stateUuid);
          stateValues[stateName] = { uuid: stateUuid, value };
        }
        results.push({ uuid: targetUuid, name: targetControl.name, type: targetControl.type, states: stateValues });
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

    throw new Error(`Unbekannte Aktion: ${action}`);
  } catch (error) {
    console.error("Loxone API error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unbekannter Fehler" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
