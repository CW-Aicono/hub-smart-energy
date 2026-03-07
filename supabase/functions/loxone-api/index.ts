import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

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
  totalWeek?: number | null;
  totalMonth?: number | null;
  totalYear?: number | null;
  totalMonthLast?: number | null;
  totalDayLast?: number | null;
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
  "Mrc": "totalConsumption",  // Meter reading consumption total
  "Mrd": "totalDelivery",     // Meter reading delivery total
  "Rd": "totalDay",           // Reading day (basic Meter)
  "Rdc": "totalDayConsumption", // Reading day consumption
  "Rdd": "totalDayDelivery",   // Reading day delivery
  "Rw": "totalWeek",
  "Rwc": "totalWeekConsumption",
  "Rwd": "totalWeekDelivery",
  "Rm": "totalMonth",
  "Rmc": "totalMonthConsumption",
  "Rmd": "totalMonthDelivery",
  "Ry": "totalYear",
  "Ryc": "totalYearConsumption",
  "Ryd": "totalYearDelivery",
  "Rld": "totalDayLast",
  "Rldc": "totalDayLastConsumption",
  "Rldd": "totalDayLastDelivery",
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
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── AUTH: Validate JWT and tenant ownership ──
    // Support both user JWT and service-role key (for server-to-server calls like periodic-sync)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Nicht authentifiziert" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const token = authHeader.replace("Bearer ", "");
    const isServiceRole = token === supabaseServiceKey;

    let userTenantId: string | null = null;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (isServiceRole) {
      // Server-to-server call (e.g. from loxone-periodic-sync) – skip user auth,
      // tenant will be resolved from the location_integration below
      console.log("Service-role call detected – skipping user JWT validation");
    } else {
      // Normal user call – validate JWT
      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ success: false, error: "Ungültiges Token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const userId = claimsData.claims.sub;

      // Get user's tenant_id
      const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("user_id", userId).single();
      if (!profile?.tenant_id) {
        return new Response(JSON.stringify({ success: false, error: "Kein Mandant zugeordnet" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      userTenantId = profile.tenant_id;
    }

    const requestBody = await req.json();
    const { locationIntegrationId, action, sensorName } = requestBody;

    if (!locationIntegrationId) {
      throw new Error("Location Integration ID ist erforderlich");
    }

    console.log(`Loxone API request: action=${action}, locationIntegrationId=${locationIntegrationId}, sensorName=${sensorName || "N/A"}`);

    const { data: locationIntegration, error: liError } = await supabase
      .from("location_integrations")
      .select("*, integration:integrations(*), location:locations!inner(tenant_id)")
      .eq("id", locationIntegrationId)
      .maybeSingle();

    if (liError || !locationIntegration) {
      console.error("Location integration not found:", liError);
      throw new Error("Standort-Integration nicht gefunden");
    }

    // Verify tenant ownership (skip for service-role calls)
    if (!isServiceRole && (locationIntegration as any).location?.tenant_id !== userTenantId) {
      return new Response(JSON.stringify({ success: false, error: "Zugriff verweigert" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
    const loxoneAuth = `Basic ${credentials}`;

    // ── ACTION: test ──
    if (action === "test") {
      const testUrl = `${baseUrl}/jdev/cfg/api`;
      console.log(`Testing connection: ${testUrl}`);
      const response = await fetch(testUrl, { method: "GET", headers: { Authorization: loxoneAuth } });
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
      const structureResponse = await fetch(structureUrl, { method: "GET", headers: { Authorization: loxoneAuth } });

      if (!structureResponse.ok) {
        await updateSyncStatus(supabase, locationIntegrationId, "error");
        if (structureResponse.status === 401) throw new Error("Authentifizierung fehlgeschlagen.");
        throw new Error(`Struktur konnte nicht geladen werden: ${structureResponse.status}`);
      }

      const structure = await structureResponse.json() as LoxoneStructure & { messageCenter?: any };
      const controls = structure.controls || {};
      const rooms = structure.rooms || {};
      const categories = structure.cats || {};

      // ── Parse messageCenter for system status messages ──
      const systemMessages: Array<{ uid: string; title: string; message: string; level: number; timestamp: string }> = [];
      try {
        const mc = (structure as any).messageCenter;
        if (mc) {
          // messageCenter can have different structures; look for entries/notifications
          const entries = mc.notifications || mc.entries || [];
          const entryList = Array.isArray(entries) ? entries : Object.values(entries);
          for (const entry of entryList) {
            const lvl = entry?.data?.lvl ?? entry?.lvl ?? 0;
            if (lvl >= 2) {
              systemMessages.push({
                uid: entry.uid || entry.id || String(entry.ts),
                title: entry.title || "",
                message: entry.desc || entry.message || "",
                level: lvl,
                timestamp: entry.ts ? new Date(entry.ts * 1000).toISOString() : new Date().toISOString(),
              });
            }
          }
        }
        console.log(`Parsed ${systemMessages.length} system status messages from messageCenter`);
      } catch (mcErr) {
        console.warn("Failed to parse messageCenter:", mcErr);
      }

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
            const allStates = await fetchAllStates(baseUrl, loxoneAuth, controlUuid);
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
              // For "total" (Zählerstand), pick direction based on available totals
              if (mapping.secondaryState === "total") {
                const delDay = mappedStates["totalDayDelivery"] != null ? Number(mappedStates["totalDayDelivery"]) : 0;
                const consDay = mappedStates["totalDayConsumption"] != null ? Number(mappedStates["totalDayConsumption"]) : 0;
                const delYear = mappedStates["totalYearDelivery"] != null ? Number(mappedStates["totalYearDelivery"]) : 0;
                const consYear = mappedStates["totalYearConsumption"] != null ? Number(mappedStates["totalYearConsumption"]) : 0;
                const isGen = (typeof primaryValue === "number" && primaryValue < 0) || (delDay > consDay) || (delYear > consYear);
                if (isGen) {
                  secondaryValue = mappedStates["totalDelivery"] ?? mappedStates["total"] ?? mappedStates["totalConsumption"] ?? null;
                } else {
                  secondaryValue = mappedStates["totalConsumption"] ?? mappedStates["total"] ?? mappedStates["totalDelivery"] ?? null;
                }
              } else {
                secondaryValue = mappedStates[mapping.secondaryState] ?? null;
              }
              secondaryUnit = mapping.secondaryUnit || "";
            }
          } else {
            // Fallback: use _primary value
            primaryValue = allStates["_primary"] ?? null;
            primaryStateName = "value";
          }

          // Determine meter direction: generator vs consumer
          // Use instantaneous power AND compare delivery vs consumption totals
          // to avoid misclassification when power is 0 (e.g. solar at night)
          const isNegativePower = typeof primaryValue === "number" && primaryValue < 0;
          const deliveryDay = mappedStates["totalDayDelivery"] != null ? Number(mappedStates["totalDayDelivery"]) : 0;
          const consumptionDay = mappedStates["totalDayConsumption"] != null ? Number(mappedStates["totalDayConsumption"]) : 0;
          const deliveryYear = mappedStates["totalYearDelivery"] != null ? Number(mappedStates["totalYearDelivery"]) : 0;
          const consumptionYear = mappedStates["totalYearConsumption"] != null ? Number(mappedStates["totalYearConsumption"]) : 0;
          // A meter is a generator if power is negative OR delivery totals exceed consumption totals
          const isGenerator = isNegativePower || (deliveryDay > consumptionDay) || (deliveryYear > consumptionYear);

          let totalDayRaw: number | string | null;
          if (isGenerator) {
            totalDayRaw = mappedStates["totalDayDelivery"]
              ?? mappedStates["totalDay"]
              ?? mappedStates["totalDayConsumption"]
              ?? mappedStates["Cd"]
              ?? allStates["Cd"]
              ?? null;
          } else {
            totalDayRaw = mappedStates["totalDayConsumption"]
              ?? mappedStates["totalDay"]
              ?? mappedStates["totalDayDelivery"]
              ?? mappedStates["Cd"]
              ?? allStates["Cd"]
              ?? null;
          }
          const totalDay = totalDayRaw !== null ? (typeof totalDayRaw === "number" ? totalDayRaw : parseFloat(String(totalDayRaw))) : null;

          // totalWeek
          const totalWeekRaw = isGenerator
            ? (mappedStates["totalWeekDelivery"] ?? mappedStates["totalWeek"] ?? mappedStates["totalWeekConsumption"] ?? null)
            : (mappedStates["totalWeekConsumption"] ?? mappedStates["totalWeek"] ?? mappedStates["totalWeekDelivery"] ?? null);
          const totalWeek = totalWeekRaw !== null ? (typeof totalWeekRaw === "number" ? totalWeekRaw : parseFloat(String(totalWeekRaw))) : null;

          // totalMonth
          const totalMonthRaw = isGenerator
            ? (mappedStates["totalMonthDelivery"] ?? mappedStates["totalMonth"] ?? mappedStates["totalMonthConsumption"] ?? null)
            : (mappedStates["totalMonthConsumption"] ?? mappedStates["totalMonth"] ?? mappedStates["totalMonthDelivery"] ?? null);
          const totalMonth = totalMonthRaw !== null ? (typeof totalMonthRaw === "number" ? totalMonthRaw : parseFloat(String(totalMonthRaw))) : null;

          // totalYear
          const totalYearRaw = isGenerator
            ? (mappedStates["totalYearDelivery"] ?? mappedStates["totalYear"] ?? mappedStates["totalYearConsumption"] ?? null)
            : (mappedStates["totalYearConsumption"] ?? mappedStates["totalYear"] ?? mappedStates["totalYearDelivery"] ?? null);
          const totalYear = totalYearRaw !== null ? (typeof totalYearRaw === "number" ? totalYearRaw : parseFloat(String(totalYearRaw))) : null;

          // totalMonthLast (Rlm) for archiving completed months
          const totalMonthLastRaw = isGenerator
            ? (mappedStates["totalMonthLastDelivery"] ?? mappedStates["totalMonthLast"] ?? null)
            : (mappedStates["totalMonthLastConsumption"] ?? mappedStates["totalMonthLast"] ?? null);
          const totalMonthLast = totalMonthLastRaw !== null ? (typeof totalMonthLastRaw === "number" ? totalMonthLastRaw : parseFloat(String(totalMonthLastRaw))) : null;

          // totalDayLast (Rldc/Rldd/Rld) for archiving yesterday's daily total
          const totalDayLastRaw = isGenerator
            ? (mappedStates["totalDayLastDelivery"] ?? mappedStates["totalDayLast"] ?? mappedStates["totalDayLastConsumption"] ?? null)
            : (mappedStates["totalDayLastConsumption"] ?? mappedStates["totalDayLast"] ?? mappedStates["totalDayLastDelivery"] ?? null);
          const totalDayLast = totalDayLastRaw !== null ? (typeof totalDayLastRaw === "number" ? totalDayLastRaw : parseFloat(String(totalDayLastRaw))) : null;

          stateResults[controlUuid] = {
            value: primaryValue,
            stateName: primaryStateName,
            secondaryValue,
            secondaryStateName,
            secondaryUnit,
            totalDay: totalDay !== null && !isNaN(totalDay) ? totalDay : null,
            totalWeek: totalWeek !== null && !isNaN(totalWeek) ? totalWeek : null,
            totalMonth: totalMonth !== null && !isNaN(totalMonth) ? totalMonth : null,
            totalYear: totalYear !== null && !isNaN(totalYear) ? totalYear : null,
            totalMonthLast: totalMonthLast !== null && !isNaN(totalMonthLast) ? totalMonthLast : null,
            totalDayLast: totalDayLast !== null && !isNaN(totalDayLast) ? totalDayLast : null,
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
          totalWeek: stateData?.totalWeek ?? null,
          totalMonth: stateData?.totalMonth ?? null,
          totalYear: stateData?.totalYear ?? null,
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

      // Auto-save instantaneous power readings for time-series charts
      try {
        const { data: linkedMeters } = await supabase
          .from("meters")
          .select("id, sensor_uuid, energy_type, tenant_id")
          .eq("location_integration_id", locationIntegrationId)
          .eq("capture_type", "automatic")
          .eq("is_archived", false);

        if (linkedMeters && linkedMeters.length > 0) {
          const now = new Date();
          // Previous month's first day for monthly archiving
          const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const periodStart = prevMonthDate.toISOString().split("T")[0];

          const monthUpserts: Array<{
            tenant_id: string;
            meter_id: string;
            period_type: string;
            period_start: string;
            total_value: number;
            energy_type: string;
            source: string;
          }> = [];

          const powerInserts: Array<{
            tenant_id: string;
            meter_id: string;
            power_value: number;
            energy_type: string;
            recorded_at: string;
          }> = [];

          // Spike-Detection: Fetch the last few power readings per meter to compute a baseline.
          // A new reading is considered a spike if it is > SPIKE_FACTOR × median of recent readings.
          // We use the last 6 readings (~30 min) as baseline window.
          const SPIKE_FACTOR = 3.0;    // value must be ≤ 3× the recent median to be accepted
          const SPIKE_BASELINE_MIN = 5; // only apply spike filter when baseline ≥ 5 kW (avoids false positives near zero)

          const meterIds = linkedMeters.map((m: any) => m.id).filter(Boolean);
          let recentReadingsMap: Record<string, number[]> = {};

          if (meterIds.length > 0) {
            const windowStart = new Date(now.getTime() - 35 * 60 * 1000).toISOString(); // 35-min window
            const { data: recentRows } = await supabase
              .from("meter_power_readings")
              .select("meter_id, power_value")
              .in("meter_id", meterIds)
              .gte("recorded_at", windowStart)
              .order("recorded_at", { ascending: false });

            if (recentRows) {
              for (const row of recentRows) {
                if (!recentReadingsMap[row.meter_id]) recentReadingsMap[row.meter_id] = [];
                if (recentReadingsMap[row.meter_id].length < 6) {
                  recentReadingsMap[row.meter_id].push(Number(row.power_value));
                }
              }
            }
          }

          const computeMedian = (vals: number[]): number => {
            if (vals.length === 0) return 0;
            const sorted = [...vals].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
          };

          for (const meter of linkedMeters) {
            if (!meter.sensor_uuid) continue;
            const stateData = stateResults[meter.sensor_uuid];

            // Archive completed month total (Rlm)
            if (stateData?.totalMonthLast != null && stateData.totalMonthLast > 0) {
              monthUpserts.push({
                tenant_id: meter.tenant_id,
                meter_id: meter.id,
                period_type: "month",
                period_start: periodStart,
                total_value: stateData.totalMonthLast,
                energy_type: meter.energy_type,
                source: "loxone",
              });
            }

            // Archive yesterday's daily total (Rldc/Rldd/Rld)
            if (stateData?.totalDayLast != null && stateData.totalDayLast > 0) {
              const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
              const yesterdayStr = yesterday.toISOString().split("T")[0];
              monthUpserts.push({
                tenant_id: meter.tenant_id,
                meter_id: meter.id,
                period_type: "day",
                period_start: yesterdayStr,
                total_value: stateData.totalDayLast,
                energy_type: meter.energy_type,
                source: "loxone",
              });
            }

            // Store instantaneous power reading for time-series (with spike filter)
            if (stateData?.value != null) {
              const powerVal = typeof stateData.value === "number" ? stateData.value : parseFloat(String(stateData.value));
              if (!isNaN(powerVal)) {
                const absVal = Math.abs(powerVal);
                const recentVals = recentReadingsMap[meter.id] ?? [];
                const median = computeMedian(recentVals);
                const isSpike = recentVals.length >= 3 && median >= SPIKE_BASELINE_MIN && absVal > median * SPIKE_FACTOR;

                if (isSpike) {
                  console.warn(
                    `Spike-Detection: Skipping power reading for meter ${meter.id} ` +
                    `(value=${absVal.toFixed(2)}, median=${median.toFixed(2)}, factor=${(absVal / median).toFixed(2)}×)`
                  );
                } else {
                  powerInserts.push({
                    tenant_id: meter.tenant_id,
                    meter_id: meter.id,
                    power_value: absVal,
                    energy_type: meter.energy_type,
                    recorded_at: now.toISOString(),
                  });
                }
              }
            }
          }

          if (monthUpserts.length > 0) {
            const { error: upsertError } = await supabase
              .from("meter_period_totals")
              .upsert(monthUpserts, { onConflict: "meter_id,period_type,period_start" });
            if (upsertError) {
              console.error("Error upserting period totals:", upsertError);
            } else {
              console.log(`Upserted ${monthUpserts.length} monthly period totals for ${periodStart}`);
            }
          }

          if (powerInserts.length > 0) {
            const { error: powerError } = await supabase
              .from("meter_power_readings")
              .insert(powerInserts);
            if (powerError) {
              console.error("Error inserting power readings:", powerError);
            } else {
              console.log(`Inserted ${powerInserts.length} power readings`);
            }
          }
        }
      } catch (archiveErr) {
        console.error("Error archiving data:", archiveErr);
      }

      await updateSyncStatus(supabase, locationIntegrationId, "success");

      return new Response(
        JSON.stringify({ success: true, sensors, systemMessages }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ACTION: getSensorDetails ──
    if (action === "getSensorDetails") {
      if (!sensorName) throw new Error("sensorName ist erforderlich für getSensorDetails");

      console.log(`Searching for sensor: "${sensorName}"`);
      const structureUrl = `${baseUrl}/data/LoxAPP3.json`;
      const structureResponse = await fetch(structureUrl, { method: "GET", headers: { Authorization: loxoneAuth } });
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
        const primaryValue = await fetchStateValue(baseUrl, loxoneAuth, targetUuid);
        const allStates = await fetchAllStates(baseUrl, loxoneAuth, targetUuid);
        
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
      const structureResponse = await fetch(structureUrl, { method: "GET", headers: { Authorization: loxoneAuth } });
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
        headers: { Authorization: loxoneAuth },
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

    // ── ACTION: getSystemStatus ──
    if (action === "getSystemStatus") {
      console.log("Fetching system status via individual endpoints");

      // Helper to fetch a single Loxone value endpoint
      async function fetchLoxoneValue(path: string): Promise<string | null> {
        try {
          const url = `${baseUrl}${path}`;
          console.log(`Fetching: ${url}`);
          const resp = await fetch(url, { method: "GET", headers: { Authorization: loxoneAuth } });
          if (!resp.ok) { console.warn(`${path} returned HTTP ${resp.status}`); return null; }
          const text = await resp.text();
          console.log(`${path} raw: ${text.substring(0, 300)}`);
          // Loxone returns XML like <LL control="..." value="123" Code="200"/>
          const valMatch = text.match(/value="([^"]+)"/i);
          if (valMatch) return valMatch[1];
          // Try JSON fallback
          try {
            const json = JSON.parse(text);
            if (json?.LL?.value !== undefined) return String(json.LL.value);
          } catch { /* not JSON */ }
          return null;
        } catch (err) {
          console.error(`Error fetching ${path}:`, err);
          return null;
        }
      }

      // Fetch CPU and heap in parallel; temperature is not directly available via HTTP API
      const [cpuRaw, heapRaw] = await Promise.all([
        fetchLoxoneValue("/jdev/sys/cpu"),
        fetchLoxoneValue("/jdev/sys/heap"),
      ]);

      // CPU value is a percentage number
      const cpu = cpuRaw;
      // Heap is free bytes – not a percentage, show as free KB
      let memory: string | null = null;
      if (heapRaw != null) {
        const heapNum = parseFloat(heapRaw);
        if (!isNaN(heapNum)) {
          memory = (heapNum / 1024).toFixed(0); // free KB
        }
      }

      // Try to get temperature from /data/status XML
      let temp: string | null = null;
      try {
        const statusResp = await fetch(`${baseUrl}/data/status`, { method: "GET", headers: { Authorization: loxoneAuth } });
        if (statusResp.ok) {
          const statusText = await statusResp.text();
          console.log(`/data/status raw: ${statusText.substring(0, 500)}`);
          const tempMatch = statusText.match(/Temp(?:erature)?="([^"]+)"/i);
          if (tempMatch) temp = tempMatch[1];
        }
      } catch (err) {
        console.warn("Could not fetch /data/status for temperature:", err);
      }

      return new Response(
        JSON.stringify({
          success: true,
          systemStatus: { cpu, temperature: temp, memory },
          lastSync: locationIntegration.last_sync_at,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ACTION: backfillStatistics ──
    // Downloads binary .LoxStat files from the Miniserver's /stats/ directory
    // and parses the binary format to extract historical readings.
    // Binary format (from reverse-engineering):
    //   Header: 3x uint32 LE (valueCount, controlType, nameLength)
    //   Then zero-terminated name string
    //   Then entries aligned to entrySize, each containing:
    //     - 2x uint16 (UUID parts) + 1x uint32 (Loxone timestamp) + N x float64 (values)
    //   Loxone timestamp = seconds since 2009-01-01 00:00:00 UTC
    if (action === "backfillStatistics") {
      const { fromDate, toDate } = requestBody;
      if (!fromDate || !toDate) throw new Error("fromDate und toDate sind erforderlich (YYYY-MM-DD)");

      console.log(`Backfill statistics (binary): ${fromDate} to ${toDate} for integration ${locationIntegrationId}`);

      const LOXONE_EPOCH_OFFSET = 1230768000; // 2009-01-01 00:00:00 UTC in Unix seconds

      // Helper: compute entry size based on value count (matches Loxone's rounding)
      function computeEntrySize(valueCount: number): number {
        let slots: number;
        if (valueCount > 7) slots = 10;
        else if (valueCount > 3) slots = 7;
        else if (valueCount > 1) slots = 3;
        else slots = 1;
        return 8 + slots * 8; // 8 bytes header (2x uint16 + 1x uint32) + N x 8 bytes (float64)
      }

      // 1) Get linked automatic meters with sensor_uuid
      const { data: linkedMeters } = await supabase
        .from("meters")
        .select("id, sensor_uuid, energy_type, tenant_id")
        .eq("location_integration_id", locationIntegrationId)
        .eq("capture_type", "automatic")
        .eq("is_archived", false);

      if (!linkedMeters || linkedMeters.length === 0) {
        return new Response(
          JSON.stringify({ success: true, message: "Keine verknüpften Messstellen gefunden", backfilled: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Found ${linkedMeters.length} linked meters for backfill`);

      // Build set of sensor UUIDs we care about (lowercase for matching)
      const meterBySensorUuid = new Map<string, typeof linkedMeters[0]>();
      for (const meter of linkedMeters) {
        if (meter.sensor_uuid) {
          meterBySensorUuid.set(meter.sensor_uuid.toLowerCase(), meter);
        }
      }

      // 2) List available stat files from /stats/ index
      const statsIndexUrl = `${baseUrl}/stats/`;
      console.log(`Fetching stats index: ${statsIndexUrl}`);
      const statsIndexResp = await fetch(statsIndexUrl, { method: "GET", headers: { Authorization: loxoneAuth } });
      if (!statsIndexResp.ok) {
        throw new Error(`Stats-Verzeichnis nicht erreichbar: HTTP ${statsIndexResp.status}`);
      }
      const statsIndexText = await statsIndexResp.text();
      console.log(`Stats index length: ${statsIndexText.length} chars`);
      console.log(`Stats index first 3000 chars: ${statsIndexText.substring(0, 3000)}`);

      // Extract filenames from directory listing HTML
      // Actual format from Loxone: "UUID_N.YYYYMM.xml" e.g. "1d575aad-03db-6497-ffffed57184a04d2_1.202501.xml"
      const availableFiles: Array<{ filename: string; uuid: string; yearMonth: string; statsGroup: number }> = [];

      // Extract href values from the HTML listing
      const hrefRegex = /href="([^"]+)"/gi;
      let hrefMatch;
      while ((hrefMatch = hrefRegex.exec(statsIndexText)) !== null) {
        const href = hrefMatch[1];
        // Pattern: UUID_N.YYYYMM.xml  (UUID may have hyphens, N is stat group number)
        const filePattern = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{16})_(\d+)\.(\d{6})\.xml$/i;
        const m = href.match(filePattern);
        if (m) {
          availableFiles.push({
            filename: href,
            uuid: m[1].toLowerCase(),
            yearMonth: m[3],
            statsGroup: parseInt(m[2], 10),
          });
        }
      }
      // Only use StatsGroup 1 ("actual" = power in kW). 
      // StatsGroup 2 ("total") contains cumulative meter readings, not power values.
      const powerFiles = availableFiles.filter(f => f.statsGroup === 1);
      console.log(`Found ${availableFiles.length} total stat files, ${powerFiles.length} power files (group 1)`)
      if (availableFiles.length > 0) {
        console.log(`First 10 files: ${availableFiles.slice(0, 10).map(f => `${f.filename} -> uuid=${f.uuid}, month=${f.yearMonth}`).join(" | ")}`);
      }

      // Determine needed months
      const startD = new Date(fromDate + "T00:00:00Z");
      const endD = new Date(toDate + "T23:59:59Z");
      const neededMonths = new Set<string>();
      for (let d = new Date(startD.getFullYear(), startD.getMonth(), 1); d <= endD; d.setMonth(d.getMonth() + 1)) {
        neededMonths.add(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`);
      }
      console.log(`Needed months: ${Array.from(neededMonths).join(", ")}`);

      // Also fetch structure to map statistic output UUIDs back to control UUIDs
      const structureUrl = `${baseUrl}/data/LoxAPP3.json`;
      const structureResponse = await fetch(structureUrl, { method: "GET", headers: { Authorization: loxoneAuth } });
      let statsUuidToControlUuid = new Map<string, string>();
      if (structureResponse.ok) {
        const structure = await structureResponse.json() as LoxoneStructure;
        for (const [controlUuid, control] of Object.entries(structure.controls || {})) {
          // Map control UUID to itself
          statsUuidToControlUuid.set(controlUuid.toLowerCase(), controlUuid.toLowerCase());
          // Map any statistic output UUIDs to the parent control UUID
          const stat = (control as any).statistic;
          if (stat?.outputs) {
            for (const outputKey of Object.keys(stat.outputs)) {
              const output = stat.outputs[outputKey];
              if (output?.uuid) {
                statsUuidToControlUuid.set(output.uuid.toLowerCase(), controlUuid.toLowerCase());
              }
            }
          }
        }
        console.log(`Built stats-to-control UUID map with ${statsUuidToControlUuid.size} entries`);
      }

      // Filter power files: match by sensor_uuid OR by stats UUID that maps to a sensor_uuid
      const filesToProcess = powerFiles.filter(f => {
        if (!neededMonths.has(f.yearMonth)) return false;
        if (meterBySensorUuid.has(f.uuid)) return true;
        const controlUuid = statsUuidToControlUuid.get(f.uuid);
        if (controlUuid && meterBySensorUuid.has(controlUuid)) return true;
        return false;
      });
      console.log(`Files to process after filtering: ${filesToProcess.length}`);

      let totalInserted = 0;
      const errors: string[] = [];
      let processedCount = 0;

      // 3) Download and parse each stat file (XML format)
      // Loxone stats XML format:
      // <Statistics>
      //   <Statistic UUID="..." Name="...">
      //     <S T="LoxoneTimestamp" V="value1" V2="value2" .../>
      //   </Statistic>
      // </Statistics>
      for (const file of filesToProcess) {
        const fileUrl = `${baseUrl}/stats/${file.filename}`;

        try {
          const resp = await fetch(fileUrl, { method: "GET", headers: { Authorization: loxoneAuth } });
          if (!resp.ok) {
            console.warn(`Failed to download ${file.filename}: HTTP ${resp.status}`);
            errors.push(`${file.filename}: HTTP ${resp.status}`);
            continue;
          }

          const text = await resp.text();
          const byteLen = text.length;
          
          if (byteLen < 20) {
            console.warn(`File ${file.filename} too small (${byteLen} chars), skipping`);
            continue;
          }

          // Log first 500 chars to understand format
          if (processedCount === 0) {
            console.log(`First file content sample (${file.filename}): ${text.substring(0, 500)}`);
          }

          // Determine which meter this file belongs to
          let meter = meterBySensorUuid.get(file.uuid);
          if (!meter) {
            const controlUuid = statsUuidToControlUuid.get(file.uuid);
            if (controlUuid) meter = meterBySensorUuid.get(controlUuid);
          }
          if (!meter) {
            console.warn(`No meter found for stats UUID ${file.uuid}, skipping`);
            continue;
          }

          // Parse XML entries: <S T="2026-03-01 01:00:00" V="value" .../>
          const entries: Array<{ timestamp: Date; value: number }> = [];
          const entryRegex = /<S\s+T="([^"]+)"([^/]*)\/?>/gi;
          let match;
          while ((match = entryRegex.exec(text)) !== null) {
            const tStr = match[1].trim();
            let date: Date;
            
            // Try date string format "YYYY-MM-DD HH:MM:SS"
            if (tStr.includes("-")) {
              date = new Date(tStr.replace(" ", "T") + "Z");
            } else {
              // Loxone numeric timestamp (seconds since 2009-01-01)
              const loxTimestamp = parseInt(tStr, 10);
              date = new Date((loxTimestamp + LOXONE_EPOCH_OFFSET) * 1000);
            }
            
            if (isNaN(date.getTime())) continue;

            // Filter by date range
            if (date < startD || date > endD) continue;

            // Extract V="value"
            const fullMatch = match[0];
            const valMatch = fullMatch.match(/\bV="([^"]+)"/);
            if (valMatch) {
              const val = parseFloat(valMatch[1]);
              if (isFinite(val)) {
                entries.push({ timestamp: date, value: Math.abs(val) });
              }
            }
          }

          console.log(`Parsed ${entries.length} entries from ${file.filename} in date range`);
          if (entries.length === 0) continue;

          processedCount++;
          entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

          // Group into 5-min buckets
          const buckets = new Map<string, { sum: number; count: number; max: number; day: string }>();
          for (const entry of entries) {
            const t = entry.timestamp;
            const bucketDate = new Date(t);
            bucketDate.setUTCMinutes(Math.floor(t.getUTCMinutes() / 5) * 5, 0, 0);
            const bucketKey = bucketDate.toISOString();
            const dayKey = t.toISOString().slice(0, 10);

            const existing = buckets.get(bucketKey);
            if (existing) {
              existing.sum += entry.value;
              existing.count += 1;
              existing.max = Math.max(existing.max, entry.value);
            } else {
              buckets.set(bucketKey, { sum: entry.value, count: 1, max: entry.value, day: dayKey });
            }
          }

          // Upsert into meter_power_readings_5min
          const fiveMinInserts = Array.from(buckets.entries()).map(([bucket, d]) => ({
            meter_id: meter!.id,
            tenant_id: meter!.tenant_id,
            energy_type: meter!.energy_type,
            bucket,
            power_avg: d.sum / d.count,
            power_max: d.max,
            sample_count: d.count,
          }));

          if (fiveMinInserts.length > 0) {
            for (let i = 0; i < fiveMinInserts.length; i += 500) {
              const chunk = fiveMinInserts.slice(i, i + 500);
              const { error: insertError } = await supabase
                .from("meter_power_readings_5min")
                .upsert(chunk, { onConflict: "meter_id,bucket" });
              if (insertError) {
                console.error(`Error upserting 5min data for ${file.filename}:`, insertError);
                errors.push(`${file.filename}: ${insertError.message}`);
              } else {
                totalInserted += chunk.length;
              }
            }
            console.log(`Upserted ${fiveMinInserts.length} 5-min buckets for ${file.filename}`);
          }

          // Compute and upsert daily totals
          const dailyTotals = new Map<string, number>();
          for (const [, d] of buckets) {
            const avg = d.sum / d.count;
            const kwh = avg * (5 / 60); // 5-min bucket → kWh
            dailyTotals.set(d.day, (dailyTotals.get(d.day) || 0) + kwh);
          }

          for (const [day, totalKwh] of dailyTotals) {
            if (totalKwh > 0) {
              await supabase
                .from("meter_period_totals")
                .upsert({
                  tenant_id: meter.tenant_id,
                  meter_id: meter.id,
                  period_type: "day",
                  period_start: day,
                  total_value: Math.round(totalKwh * 100) / 100,
                  energy_type: meter.energy_type,
                  source: "loxone_backfill",
                }, { onConflict: "meter_id,period_type,period_start" });
            }
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`Error processing ${file.filename}:`, errMsg);
          errors.push(`${file.filename}: ${errMsg}`);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Backfill abgeschlossen: ${totalInserted} Datenpunkte aus ${processedCount} Dateien nachgetragen`,
          backfilled: totalInserted,
          filesProcessed: processedCount,
          totalFilesFound: availableFiles.length,
          matchedFiles: filesToProcess.length,
          linkedMeterCount: linkedMeters.length,
          sensorUuids: linkedMeters.map(m => m.sensor_uuid).filter(Boolean),
          statsIndexSample: statsIndexText.substring(0, 1000),
          errors: errors.length > 0 ? errors : undefined,
        }),
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
