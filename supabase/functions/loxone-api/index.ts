import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { isWorkerPrimary } from "../_shared/workerStatus.ts";
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

const LOXONE_FETCH_TIMEOUT_MS = 8_000;
const LOXONE_STATE_FETCH_TIMEOUT_MS = 2_500;
const LOXONE_STATE_BATCH_SIZE = 5;

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = LOXONE_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

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

// In-memory cache for resolved Cloud-DNS URLs (TTL 15 min).
// connect.loxonecloud.com rate-limits to ~10 req/min per IP.
const cloudUrlCache = new Map<string, { url: string; expiresAt: number }>();
const CLOUD_URL_TTL_MS = 15 * 60 * 1000;

// In-memory cache for LoxAPP3.json structure (TTL 1 h).
// The structure file is several MB and rarely changes — caching it cuts
// per-sync traffic by ~30–50 %. Cache is per Edge-Function instance and
// auto-invalidates on cold start.
const structureCache = new Map<string, { structure: any; expiresAt: number }>();
const STRUCTURE_CACHE_TTL_MS = 60 * 60 * 1000;

// Resolve Loxone Cloud DNS via the new Remote Connect endpoint.
// Loxone migrated `dns.loxonecloud.com` (legacy, returns 404 since 2026-05-03)
// to `connect.loxonecloud.com` which serves an HTTP 307 with the actual
// `https://{ipv6-encoded}.{Serial}.dyndns.loxonecloud.com:{port}/` URL in the
// `Location` header (Loxone Remote Connect / lcs-proxy).
async function resolveLoxoneCloudURL(serialNumber: string): Promise<string | null> {
  const cached = cloudUrlCache.get(serialNumber);
  if (cached && cached.expiresAt > Date.now()) {
    console.log(`Using cached Cloud-DNS URL for ${serialNumber}: ${cached.url}`);
    return cached.url;
  }

  const tryEndpoint = async (url: string, follow: boolean): Promise<string | null> => {
    console.log(`Resolving via ${url} (follow=${follow})`);
    const res = await fetchWithTimeout(url, { method: "GET", redirect: follow ? "follow" : "manual" });
    // Manual mode: read Location header from 3xx response
    if (!follow && res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (loc) {
        const u = new URL(loc);
        return `${u.protocol}//${u.host}`;
      }
    }
    // Follow mode: use res.url after redirect chain
    if (res.ok) {
      const u = new URL(res.url);
      return `${u.protocol}//${u.host}`;
    }
    return null;
  };

  // Primary: new Remote-Connect endpoint
  try {
    const baseUrl = await tryEndpoint(`https://connect.loxonecloud.com/${serialNumber}`, false);
    if (baseUrl) {
      console.log(`Resolved (Remote Connect) ${serialNumber} → ${baseUrl}`);
      cloudUrlCache.set(serialNumber, { url: baseUrl, expiresAt: Date.now() + CLOUD_URL_TTL_MS });
      return baseUrl;
    }
  } catch (error) {
    console.warn(`Remote Connect resolution failed for ${serialNumber}:`, error);
  }

  // Fallback: legacy DNS endpoint (still works for some firmware/regions)
  try {
    const baseUrl = await tryEndpoint(`http://dns.loxonecloud.com/${serialNumber}`, true);
    if (baseUrl) {
      console.log(`Resolved (legacy DNS) ${serialNumber} → ${baseUrl}`);
      cloudUrlCache.set(serialNumber, { url: baseUrl, expiresAt: Date.now() + CLOUD_URL_TTL_MS });
      return baseUrl;
    }
  } catch (error) {
    console.error(`Legacy DNS resolution failed for ${serialNumber}:`, error);
  }

  return null;
}

