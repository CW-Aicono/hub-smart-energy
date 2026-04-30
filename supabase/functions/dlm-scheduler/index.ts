// DLM Scheduler — Dynamic Load Management
// Two-tier model:
//   • Site-wide HARD limit  (locations.grid_limit_kw + main meter on the site)
//   • Per-group SOFT limit  (charge_point_groups.energy_settings.dlm.{enabled,limit_kw,reference_meter_id})
//
// Every minute we read the most recent power reading from each reference meter,
// compare against the configured limit, and queue a SetChargingProfile (or
// ChangeConfiguration fallback) on every affected charge point with stackLevel=2
// so that DLM trumps the lower-priority power-limit (stackLevel=0) and pv
// surplus (stackLevel=1) profiles inside the wallbox.
//
// When the load drops back below the limit (with hysteresis), we clear our DLM
// profile so the wallbox falls back to whatever lower-priority profile applies.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const HYSTERESIS_FACTOR = 0.85;   // release DLM only when load < 85% of limit
const RECENT_WINDOW_MIN = 5;      // ignore readings older than 5 min (stale)
const STACK_LEVEL_DLM = 2;        // higher than power_limit (0) and pv_surplus (1)
const PROFILE_ID_DLM = 100;       // distinct id so wallbox keeps it separate from power_limit (id=1)

function kwToAmps(kw: number): number {
  // 3-phase 400 V assumption (matches power-limit-scheduler)
  return Math.max(6, Math.round((kw * 1000) / (400 * Math.sqrt(3))));
}

interface DispatchResult {
  scope: "site" | "group";
  scope_id: string;
  status: "ok" | "no_data" | "no_limit" | "no_charge_points" | "released" | "throttled" | "skipped_offline" | "skipped_unchanged" | "error";
  detail?: string;
  reading_kw?: number;
  limit_kw?: number;
  charge_points?: number;
  per_cp_amps?: number | null;
}

async function fetchLatestMeterPowerKw(meterId: string): Promise<number | null> {
  // Try 5-min aggregated table first; fall back to raw readings
  const cutoff = new Date(Date.now() - RECENT_WINDOW_MIN * 60_000).toISOString();
  const { data: agg } = await admin
    .from("meter_power_readings_5min")
    .select("power_avg, bucket")
    .eq("meter_id", meterId)
    .gte("bucket", cutoff)
    .order("bucket", { ascending: false })
    .limit(1);
  if (agg && agg.length > 0) return Number(agg[0].power_avg);

  const { data: raw } = await admin
    .from("meter_power_readings")
    .select("power_value, recorded_at")
    .eq("meter_id", meterId)
    .gte("recorded_at", cutoff)
    .order("recorded_at", { ascending: false })
    .limit(1);
  if (raw && raw.length > 0) return Number(raw[0].power_value);
  return null;
}

async function applyOrClearDlm(
  cpRows: Array<{ id: string; ocpp_id: string; ws_connected: boolean | null; supports_charging_profile: boolean | null; max_power_kw: number | null }>,
  perCpKw: number | null,  // null = clear (release)
): Promise<{ throttled: number; cleared: number; skipped_offline: number; skipped_unchanged: number }> {
  let throttled = 0, cleared = 0, skippedOffline = 0, skippedUnchanged = 0;
  const targetAmps = perCpKw === null ? null : kwToAmps(perCpKw);

  for (const cp of cpRows) {
    const { data: active } = await admin
      .from("charge_point_active_profile")
      .select("current_limit_a")
      .eq("charge_point_id", cp.id)
      .eq("connector_id", 0)
      .eq("source", "dlm")
      .maybeSingle();

    const activeAmps = active?.current_limit_a != null ? Number(active.current_limit_a) : null;
    if (activeAmps === targetAmps) { skippedUnchanged++; continue; }

    if (!cp.ws_connected) { skippedOffline++; continue; }

    const useChangeConfig = cp.supports_charging_profile === false;
    let command: string;
    let payload: Record<string, unknown>;

    if (targetAmps === null) {
      if (useChangeConfig) {
        const maxA = kwToAmps(Number(cp.max_power_kw ?? 22));
        command = "ChangeConfiguration";
        payload = { key: "MaxChargingCurrent", value: String(maxA) };
      } else {
        command = "ClearChargingProfile";
        payload = { id: PROFILE_ID_DLM, connectorId: 0, chargingProfilePurpose: "TxDefaultProfile", stackLevel: STACK_LEVEL_DLM };
      }
    } else if (useChangeConfig) {
      command = "ChangeConfiguration";
      payload = { key: "MaxChargingCurrent", value: String(targetAmps) };
    } else {
      command = "SetChargingProfile";
      payload = {
        connectorId: 0,
        csChargingProfiles: {
          chargingProfileId: PROFILE_ID_DLM,
          stackLevel: STACK_LEVEL_DLM,
          chargingProfilePurpose: "TxDefaultProfile",
          chargingProfileKind: "Absolute",
          chargingSchedule: {
            chargingRateUnit: "A",
            chargingSchedulePeriod: [{ startPeriod: 0, limit: targetAmps }],
          },
        },
      };
    }

    await admin.from("pending_ocpp_commands").insert({
      charge_point_ocpp_id: cp.ocpp_id, command, payload, status: "pending",
    });

    if (targetAmps === null) {
      await admin
        .from("charge_point_active_profile")
        .delete()
        .eq("charge_point_id", cp.id)
        .eq("connector_id", 0)
        .eq("source", "dlm");
      cleared++;
    } else {
      await admin.from("charge_point_active_profile").upsert({
        charge_point_id: cp.id,
        connector_id: 0,
        profile_purpose: "TxDefaultProfile",
        source: "dlm",
        current_limit_a: targetAmps,
        applied_at: new Date().toISOString(),
        metadata: { command },
      }, { onConflict: "charge_point_id,connector_id,profile_purpose" });
      throttled++;
    }
  }

  return { throttled, cleared, skipped_offline: skippedOffline, skipped_unchanged: skippedUnchanged };
}

async function processSite(loc: any): Promise<DispatchResult> {
  const limitKw = Number(loc.grid_limit_kw);
  if (!loc.grid_limit_kw || !Number.isFinite(limitKw) || limitKw <= 0) {
    return { scope: "site", scope_id: loc.id, status: "no_limit" };
  }

  const { data: mainMeter } = await admin
    .rpc("get_location_main_meter", { p_location_id: loc.id })
    .single();
  const mainMeterId = mainMeter as unknown as string | null;
  if (!mainMeterId) return { scope: "site", scope_id: loc.id, status: "no_data", detail: "no main meter" };

  const readingKw = await fetchLatestMeterPowerKw(mainMeterId);
  if (readingKw === null) return { scope: "site", scope_id: loc.id, status: "no_data", detail: "stale/missing meter" };

  // CPs at this location
  const { data: cps } = await admin
    .from("charge_points")
    .select("id, ocpp_id, ws_connected, supports_charging_profile, max_power_kw")
    .eq("location_id", loc.id);
  if (!cps || cps.length === 0) return { scope: "site", scope_id: loc.id, status: "no_charge_points" };

  // The main-meter reading already includes the current charging draw, so we
  // compute "headroom" relative to the limit and divide it across CPs.
  // Released when reading < HYSTERESIS * limit.
  if (readingKw < limitKw * HYSTERESIS_FACTOR) {
    const r = await applyOrClearDlm(cps, null);
    return { scope: "site", scope_id: loc.id, status: "released", reading_kw: readingKw, limit_kw: limitKw, charge_points: cps.length, ...r };
  }

  // Over (or near) limit: cap each CP at headroom / N (min 0). Headroom can
  // be negative when we're already over → fall back to MINIMAL (1.4 kW) to
  // start backing off without fully shutting off.
  const headroomKw = Math.max(0, limitKw - readingKw);
  const perCpKw = Math.max(1.4, headroomKw / cps.length);
  const r = await applyOrClearDlm(cps, perCpKw);
  return { scope: "site", scope_id: loc.id, status: "throttled", reading_kw: readingKw, limit_kw: limitKw, charge_points: cps.length, per_cp_amps: kwToAmps(perCpKw), ...r };
}

async function processGroup(group: any): Promise<DispatchResult> {
  const dlm = (group.energy_settings ?? {}).dlm ?? {};
  if (!dlm.enabled || !dlm.reference_meter_id || !dlm.limit_kw) {
    return { scope: "group", scope_id: group.id, status: "no_limit" };
  }
  const limitKw = Number(dlm.limit_kw);
  if (!Number.isFinite(limitKw) || limitKw <= 0) {
    return { scope: "group", scope_id: group.id, status: "no_limit" };
  }

  const readingKw = await fetchLatestMeterPowerKw(String(dlm.reference_meter_id));
  if (readingKw === null) return { scope: "group", scope_id: group.id, status: "no_data" };

  const { data: cps } = await admin
    .from("charge_points")
    .select("id, ocpp_id, ws_connected, supports_charging_profile, max_power_kw")
    .eq("group_id", group.id);
  if (!cps || cps.length === 0) return { scope: "group", scope_id: group.id, status: "no_charge_points" };

  if (readingKw < limitKw * HYSTERESIS_FACTOR) {
    const r = await applyOrClearDlm(cps, null);
    return { scope: "group", scope_id: group.id, status: "released", reading_kw: readingKw, limit_kw: limitKw, charge_points: cps.length, ...r };
  }
  const headroomKw = Math.max(0, limitKw - readingKw);
  const perCpKw = Math.max(1.4, headroomKw / cps.length);
  const r = await applyOrClearDlm(cps, perCpKw);
  return { scope: "group", scope_id: group.id, status: "throttled", reading_kw: readingKw, limit_kw: limitKw, charge_points: cps.length, per_cp_amps: kwToAmps(perCpKw), ...r };
}

async function run() {
  const results: DispatchResult[] = [];

  // Site-level (hard limit)
  const { data: locs } = await admin
    .from("locations")
    .select("id, grid_limit_kw")
    .not("grid_limit_kw", "is", null);
  for (const loc of locs ?? []) {
    try { results.push(await processSite(loc)); }
    catch (e) { results.push({ scope: "site", scope_id: loc.id, status: "error", detail: (e as Error).message }); }
  }

  // Group-level (soft limit)
  const { data: groups } = await admin
    .from("charge_point_groups")
    .select("id, energy_settings");
  for (const g of groups ?? []) {
    const dlm = ((g.energy_settings ?? {}) as any).dlm ?? {};
    if (!dlm.enabled) continue;
    try { results.push(await processGroup(g)); }
    catch (e) { results.push({ scope: "group", scope_id: g.id, status: "error", detail: (e as Error).message }); }
  }

  return { processed: results.length, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const out = await run();
    console.log(`[dlm-scheduler] processed=${out.processed}`,
      JSON.stringify(out.results.filter((r) => !["no_limit", "skipped_unchanged"].includes(r.status))));
    return new Response(JSON.stringify({ ok: true, ...out }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[dlm-scheduler] error", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