// Resolve base URL with optional local override (`config.local_host`) bypassing the cloud entirely.
function resolveLocalOrCloud(config: LoxoneConfig & { local_host?: string }): Promise<string | null> {
  const localHost = (config as { local_host?: string }).local_host?.trim();
  if (localHost) {
    const normalized = localHost.startsWith("http") ? localHost : `http://${localHost}`;
    console.log(`Using local_host override: ${normalized}`);
    return Promise.resolve(normalized.replace(/\/+$/, ""));
  }
  return resolveLoxoneCloudURL(config.serial_number);
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
    const response = await fetchWithTimeout(url, { method: "GET", headers: { Authorization: authHeader } }, LOXONE_STATE_FETCH_TIMEOUT_MS);
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
    const response = await fetchWithTimeout(url, { method: "GET", headers: { Authorization: authHeader } }, LOXONE_STATE_FETCH_TIMEOUT_MS);
    if (!response.ok) {
      console.warn(`All-states fetch failed for ${controlUuid}: HTTP ${response.status}`);
      return results;
    }
    const data = await response.json();
    console.log(`All-states response for ${controlUuid}: HTTP ${data?.LL?.Code ?? "unknown"}`);
    
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
// IO-Optimierung: rpc schreibt nur wenn sich Status ändert oder last_sync_at > 60s alt ist
async function updateSyncStatus(
  supabase: any,
  locationIntegrationId: string,
  status: "success" | "error" | "syncing"
) {
  await supabase.rpc("touch_location_integration_sync", {
    _id: locationIntegrationId,
    _status: status,
  });
  console.log(`Updated sync_status to: ${status}`);
}

// ── Snapshot Cache Helpers (Cache-First Architecture) ──
async function writeSensorSnapshot(
  supabase: any,
  locationIntegrationId: string,
  payload: {
    sensors: any[];
    systemMessages?: any[];
    status?: "fresh" | "stale" | "error";
    errorMessage?: string | null;
    tenantId?: string | null;
    locationId?: string | null;
  },
) {
  try {
    const row: Record<string, unknown> = {
      location_integration_id: locationIntegrationId,
      sensors: payload.sensors ?? [],
      system_messages: payload.systemMessages ?? [],
      status: payload.status ?? "fresh",
      error_message: payload.errorMessage ?? null,
      fetched_at: new Date().toISOString(),
      source: "loxone-api",
    };
    if (payload.tenantId) row.tenant_id = payload.tenantId;
    if (payload.locationId) row.location_id = payload.locationId;

    const { error } = await supabase
      .from("gateway_sensor_snapshots")
      .upsert(row, { onConflict: "location_integration_id" });
    if (error) console.warn("[snapshot] upsert failed:", error.message);
  } catch (err) {
    console.warn("[snapshot] write error:", err);
  }
}

async function readSensorSnapshot(supabase: any, locationIntegrationId: string) {
  const { data, error } = await supabase
    .from("gateway_sensor_snapshots")
    .select("sensors, system_messages, status, fetched_at, error_message")
    .eq("location_integration_id", locationIntegrationId)
    .maybeSingle();
  if (error) {
    console.warn("[snapshot] read failed:", error.message);
    return null;
  }
  return data;
}

async function tryAcquireRefreshLock(
  supabase: any,
  locationIntegrationId: string,
  owner: string,
  ttlSeconds = 60,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("try_acquire_gateway_refresh_lock", {
    p_integration_id: locationIntegrationId,
    p_owner: owner,
    p_ttl_seconds: ttlSeconds,
  });
  if (error) {
    console.warn("[lock] acquire failed:", error.message);
    return true; // fail-open
  }
  return Boolean(data);
}

async function releaseRefreshLock(supabase: any, locationIntegrationId: string, owner: string) {
  try {
    await supabase.rpc("release_gateway_refresh_lock", {
      p_integration_id: locationIntegrationId,
      p_owner: owner,
    });
  } catch (err) {
    console.warn("[lock] release failed:", err);
  }
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

// ── Battery SOC Discovery & Sync ─────────────────────────────────────────────
// Findet den State-of-Charge-Ausgang eines Fronius/Battery-Bausteins im
// Loxone-Structure-File (LoxAPP3.json), holt den aktuellen Wert vom Miniserver
// und schreibt ihn in energy_storages.current_soc_pct.
//
// Motivation: Der SOC-Wert ist in Loxone Config oft ein interner Analog-Output
// des Fronius-Battery-Bausteins ohne eigenen sichtbaren VI. Er hat trotzdem eine
// eigene uuidAction im Structure-File und kann per /jdev/sps/io/{uuid}/all
// abgefragt werden. Diese Discovery ist heuristisch und toleriert unterschiedliche
// Loxone-Config-Konventionen (deutsch/englisch/Fronius-Plugin/Community-Lib).

interface SocCandidate {
  uuid: string;
  name: string;
  room: string;
  cat: string;
  type: string;
  score: number;
  currentValue: number | null;
}

function scoreSocCandidate(
  uuid: string,
  control: LoxoneControl,
  rooms: Record<string, { name: string }>,
  cats: Record<string, { name: string }>,
): { score: number; roomName: string; catName: string } {
  const name = (control.name || "").toLowerCase();
  const roomName = control.room ? rooms[control.room]?.name || "" : "";
  const catName = control.cat ? cats[control.cat]?.name || "" : "";
  const roomLc = roomName.toLowerCase();
  const catLc = catName.toLowerCase();
  const type = control.type || "";

  let score = 0;

  // Starke Namensignale
  if (/\bsoc\b|state.?of.?charge|ladezustand/i.test(name)) score += 10;
  if (/stateofcharge/i.test(name)) score += 10;
  // Schwächere Namensignale
  if (/batter|speicher|akku/i.test(name)) score += 3;

  // Kontext (Raum/Kategorie)
  if (/batter|speicher|akku|fronius|solar|pv/i.test(roomLc)) score += 2;
  if (/batter|speicher|akku|fronius|solar|pv/i.test(catLc)) score += 2;

  // Typ
  if (/InfoOnlyAnalog|InfoOnlyDigital/i.test(type)) score += 1;
  if (/Fronius|Battery/i.test(type)) score += 2;

  // Format % (aus details, falls vorhanden)
  const details = (control as any).details;
  if (details && typeof details === "object") {
    const format = String(details.format ?? details.formatValue ?? "");
    if (format.includes("%")) score += 3;
  }

  return { score, roomName, catName };
}

// Erkennt SOC-artige Namen für Sub-States (Fronius/Battery-Baustein-Ausgänge)
function isSocStateName(name: string): boolean {
  const lc = name.toLowerCase();
  if (/^soc$/.test(lc)) return true;
  if (/stateofcharge/i.test(name)) return true;
  if (/state.?of.?charge/i.test(name)) return true;
  if (/ladezustand/i.test(lc)) return true;
  return false;
}

async function discoverSocCandidates(
  baseUrl: string,
  loxoneAuth: string,
  structure: LoxoneStructure,
): Promise<SocCandidate[]> {
  const controls = structure.controls || {};
  const rooms = structure.rooms || {};
  const cats = structure.cats || {};

  // Schritt 1: Kandidaten sammeln — sowohl Controls (Standalone-VI mit SOC im Namen)
  // als auch Sub-States von Fronius/Battery/Meter-Bausteinen (SOC als Output eines Blocks).
  const prelim: Array<{
    uuid: string;
    displayName: string;
    controlName: string;
    controlType: string;
    roomName: string;
    catName: string;
    score: number;
    parentControlUuid: string;
    subStateKey: string | null;
  }> = [];

  for (const [ctrlUuid, control] of Object.entries(controls)) {
    const { score, roomName, catName } = scoreSocCandidate(ctrlUuid, control, rooms, cats);
    // (1a) Control selbst als Kandidat, wenn Name/Typ passen
    if (score >= 5) {
      prelim.push({
        uuid: ctrlUuid,
        displayName: control.name || "",
        controlName: control.name || "",
        controlType: control.type || "",
        roomName, catName,
        score,
        parentControlUuid: ctrlUuid,
        subStateKey: null,
      });
    }
    // (1b) Sub-States des Controls durchgehen (z. B. Fronius-Baustein → stateOfCharge_Relative)
    const states = control.states as Record<string, string> | undefined;
    if (!states || typeof states !== "object") continue;
    const type = control.type || "";
    const isBatteryContext =
      /Fronius|Battery/i.test(type) ||
      /batter|speicher|akku|fronius/i.test((control.name || "").toLowerCase()) ||
      /batter|speicher|akku|fronius/i.test(roomName.toLowerCase()) ||
      /batter|speicher|akku|fronius/i.test(catName.toLowerCase());

    for (const [stateKey, stateUuid] of Object.entries(states)) {
      if (typeof stateUuid !== "string") continue;
      let subScore = 0;
      if (isSocStateName(stateKey)) subScore += 12;
      else if (/soc/i.test(stateKey)) subScore += 6;
      else if (/batter|akku|speicher/i.test(stateKey)) subScore += 2;
      if (subScore === 0) continue;
      if (isBatteryContext) subScore += 3;
      // Fronius-Bausteine sind der Regelfall in DE-Anlagen
      if (/Fronius/i.test(type)) subScore += 2;
      prelim.push({
        uuid: stateUuid.toLowerCase(),
        displayName: `${control.name || "?"} → ${stateKey}`,
        controlName: control.name || "",
        controlType: type,
        roomName, catName,
        score: subScore,
        parentControlUuid: ctrlUuid,
        subStateKey: stateKey,
      });
    }
  }

  // Dedupe auf uuid (falls doppelt), Max-Score behalten
  const byUuid = new Map<string, typeof prelim[number]>();
  for (const p of prelim) {
    const prev = byUuid.get(p.uuid);
    if (!prev || p.score > prev.score) byUuid.set(p.uuid, p);
  }

  // Top 12 nach Score prüfen (Live-Wert holen; Plausibilität 0–100)
  const sorted = [...byUuid.values()].sort((a, b) => b.score - a.score).slice(0, 12);

  // Cache für /all pro parentControl (spart HTTP-Requests bei mehreren Sub-States pro Baustein)
  const allStatesCache = new Map<string, Record<string, number | string | null>>();
  async function getAll(controlUuid: string) {
    const cached = allStatesCache.get(controlUuid);
    if (cached) return cached;
    try {
      const s = await fetchAllStates(baseUrl, loxoneAuth, controlUuid);
      allStatesCache.set(controlUuid, s);
      return s;
    } catch (err) {
      console.warn(`[SOC-Discovery] fetchAllStates fehlgeschlagen für ${controlUuid}:`, (err as Error).message);
      return {} as Record<string, number | string | null>;
    }
  }

  const results: SocCandidate[] = [];
  for (const cand of sorted) {
    let value: number | null = null;
    // Wert ermitteln: bei Sub-State über parentControl/all + Output-Name; bei Control direkt /all
    if (cand.subStateKey) {
      const all = await getAll(cand.parentControlUuid);
      // Loxone /all liefert Outputs mit `name` == stateKey. Match case-insensitive.
      const targetKey = cand.subStateKey.toLowerCase();
      for (const [k, v] of Object.entries(all)) {
        if (k === "_primary") continue;
        if (k.toLowerCase() === targetKey && typeof v === "number") { value = v; break; }
      }
    } else {
      const all = await getAll(cand.parentControlUuid);
      const primary = all["_primary"];
      if (typeof primary === "number") value = primary;
      else {
        for (const v of Object.values(all)) {
          if (typeof v === "number") { value = v; break; }
        }
      }
    }
    // Plausibilität: 0–100 (Werte außerhalb sind i. d. R. Leistung/Zählerstand, nicht SOC)
    const plausible = value != null && value >= 0 && value <= 100 && Number.isFinite(value);
    if (plausible || cand.score >= 14) {
      results.push({
        uuid: cand.uuid,
        name: cand.displayName,
        room: cand.roomName,
        cat: cand.catName,
        type: cand.controlType,
        score: cand.score + (plausible ? 5 : 0),
        currentValue: plausible ? value : null,
      });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}


async function syncBatterySoc(
  supabase: any,
  locationIntegrationId: string,
  tenantId: string | null,
  locationId: string | null,
  baseUrl: string,
  loxoneAuth: string,
  structure: LoxoneStructure,
): Promise<void> {
  console.log(`[SOC-Sync] START li=${locationIntegrationId} tenant=${tenantId} location=${locationId}`);
  if (!tenantId || !locationId) {
    console.log(`[SOC-Sync] skip: missing tenant/location`);
    return;
  }
  try {
    const { data: storages, error } = await supabase
      .from("energy_storages")
      .select("id, name, soc_sensor_uuid, current_soc_pct")
      .eq("tenant_id", tenantId)
      .eq("location_id", locationId);
    if (error) {
      console.warn(`[SOC-Sync] energy_storages read failed:`, error.message);
      return;
    }

    const rows = (storages ?? []) as Array<{ id: string; name: string; soc_sensor_uuid: string | null; current_soc_pct: number | null }>;

    // Discovery, falls (a) mindestens ein Storage ohne UUID existiert
    // oder (b) noch gar keiner existiert (dann evtl. auto-anlegen).
    const needsDiscovery = rows.length === 0 || rows.some((r) => !r.soc_sensor_uuid);
    let candidates: SocCandidate[] = [];
    if (needsDiscovery) {
      const controlsCount = Object.keys(structure.controls || {}).length;
      candidates = await discoverSocCandidates(baseUrl, loxoneAuth, structure);
      console.log(`[SOC-Sync] Discovery rows=${rows.length} controls=${controlsCount} candidates=${candidates.length}`,
        candidates.slice(0, 5).map(c => `${c.name}[${c.uuid.slice(0,8)}]=${c.currentValue}(sc=${c.score})`).join(" | "));
    } else {
      console.log(`[SOC-Sync] Discovery skipped (all rows have uuid). rows=${rows.length}`);
    }


    // A) Keine Storage-Zeile, aber Kandidat gefunden → automatisch anlegen
    if (rows.length === 0 && candidates.length > 0) {
      const best = candidates[0];
      const { data: locRow } = await supabase
        .from("locations").select("name").eq("id", locationId).maybeSingle();
      const locName = locRow?.name ?? "Standort";
      const { data: created, error: insErr } = await supabase
        .from("energy_storages")
        .insert({
          tenant_id: tenantId,
          location_id: locationId,
          name: `Speicher ${locName}`.slice(0, 100),
          capacity_kwh: 0,
          max_charge_kw: 0,
          max_discharge_kw: 0,
          efficiency_pct: 90,
          soc_sensor_uuid: best.uuid,
          current_soc_pct: best.currentValue,
          soc_updated_at: best.currentValue != null ? new Date().toISOString() : null,
        })
        .select("id")
        .single();
      if (insErr) {
        console.warn(`[SOC-Sync] Auto-Anlage Speicher fehlgeschlagen:`, insErr.message);
      } else {
        console.log(`[SOC-Sync] Speicher-Datensatz auto-angelegt (id=${created?.id}, soc=${best.currentValue}%, uuid=${best.uuid})`);
      }
      return;
    }

    // B) Für jede Zeile: UUID zuweisen (falls fehlt) und aktuellen Wert schreiben
    for (const row of rows) {
      let uuid = row.soc_sensor_uuid;
      let value: number | null = null;

      if (!uuid && candidates.length > 0) {
        // Nimm besten (noch nicht anderweitig verwendeten) Kandidaten
        const used = new Set(rows.map((r) => r.soc_sensor_uuid).filter(Boolean) as string[]);
        const pick = candidates.find((c) => !used.has(c.uuid));
        if (pick) {
          uuid = pick.uuid;
          value = pick.currentValue;
          console.log(`[SOC-Sync] Zuweisung uuid=${uuid} an Speicher ${row.id} (${row.name})`);
        }
      }

      if (!uuid) continue;

      // Aktuellen Wert vom Miniserver holen (falls noch nicht durch Discovery).
      // Zwei Fälle:
      //   (a) uuid ist eine Control-UUID (Standalone-VI) → /jdev/sps/io/{uuid}/all direkt.
      //   (b) uuid ist eine Sub-State-UUID eines Bausteins (Fronius etc.) → müssen
      //       den Parent-Control finden und dessen /all lesen; darin steckt der
      //       benannte Output mit dem Wert.
      if (value == null) {
        // Parent + State-Key im Structure-File suchen
        let parentUuid: string | null = null;
        let stateKey: string | null = null;
        for (const [cUuid, ctrl] of Object.entries(structure.controls || {})) {
          const states = (ctrl as any)?.states as Record<string, string> | undefined;
          if (!states) continue;
          for (const [k, v] of Object.entries(states)) {
            if (typeof v === "string" && v.toLowerCase() === uuid.toLowerCase()) {
              parentUuid = cUuid;
              stateKey = k;
              break;
            }
          }
          if (parentUuid) break;
        }
        try {
          const targetUuid = parentUuid ?? uuid;
          const states = await fetchAllStates(baseUrl, loxoneAuth, targetUuid);
          if (stateKey) {
            const targetLc = stateKey.toLowerCase();
            for (const [k, v] of Object.entries(states)) {
              if (k === "_primary") continue;
              if (k.toLowerCase() === targetLc && typeof v === "number") { value = v; break; }
            }
          }
          if (value == null) {
            const primary = states["_primary"];
            if (typeof primary === "number") value = primary;
            else {
              for (const v of Object.values(states)) {
                if (typeof v === "number") { value = v; break; }
              }
            }
          }
        } catch (err) {
          console.warn(`[SOC-Sync] Wert-Abruf fehlgeschlagen für ${uuid}:`, (err as Error).message);
        }
      }


      // Plausibilitätsprüfung
      if (value != null && (value < 0 || value > 100 || !isFinite(value))) {
        console.warn(`[SOC-Sync] unplausibler Wert ${value} für ${uuid} — ignoriert`);
        value = null;
      }

      const patch: Record<string, unknown> = {};
      if (uuid !== row.soc_sensor_uuid) patch.soc_sensor_uuid = uuid;
      if (value != null) {
        patch.current_soc_pct = value;
        patch.soc_updated_at = new Date().toISOString();
      }
      if (Object.keys(patch).length === 0) continue;

      const { error: upErr } = await supabase
        .from("energy_storages").update(patch).eq("id", row.id);
      if (upErr) {
        console.warn(`[SOC-Sync] Update ${row.id} fehlgeschlagen:`, upErr.message);
      } else {
        console.log(`[SOC-Sync] Speicher ${row.id} aktualisiert: ${JSON.stringify(patch)}`);
      }
    }
  } catch (err) {
    console.error(`[SOC-Sync] unerwarteter Fehler (li=${locationIntegrationId}):`, (err as Error).message);
  }
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
    // Robust service-role detection: equality OR JWT payload role === "service_role".
    // Equality alone is brittle when keys are rotated or different deployment snapshots
    // hold different copies of SUPABASE_SERVICE_ROLE_KEY.
    let isServiceRole = token === supabaseServiceKey;
    if (!isServiceRole) {
      try {
        const part = token.split(".")[1];
        if (part) {
          const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
          const payload = JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
          if (payload?.role === "service_role") isServiceRole = true;
        }
      } catch { /* not a JWT, fall through */ }
    }

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
      const { data: { user }, error: userError } = await authClient.auth.getUser(token);
      if (userError || !user) {
        return new Response(JSON.stringify({ success: false, error: "Ungültiges Token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const userId = user.id;

      // Get user's tenant_id
      const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("user_id", userId).single();
      // Super-admins have no tenant_id but should still be able to call this
      // (e.g. during a Remote-Support session). Tenant ownership is enforced
      // below against the location_integration.
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "super_admin")
        .maybeSingle();
      const isSuperAdmin = !!roleRow;

      if (!profile?.tenant_id && !isSuperAdmin) {
        return new Response(JSON.stringify({ success: false, error: "Kein Mandant zugeordnet" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      userTenantId = profile?.tenant_id ?? null;
      if (isSuperAdmin) {
        // Treat super-admin like service-role for downstream tenant checks
        isServiceRole = true;
      }
    }

    const requestBody = await req.json();
    let { locationIntegrationId, action, sensorName } = requestBody;
    // refreshSensors is implemented as getSensors + persist + lock
    const isRefreshAction = action === "refreshSensors";
    if (isRefreshAction) action = "getSensors";
    const shouldPersistReadings = isServiceRole || isRefreshAction || requestBody?.persistToDb === true;
    // Hybrid-Strategie (Phase 6.4): getSensors/Details/backfill sind wieder
    // aktiv — sie liefern die driftfreien Zählerstände, während die WS-Bridge
    // parallel die Live-Power-Events sendet.

    // Manual UI-triggered refresh (Tacho/Discovery button) → bypass the 1 h
    // structure cache so newly added Loxone sensors/actuators show up instantly.
    // Cron/background calls (service role) keep using the cache to save traffic.
    const forceStructureRefresh =
      requestBody?.forceStructureRefresh === true ||
      (isRefreshAction && !isServiceRole);


    if (!locationIntegrationId) {
      throw new Error("Location Integration ID ist erforderlich");
    }

    // ── ACTION: getSensorsCached ── (cache-first, no external HTTP)
    if (action === "getSensorsCached") {
      const snap = await readSensorSnapshot(supabase, locationIntegrationId);
      if (snap) {
        return new Response(
          JSON.stringify({
            success: true,
            sensors: snap.sensors ?? [],
            systemMessages: snap.system_messages ?? [],
            cached: true,
            snapshotStatus: snap.status,
            fetchedAt: snap.fetched_at,
            errorMessage: snap.error_message,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      // No snapshot yet → return empty result; the UI can trigger refreshSensors.
      return new Response(
        JSON.stringify({ success: true, sensors: [], systemMessages: [], cached: true, snapshotStatus: "missing" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(
      `Loxone API request: action=${action}, locationIntegrationId=${locationIntegrationId}, sensorName=${sensorName || "N/A"}, persist=${shouldPersistReadings}, refresh=${isRefreshAction}`,
    );

    // ── refreshSensors: acquire lock so parallel UI calls don't stampede ──
    const lockOwner = `loxone-api:${crypto.randomUUID()}`;
    let heldLock = false;
    if (isRefreshAction) {
      heldLock = await tryAcquireRefreshLock(supabase, locationIntegrationId, lockOwner, 60);
      if (!heldLock) {
        // Another refresh is in flight – return current snapshot instead of duplicating work
        const snap = await readSensorSnapshot(supabase, locationIntegrationId);
        return new Response(
          JSON.stringify({
            success: true,
            sensors: snap?.sensors ?? [],
            systemMessages: snap?.system_messages ?? [],
            cached: true,
            snapshotStatus: snap?.status ?? "refreshing",
            fetchedAt: snap?.fetched_at ?? null,
            refreshing: true,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

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

    const baseUrl = await resolveLocalOrCloud(config as LoxoneConfig & { local_host?: string });
    if (!baseUrl) {
      if (shouldPersistReadings) {
        await updateSyncStatus(supabase, locationIntegrationId, "error");
      }
      throw new Error("Cloud DNS Auflösung fehlgeschlagen. Miniserver nicht erreichbar.");
    }

    const credentials = btoa(`${config.username}:${config.password}`);
    const loxoneAuth = `Basic ${credentials}`;

    // ── ACTION: test ──
    if (action === "test") {
      const testUrl = `${baseUrl}/jdev/cfg/api`;
      console.log(`Testing connection: ${testUrl}`);
      const response = await fetchWithTimeout(testUrl, { method: "GET", headers: { Authorization: loxoneAuth } });
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
      if (shouldPersistReadings) {
        await updateSyncStatus(supabase, locationIntegrationId, "syncing");
      }

      // ── Structure file (LoxAPP3.json) — cached for 1 h per location_integration ──
      // The structure rarely changes, so we serve it from an in-memory cache and
      // only re-fetch on cache miss / expiry. This alone cuts ~30–50 % of traffic.
      const cacheKey = locationIntegrationId;
      if (forceStructureRefresh) {
        structureCache.delete(cacheKey);
        console.log("Manual refresh: structure cache invalidated for this integration");
      }
      const cached = structureCache.get(cacheKey);
      let structure: LoxoneStructure & { messageCenter?: any };

      if (cached && cached.expiresAt > Date.now()) {
        structure = cached.structure;
        console.log(`Using cached LoxAPP3.json structure (expires in ${Math.round((cached.expiresAt - Date.now()) / 1000)}s)`);
      } else {

        const structureUrl = `${baseUrl}/data/LoxAPP3.json`;
        console.log(`Fetching structure: ${structureUrl}`);
        const structureResponse = await fetchWithTimeout(structureUrl, { method: "GET", headers: { Authorization: loxoneAuth } });

        if (!structureResponse.ok) {
          if (shouldPersistReadings) {
            await updateSyncStatus(supabase, locationIntegrationId, "error");
          }
          if (structureResponse.status === 401) throw new Error("Authentifizierung fehlgeschlagen.");
          throw new Error(`Struktur konnte nicht geladen werden: ${structureResponse.status}`);
        }

        structure = await structureResponse.json() as LoxoneStructure & { messageCenter?: any };
        structureCache.set(cacheKey, { structure, expiresAt: Date.now() + STRUCTURE_CACHE_TTL_MS });
        console.log(`Cached structure for ${STRUCTURE_CACHE_TTL_MS / 1000}s`);
      }

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

      // ── Option 2: Only poll controls actually used by configured meters ──
      // On background sync (refreshSensors) we don't need live values for every
      // control — only for those linked to a meter row. This cuts ~70 % of the
      // remaining state-fetch traffic on customers with many unused controls.
      // On UI discovery (action=getSensors without refresh) we still poll all.
      let allControlUuids = Object.keys(controls);
      let controlUuids = allControlUuids;

      // Skip the linked-meter filter on manual UI refresh so new (yet unlinked)
      // controls also get state values and appear in discovery.
      if (isRefreshAction && !forceStructureRefresh) {

        const { data: linkedMetersForFilter } = await supabase
          .from("meters")
          .select("sensor_uuid")
          .eq("location_integration_id", locationIntegrationId)
          .eq("capture_type", "automatic")
          .eq("is_archived", false);

        const allowed = new Set(
          (linkedMetersForFilter ?? [])
            .map((m: any) => m.sensor_uuid)
            .filter((u: any): u is string => typeof u === "string" && u.length > 0),
        );

        if (allowed.size > 0) {
          controlUuids = allControlUuids.filter((u) => allowed.has(u));
          console.log(
            `refreshSensors: filtered ${allControlUuids.length} → ${controlUuids.length} controls (only linked meters)`,
          );
        } else {
          console.log("refreshSensors: no linked meters found, polling nothing");
          controlUuids = [];
        }
      }

      console.log(`Querying states for ${controlUuids.length} controls via /all endpoint...`);

      // Batch fetch all states using control UUIDs
      const stateResults: Record<string, StateValueResult> = {};
      const batchSize = LOXONE_STATE_BATCH_SIZE;



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

      // Only background sync jobs should persist readings and archive totals.
      // Interactive UI reads must stay lightweight to avoid edge-runtime timeouts.
      if (shouldPersistReadings) {
      try {
        const { data: linkedMeters } = await supabase
          .from("meters")
          .select("id, sensor_uuid, energy_type, tenant_id")
          .eq("location_integration_id", locationIntegrationId)
          .eq("capture_type", "automatic")
          .eq("is_archived", false);

        if (linkedMeters && linkedMeters.length > 0) {
          const now = new Date();
          // Previous month's first day for monthly archiving (Europe/Berlin TZ).
          // FIX (Step 3): Avoid local→UTC off-by-one near month boundaries by computing
          // the calendar date in Berlin TZ before subtracting a month.
          const berlinFmtM = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Europe/Berlin",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          });
          const [ny, nm] = berlinFmtM.format(now).split("-").map(Number);
          const prevMonth = new Date(Date.UTC(ny, nm - 2, 1));
          const periodStart = prevMonth.toISOString().split("T")[0];

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

          // Kumulative Zählerstands-Snapshots (für intervall-unabhängige Ist-Berechnung)
          const cumulativeInserts: Array<{
            tenant_id: string;
            meter_id: string;
            reading_at: string;
            kwh_total: number;
            source: string;
          }> = [];

          // Phase 7: Tagessnapshot pro Meter (Loxone-Wahrheit). Wird mehrmals täglich
          // durch den 15-Min-Poll überschrieben → letzter Wert vor Mitternacht bleibt
          // als finaler Tageswert stehen. Grundlage für Monat/Jahr-Berechnung
          // (= aktuelles total minus Snapshot vom 01. des Monats / 01.01.) und für
          // Wochen-/Quartalsaggregation.
          const dailySnapshotInserts: Array<{
            tenant_id: string;
            meter_id: string;
            snapshot_date: string;
            energy_total_kwh: number | null;
            energy_today_kwh: number | null;
            source: string;
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
            // FIX (Step 3): Date must be computed in Europe/Berlin TZ.
            // Previous code used `new Date(Y, M, D-1)` (local midnight) + toISOString(),
            // which shifts to UTC and produced an off-by-one (or -two) day label.
            // Loxone's "TotalDayLast" represents the completed previous calendar day in
            // Berlin local time — we now compute that date deterministically.
            if (stateData?.totalDayLast != null && stateData.totalDayLast > 0) {
              const berlinFmt = new Intl.DateTimeFormat("en-CA", {
                timeZone: "Europe/Berlin",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              });
              const todayBerlin = berlinFmt.format(now); // "YYYY-MM-DD"
              const [by, bm, bd] = todayBerlin.split("-").map(Number);
              const yest = new Date(Date.UTC(by, bm - 1, bd));
              yest.setUTCDate(yest.getUTCDate() - 1);
              const yesterdayStr = yest.toISOString().split("T")[0];
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

            // Berlin-Datum einmal pro Meter berechnen (für day/month/year period_start)
            const berlinFmtT = new Intl.DateTimeFormat("en-CA", {
              timeZone: "Europe/Berlin",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            });
            const todayStr = berlinFmtT.format(now); // YYYY-MM-DD in Berlin
            const firstOfMonthStr = `${todayStr.slice(0, 7)}-01`;
            const firstOfYearStr = `${todayStr.slice(0, 4)}-01-01`;

            // Persist TODAY's running total (Rd/Rdc/Rdd) so dashboards & RPCs
            // can rely on the authoritative Loxone counter instead of a
            // 5-min power-aggregation estimate. Stored as source='loxone_live'
            // on today's date (Europe/Berlin). Overwritten at midnight when
            // 'loxone' source archives totalDayLast for the completed day.
            if (stateData?.totalDay != null && stateData.totalDay >= 0) {
              monthUpserts.push({
                tenant_id: meter.tenant_id,
                meter_id: meter.id,
                period_type: "day",
                period_start: todayStr,
                total_value: stateData.totalDay,
                energy_type: meter.energy_type,
                source: "loxone_live",
              });
            }

            // Persist CURRENT month total (Rm/Rmc/Rmd) als Loxone-Gold-Standard.
            // Quelle: Loxone Miniserver HTTP-Counter, alle 15 Min aktualisiert.
            // Überschreibt etwaige 5-Min-aggregierte Schätzungen.
            if (stateData?.totalMonth != null && stateData.totalMonth >= 0) {
              monthUpserts.push({
                tenant_id: meter.tenant_id,
                meter_id: meter.id,
                period_type: "month",
                period_start: firstOfMonthStr,
                total_value: stateData.totalMonth,
                energy_type: meter.energy_type,
                source: "loxone_live",
              });
            }

            // Persist CURRENT year total (Ry/Ryc/Ryd) als Loxone-Gold-Standard.
            // Damit ist der Jahres-Wert auch dann korrekt, wenn die WS-Bridge
            // zwischenzeitlich offline war und Day-Rows fehlen.
            if (stateData?.totalYear != null && stateData.totalYear >= 0) {
              monthUpserts.push({
                tenant_id: meter.tenant_id,
                meter_id: meter.id,
                period_type: "year",
                period_start: firstOfYearStr,
                total_value: stateData.totalYear,
                energy_type: meter.energy_type,
                source: "loxone_live",
              });
            }

            // Snapshot des kumulativen Zählerstandes — Priorität:
            //   1. Mr (echter Zählerstand, in stateData.secondaryValue für Meter-Controls)
            //   2. totalYear (Ry) als Fallback
            //   3. totalDay als letzter Fallback
            // Wird in `meter_cumulative_readings` geschrieben und vom Aggregator
            // `aggregate_pv_actual_hourly` zur intervall-unabhängigen Berechnung
            // der Ist-Erzeugung pro Stunde verwendet.
            const mrRaw = stateData?.secondaryValue;
            const mrNum = typeof mrRaw === "number"
              ? mrRaw
              : (typeof mrRaw === "string" && mrRaw.trim() !== "" ? parseFloat(mrRaw) : NaN);
            const mrValid = isFinite(mrNum) && mrNum > 0;
            const cumulativeKwh = mrValid
              ? mrNum
              : (stateData?.totalYear != null && stateData.totalYear > 0)
                ? Number(stateData.totalYear)
                : (stateData?.totalDay != null && stateData.totalDay >= 0 ? Number(stateData.totalDay) : null);
            const cumulativeSource = mrValid
              ? "loxone_live_total"
              : (stateData?.totalYear != null && stateData.totalYear > 0)
                ? "loxone_live_year"
                : "loxone_live_day";
            if (cumulativeKwh != null && isFinite(cumulativeKwh)) {
              cumulativeInserts.push({
                tenant_id: meter.tenant_id,
                meter_id: meter.id,
                reading_at: now.toISOString(),
                kwh_total: cumulativeKwh,
                source: cumulativeSource,
              });
            }


            // Phase 7: Tagessnapshot (Europe/Berlin-Datum) — letzter Wert pro Tag bleibt persistent.
            try {
              const berlinDate = new Intl.DateTimeFormat("en-CA", {
                timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
              }).format(now); // → "YYYY-MM-DD"
              const totalKwh = (stateData?.totalYear != null && stateData.totalYear > 0)
                ? Number(stateData.totalYear)
                : (stateData?.totalDay != null ? Number(stateData.totalDay) : null);
              const todayKwh = stateData?.totalDay != null ? Number(stateData.totalDay) : null;
              if ((totalKwh != null && isFinite(totalKwh)) || (todayKwh != null && isFinite(todayKwh))) {
                dailySnapshotInserts.push({
                  tenant_id: meter.tenant_id,
                  meter_id: meter.id,
                  snapshot_date: berlinDate,
                  energy_total_kwh: totalKwh != null && isFinite(totalKwh) ? totalKwh : null,
                  energy_today_kwh: todayKwh != null && isFinite(todayKwh) ? todayKwh : null,
                  source: "loxone_http_poll",
                });
              }
            } catch (_e) { /* date formatting issues → snapshot überspringen */ }


            // Store instantaneous power reading for time-series (with spike filter)
            if (stateData?.value != null) {
              const powerVal = typeof stateData.value === "number" ? stateData.value : parseFloat(String(stateData.value));
              if (!isNaN(powerVal)) {
                const absForSpike = Math.abs(powerVal);
                const recentVals = recentReadingsMap[meter.id] ?? [];
                const median = computeMedian(recentVals);

                // Loxone Meter controls recalculate period counters (Rd/Rm/Ry) at :00 and :30,
                // which can cause brief spikes on the "Pf" output. Use tighter thresholds near those boundaries.
                const minute = now.getMinutes();
                const isNearBoundary = minute <= 1 || (minute >= 29 && minute <= 31) || minute >= 59;
                const effectiveSpikeFactor = isNearBoundary ? 1.8 : SPIKE_FACTOR;
                const effectiveBaselineMin = isNearBoundary ? 1.0 : SPIKE_BASELINE_MIN;

                const isSpike = recentVals.length >= 3 && median >= effectiveBaselineMin && absForSpike > median * effectiveSpikeFactor;

                if (isSpike) {
                  console.warn(
                    `Spike-Detection: Skipping power reading for meter ${meter.id} ` +
                    `(value=${absForSpike.toFixed(2)}, median=${median.toFixed(2)}, factor=${(absForSpike / median).toFixed(2)}×, boundary=${isNearBoundary})`
                  );
                } else {
                  powerInserts.push({
                    tenant_id: meter.tenant_id,
                    meter_id: meter.id,
                    power_value: powerVal,
                    energy_type: meter.energy_type,
                    recorded_at: now.toISOString(),
                  });
                }
              }
            }
          }

          if (monthUpserts.length > 0) {
            // IO-Optimierung: vor dem Upsert vorhandene Zeilen lesen und nur
            // schreiben, wenn sich total_value oder source tatsächlich geändert
            // hat. Quelle der vorherigen ~9,77 Mio. UPDATES auf 5.676 Zeilen.
            const meterIds = Array.from(new Set(monthUpserts.map((u: any) => u.meter_id)));
            const periodStarts = Array.from(new Set(monthUpserts.map((u: any) => u.period_start)));
            const { data: existingRows } = await supabase
              .from("meter_period_totals")
              .select("meter_id, period_type, period_start, total_value, source")
              .in("meter_id", meterIds)
              .in("period_start", periodStarts);

            const existingMap = new Map<string, { total_value: number; source: string | null }>();
            for (const r of (existingRows || [])) {
              const key = `${r.meter_id}|${r.period_type}|${r.period_start}`;
              existingMap.set(key, { total_value: Number(r.total_value), source: r.source });
            }

            const toUpsert = monthUpserts.filter((u: any) => {
              const key = `${u.meter_id}|${u.period_type}|${u.period_start}`;
              const existing = existingMap.get(key);
              if (!existing) return true;
              const valChanged = Number(existing.total_value) !== Number(u.total_value);
              const srcChanged = (existing.source ?? null) !== (u.source ?? null);
              return valChanged || srcChanged;
            });

            if (toUpsert.length > 0) {
              // Chunk-Fix: bei großen Integrationen (z.B. AICONO Zentrale mit
              // 30 Metern → ~90 Zeilen) bricht ein einzelner Upsert still ab,
              // weil PostgREST/Edge die große Payload ablehnt. 20er-Chunks
              // umgehen das ohne Schema-Änderung. Fehler werden mit vollem
              // Inhalt geloggt (kürzeste Retention-Zeit der Edge-Logs reicht).
              const CHUNK = 20;
              let okCount = 0;
              let errCount = 0;
              for (let i = 0; i < toUpsert.length; i += CHUNK) {
                const slice = toUpsert.slice(i, i + CHUNK);
                const { error: upsertError } = await supabase
                  .from("meter_period_totals")
                  .upsert(slice, { onConflict: "meter_id,period_type,period_start" });
                if (upsertError) {
                  errCount += slice.length;
                  console.error(
                    `Error upserting period totals chunk ${i}-${i + slice.length} (size=${slice.length}): ${JSON.stringify(upsertError)} | first row: ${JSON.stringify(slice[0])}`
                  );
                } else {
                  okCount += slice.length;
                }
              }
              if (errCount > 0) {
                console.error(`Period-totals upsert: ${okCount} ok / ${errCount} failed (of ${monthUpserts.length} total, ${monthUpserts.length - toUpsert.length} unchanged)`);
              } else {
                console.log(`Upserted ${okCount}/${monthUpserts.length} period totals for ${periodStart} (skipped ${monthUpserts.length - toUpsert.length} unchanged)`);
              }
            } else {
              console.log(`Skipped all ${monthUpserts.length} period totals for ${periodStart} (no value changes)`);
            }
          }


          if (powerInserts.length > 0) {
            // WORKER_ACTIVE feature flag: when the Hetzner gateway-worker is the
            // authoritative writer (flag on + heartbeat fresh), skip this insert
            // to avoid double-writes. Falls back automatically if the worker is
            // missing or stale (>5 min), so no data gap occurs.
            const workerOwnsWrites = await isWorkerPrimary(supabase);
            if (workerOwnsWrites) {
              console.log(`[loxone-api] WORKER_ACTIVE → skipping ${powerInserts.length} power-readings inserts (worker is primary)`);
            } else {
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

          // Bulk-Insert der Zählerstands-Snapshots (Konflikt = bereits vorhandener Zeitpunkt → ignorieren)
          if (cumulativeInserts.length > 0) {
            const { error: cumErr } = await supabase
              .from("meter_cumulative_readings")
              .upsert(cumulativeInserts, { onConflict: "meter_id,reading_at" });
            if (cumErr) {
              console.error("Error inserting cumulative readings:", cumErr);
            } else {
              console.log(`Inserted ${cumulativeInserts.length} cumulative meter readings`);
            }
          }

          // Phase 7: Tagessnapshot upserten (1 Zeile pro Meter+Tag, mehrfach pro Tag überschrieben)
          if (dailySnapshotInserts.length > 0) {
            const { error: snapErr } = await supabase
              .from("meter_loxone_daily_snapshots")
              .upsert(dailySnapshotInserts, { onConflict: "meter_id,snapshot_date" });
            if (snapErr) {
              console.error("Error upserting daily snapshots:", snapErr);
            } else {
              console.log(`Upserted ${dailySnapshotInserts.length} daily Loxone snapshots`);
            }
          }
        }

      } catch (archiveErr) {
        console.error("Error archiving data:", archiveErr);
      }
      }

      // ── Battery-SOC sync (Fronius/Battery Sub-Output aus LoxAPP3.json) ──
      // Läuft bei jedem getSensors, benutzt die bereits geladene Struktur und Auth.
      // Idempotent, kostet 1–8 zusätzliche Miniserver-Requests nur beim allerersten
      // Sync einer Location; danach nur noch 1 Request pro konfiguriertem Speicher.
      try {
        await syncBatterySoc(
          supabase,
          locationIntegrationId,
          (locationIntegration as any).location?.tenant_id ?? null,
          (locationIntegration as any).location_id ?? null,
          baseUrl,
          loxoneAuth,
          structure,
        );
      } catch (socErr) {
        console.warn("[SOC-Sync] fehlgeschlagen:", (socErr as Error).message);
      }

      if (shouldPersistReadings) {
        await updateSyncStatus(supabase, locationIntegrationId, "success");
      }


      // ── Always write snapshot on successful sensor fetch ──
      await writeSensorSnapshot(supabase, locationIntegrationId, {
        sensors,
        systemMessages,
        status: "fresh",
        tenantId: (locationIntegration as any).location?.tenant_id ?? null,
        locationId: (locationIntegration as any).location_id ?? null,
      });
      if (heldLock) await releaseRefreshLock(supabase, locationIntegrationId, lockOwner);

      return new Response(
        JSON.stringify({ success: true, sensors, systemMessages, cached: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ACTION: getSensorDetails ──
    if (action === "getSensorDetails") {
      if (!sensorName) throw new Error("sensorName ist erforderlich für getSensorDetails");

      console.log(`Searching for sensor: "${sensorName}"`);
      const structureUrl = `${baseUrl}/data/LoxAPP3.json`;
      const structureResponse = await fetchWithTimeout(structureUrl, { method: "GET", headers: { Authorization: loxoneAuth } });
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
      const structureResponse = await fetchWithTimeout(structureUrl, { method: "GET", headers: { Authorization: loxoneAuth } });
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
      let cmd = commandValue !== undefined ? String(commandValue) : "pulse";

      // ── Reset command mapping for Meter controls ──
      // Loxone Meter controls have sub-control UUIDs in their `states` for reset operations.
      // Commands like "resetDay", "resetMonth", "resetYear", "resetAll" must be resolved
      // to the correct sub-control UUID and then issued as "pulse".
      const RESET_STATE_MAP: Record<string, string[]> = {
        resetDay:   ["resetDay", "Rdc", "Rd"],
        resetMonth: ["resetMonth", "Rmc", "Rm"],
        resetYear:  ["resetYear", "Ryc", "Ry"],
        resetAll:   ["resetAll", "reset"],
      };

      let targetUuid = controlUuid;

      if (RESET_STATE_MAP[cmd]) {
        // Fetch structure to find the control's states
        const structUrl = `${baseUrl}/data/LoxAPP3.json`;
        const structResp = await fetch(structUrl, { method: "GET", headers: { Authorization: loxoneAuth } });
        if (!structResp.ok) {
          throw new Error(`Struktur konnte nicht geladen werden: ${structResp.status}`);
        }
        const struct = await structResp.json();
        const control = struct?.controls?.[controlUuid];
        const states = control?.states || {};

        // Try to find the correct sub-control UUID for the reset
        let resetUuid: string | null = null;
        for (const candidate of RESET_STATE_MAP[cmd]) {
          if (states[candidate]) {
            resetUuid = states[candidate];
            break;
          }
        }

        if (resetUuid) {
          targetUuid = resetUuid;
          cmd = "pulse";
          console.log(`Reset command "${commandValue}" resolved to sub-control ${resetUuid} with pulse`);
        } else {
          // Fallback: try pulse on the main control
          console.warn(`No reset state found for "${cmd}" on control ${controlUuid}, falling back to pulse on main control`);
          cmd = "pulse";
        }
      }

      // Validate command: only allow known Loxone primitives or numeric values
      const VALID_COMMANDS = new Set(["pulse", "On", "Off", "toggle", "on", "off"]);
      if (!VALID_COMMANDS.has(cmd) && isNaN(Number(cmd))) {
        console.warn(`Invalid command "${cmd}" detected, falling back to "pulse"`);
        cmd = "pulse";
      }

      const cmdUrl = `${baseUrl}/jdev/sps/io/${targetUuid}/${encodeURIComponent(cmd)}`;
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

      // Fetch CPU, heap, date AND time in parallel
      const [cpuRaw, heapRaw, dateRaw, timeRaw] = await Promise.all([
        fetchLoxoneValue("/jdev/sys/cpu"),
        fetchLoxoneValue("/jdev/sys/heap"),
        fetchLoxoneValue("/jdev/sys/date"),
        fetchLoxoneValue("/jdev/sys/time"),
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
          systemStatus: { cpu, temperature: temp, memory, localTime: [dateRaw, timeRaw].filter(Boolean).join(" ") || null },
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
      const { fromDate, toDate, totalsOnly } = requestBody;
      if (!fromDate || !toDate) throw new Error("fromDate und toDate sind erforderlich (YYYY-MM-DD)");

      // totalsOnly=true: nur meter_period_totals (Tagessummen) abgleichen,
      // die 5-Min-Werte in meter_power_readings_5min werden NICHT überschrieben.
      // Verwendet vom täglichen Cron, damit der feine Live-Graph erhalten bleibt.
      const onlyTotals = totalsOnly === true;
      console.log(`Backfill statistics (binary): ${fromDate} to ${toDate} for integration ${locationIntegrationId} (totalsOnly=${onlyTotals})`);

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
      const structureResponse = await fetchWithTimeout(structureUrl, { method: "GET", headers: { Authorization: loxoneAuth } });
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
                entries.push({ timestamp: date, value: val });
              }
            }
          }

          console.log(`Parsed ${entries.length} entries from ${file.filename} in date range`);
          if (entries.length === 0) continue;

          // ── Outlier detection: first entry in monthly files often contains
          //    the cumulative meter reading instead of an instantaneous power value.
          //    Detect & remove entries that are >20x the median of the rest.
          if (entries.length >= 3) {
            const sorted = entries.map(e => e.value).sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)];
            const threshold = Math.max(median * 20, 100); // at least 100 to avoid false positives on small values
            const before = entries.length;
            const removed: Array<{ timestamp: Date; value: number }> = [];
            const filtered = entries.filter(e => {
              if (e.value > threshold) {
                removed.push(e);
                return false;
              }
              return true;
            });
            if (removed.length > 0) {
              console.log(`Outlier detection: removed ${removed.length} entries (threshold=${threshold.toFixed(1)}, median=${median.toFixed(3)}): ${removed.map(r => `${r.timestamp.toISOString()}=${r.value}`).join(", ")}`);
              entries.length = 0;
              entries.push(...filtered);
            }
          }
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
          // Skip single-sample buckets: a 30-min Loxone statistics value would otherwise
          // anchor a sawtooth pattern in charts where 1-min live data is also present.
          const fiveMinInserts = Array.from(buckets.entries())
            .filter(([, d]) => d.count >= 2)
            .map(([bucket, d]) => ({
              meter_id: meter!.id,
              tenant_id: meter!.tenant_id,
              energy_type: meter!.energy_type,
              bucket,
              power_avg: d.sum / d.count,
              power_max: d.max,
              sample_count: d.count,
            }));

          if (fiveMinInserts.length > 0 && !onlyTotals) {
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
          } else if (onlyTotals) {
            console.log(`Skipping 5-min upsert for ${file.filename} (totalsOnly mode)`);
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

    // ── ACTION: getVersion ──
    if (action === "getVersion") {
      console.log("Fetching Miniserver firmware version...");

      // Fetch version string
      const versionRes = await fetch(`${baseUrl}/jdev/cfg/version`, {
        method: "GET",
        headers: { Authorization: loxoneAuth },
      });
      if (!versionRes.ok) {
        throw new Error(`Firmware-Version konnte nicht abgerufen werden: HTTP ${versionRes.status}`);
      }
      const versionData = await versionRes.json();
      const version = versionData?.LL?.value || "unbekannt";

      // Fetch version date
      let versionDate = "unbekannt";
      try {
        const dateRes = await fetch(`${baseUrl}/jdev/cfg/versiondate`, {
          method: "GET",
          headers: { Authorization: loxoneAuth },
        });
        if (dateRes.ok) {
          const dateData = await dateRes.json();
          versionDate = dateData?.LL?.value || "unbekannt";
        }
      } catch (e) {
        console.warn("Could not fetch version date:", e);
      }

      return new Response(
        JSON.stringify({
          success: true,
          version,
          versionDate,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ACTION: triggerUpdate ──
    if (action === "triggerUpdate") {
      const { confirmed } = requestBody;
      if (!confirmed) {
        throw new Error("Update muss explizit bestätigt werden (confirmed: true)");
      }

      console.log("Triggering Miniserver firmware update...");
      const updateRes = await fetch(`${baseUrl}/jdev/sys/updatetolatestrelease`, {
        method: "GET",
        headers: { Authorization: loxoneAuth },
      });

      if (!updateRes.ok) {
        if (updateRes.status === 401 || updateRes.status === 403) {
          throw new Error("Keine Berechtigung für Firmware-Update. Der konfigurierte Benutzer benötigt das Recht 'Firmware Update' auf dem Miniserver.");
        }
        throw new Error(`Firmware-Update fehlgeschlagen: HTTP ${updateRes.status}`);
      }

      const updateData = await updateRes.json();
      console.log("Update response:", JSON.stringify(updateData));

      return new Response(
        JSON.stringify({
          success: true,
          message: "Firmware-Update wurde gestartet. Der Miniserver startet automatisch neu.",
          data: updateData,
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
