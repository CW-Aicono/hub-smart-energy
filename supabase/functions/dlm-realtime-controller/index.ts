// K6 — Dynamic DLM Realtime Controller
//
// Liest pro aktiver location_dlm_config:
//  • letzten Hausanschluss-Messwert (max. 60s alt)
//  • aktive Ladepunkte am Standort, sortiert nach priority_order
// und ruft `allocate()` aus packages/charging-shared/dlmAllocation auf.
// Für jeden CP wird – falls geändert – ein SetChargingProfile (oder
// RemoteStopTransaction bei target=null) in pending_ocpp_commands geschrieben.
// Jede Ausführung wird in dlm_control_log protokolliert.
//
// Profile-Identitäten:
//   stackLevel = 3, profileId = 110  → höher als power_limit (0), pv (1), dlm_v1 (2)
//   source     = 'dlm_realtime'
//
// Auslöser:
//   1. pg_cron alle 60 Sekunden
//   2. (optional) DB-Trigger auf meter_power_readings via pg_net (Phase 2)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const STACK_LEVEL = 3;
const PROFILE_ID = 110;
const SOURCE = "dlm_realtime";
const RECENT_WINDOW_S = 60;

// --- inlined Allokationslogik (Mirror von src/lib/charging/dlmAllocation.ts) ---
interface DlmCfg {
  grid_limit_kw: number;
  safety_buffer_kw: number;
  fallback_kw_per_cp: number;
  min_charge_kw: number;
}
interface Cp {
  id: string;
  max_kw: number;
}
interface Alloc {
  id: string;
  target_kw: number | null;
  reason: string;
}

function allocate(cfg: DlmCfg, measured: number | null, baseload: number, cps: Cp[]) {
  if (cps.length === 0) return { available_kw: 0, fallback_active: false, allocations: [] as Alloc[] };
  if (measured === null) {
    const cap = Math.max(0, cfg.grid_limit_kw - cfg.safety_buffer_kw);
    const maxCps = Math.floor(cap / cfg.fallback_kw_per_cp);
    return {
      available_kw: cap,
      fallback_active: true,
      allocations: cps.map((cp, i) => ({
        id: cp.id,
        target_kw: i < maxCps ? Math.min(cfg.fallback_kw_per_cp, cp.max_kw) : null,
        reason: i < maxCps ? "fallback" : "pause_budget",
      })),
    };
  }
  const available = Math.max(0, cfg.grid_limit_kw - baseload - cfg.safety_buffer_kw);
  let rem = available;
  const out: Alloc[] = [];
  for (const cp of cps) {
    if (rem < cfg.min_charge_kw) {
      out.push({ id: cp.id, target_kw: null, reason: "pause_budget" });
      continue;
    }
    const give = Math.min(cp.max_kw, rem);
    out.push({ id: cp.id, target_kw: give, reason: give >= cp.max_kw ? "full" : "throttled" });
    rem -= give;
  }
  return { available_kw: available, fallback_active: false, allocations: out };
}

function kwToAmps(kw: number): number {
  return Math.max(6, Math.min(32, Math.round((kw * 1000) / (400 * Math.sqrt(3)))));
}

async function fetchLatestPowerKw(meterId: string): Promise<number | null> {
  // Testzähler (Simulation) → Wert direkt aus simulation_meter_state
  const { data: meterRow } = await admin
    .from("meters")
    .select("capture_type, sim_unit")
    .eq("id", meterId)
    .maybeSingle();
  if (meterRow?.capture_type === "simulation") {
    const { data: sim } = await admin
      .from("simulation_meter_state")
      .select("current_value")
      .eq("meter_id", meterId)
      .maybeSingle();
    if (!sim) return 0;
    const raw = Number(sim.current_value);
    const unit = String(meterRow.sim_unit ?? "kW").toLowerCase();
    return unit === "w" ? raw / 1000 : raw;
  }

  const cutoff = new Date(Date.now() - RECENT_WINDOW_S * 1000).toISOString();
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
    .select("power_value")
    .eq("meter_id", meterId)
    .gte("recorded_at", cutoff)
    .order("recorded_at", { ascending: false })
    .limit(1);
  return raw && raw.length > 0 ? Number(raw[0].power_value) : null;
}

async function processLocation(cfg: any): Promise<any> {
  const limit = Number(cfg.grid_limit_kw);
  if (!cfg.is_active || !limit) return { location_id: cfg.location_id, status: "inactive" };

  // CPs am Standort
  const { data: cps } = await admin
    .from("charge_points")
    .select("id, ocpp_id, ws_connected, supports_charging_profile, max_power_kw")
    .eq("location_id", cfg.location_id);
  if (!cps || cps.length === 0) return { location_id: cfg.location_id, status: "no_cps" };

  // Reihenfolge nach priority_order (Rest am Ende)
  const order: string[] = Array.isArray(cfg.priority_order) ? cfg.priority_order : [];
  const orderIdx = new Map(order.map((id, i) => [id, i]));
  const orderedCps = [...cps].sort((a, b) => {
    const ai = orderIdx.has(a.id) ? orderIdx.get(a.id)! : 999;
    const bi = orderIdx.has(b.id) ? orderIdx.get(b.id)! : 999;
    return ai - bi;
  });

  // Messwert
  const measured = cfg.reference_meter_id ? await fetchLatestPowerKw(cfg.reference_meter_id) : null;

  // baseload = measured (konservativ, da wir aktive EV-Last nicht trennen können)
  // → Auswirkung: wir geben EVs zunächst nur Headroom; sobald sie pausieren,
  //   sinkt measured beim nächsten Zyklus und das Budget wächst.
  const baseload = measured ?? 0;

  const allocCps: Cp[] = orderedCps.map((cp) => ({
    id: cp.id,
    max_kw: Number(cp.max_power_kw ?? 22),
  }));

  const result = allocate(
    {
      grid_limit_kw: limit,
      safety_buffer_kw: Number(cfg.safety_buffer_kw ?? 2),
      fallback_kw_per_cp: Number(cfg.fallback_kw_per_cp ?? 4.2),
      min_charge_kw: Number(cfg.min_charge_kw ?? 1.4),
    },
    measured,
    baseload,
    allocCps,
  );

  const applied: any[] = [];

  for (let i = 0; i < orderedCps.length; i++) {
    const cp = orderedCps[i];
    const alloc = result.allocations[i];
    const targetAmps = alloc.target_kw === null ? null : kwToAmps(alloc.target_kw);

    // Idempotenz
    const { data: active } = await admin
      .from("charge_point_active_profile")
      .select("current_limit_a")
      .eq("charge_point_id", cp.id)
      .eq("connector_id", 0)
      .eq("source", SOURCE)
      .maybeSingle();
    const activeAmps = active?.current_limit_a != null ? Number(active.current_limit_a) : null;
    if (activeAmps === targetAmps) {
      applied.push({ cp: cp.ocpp_id, target_kw: alloc.target_kw, reason: alloc.reason, skipped: "unchanged" });
      continue;
    }
    if (!cp.ws_connected) {
      applied.push({ cp: cp.ocpp_id, target_kw: alloc.target_kw, skipped: "offline" });
      continue;
    }

    const useChangeConfig = cp.supports_charging_profile === false;
    let command: string;
    let payload: Record<string, unknown>;

    if (targetAmps === null) {
      if (useChangeConfig) {
        command = "ChangeConfiguration";
        payload = { key: "MaxChargingCurrent", value: "6" }; // minimal; alternativ RemoteStop
      } else {
        command = "SetChargingProfile";
        payload = {
          connectorId: 0,
          csChargingProfiles: {
            chargingProfileId: PROFILE_ID,
            stackLevel: STACK_LEVEL,
            chargingProfilePurpose: "TxDefaultProfile",
            chargingProfileKind: "Absolute",
            chargingSchedule: {
              chargingRateUnit: "A",
              chargingSchedulePeriod: [{ startPeriod: 0, limit: 0 }],
            },
          },
        };
      }
    } else if (useChangeConfig) {
      command = "ChangeConfiguration";
      payload = { key: "MaxChargingCurrent", value: String(targetAmps) };
    } else {
      command = "SetChargingProfile";
      payload = {
        connectorId: 0,
        csChargingProfiles: {
          chargingProfileId: PROFILE_ID,
          stackLevel: STACK_LEVEL,
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
      charge_point_ocpp_id: cp.ocpp_id,
      command,
      payload,
      status: "pending",
    });

    if (targetAmps === null) {
      await admin
        .from("charge_point_active_profile")
        .delete()
        .eq("charge_point_id", cp.id)
        .eq("connector_id", 0)
        .eq("source", SOURCE);
    } else {
      await admin.from("charge_point_active_profile").upsert(
        {
          charge_point_id: cp.id,
          connector_id: 0,
          profile_purpose: "TxDefaultProfile",
          source: SOURCE,
          current_limit_a: targetAmps,
          applied_at: new Date().toISOString(),
          metadata: { command, reason: alloc.reason },
        },
        { onConflict: "charge_point_id,connector_id,profile_purpose" },
      );
    }

    applied.push({ cp: cp.ocpp_id, target_kw: alloc.target_kw, amps: targetAmps, reason: alloc.reason });
  }

  // Audit
  await admin.from("dlm_control_log").insert({
    tenant_id: cfg.tenant_id,
    location_id: cfg.location_id,
    measured_kw: measured,
    available_kw: result.available_kw,
    applied_profiles: applied,
    reason: result.fallback_active ? "fallback_stale_sensor" : "regular",
  });

  return {
    location_id: cfg.location_id,
    status: "ok",
    measured_kw: measured,
    available_kw: result.available_kw,
    fallback: result.fallback_active,
    cps: applied.length,
  };
}

async function run() {
  const { data: cfgs, error } = await admin
    .from("location_dlm_config")
    .select("*")
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  if (!cfgs || cfgs.length === 0) return { processed: 0, results: [] };

  const results = [];
  for (const cfg of cfgs) {
    try {
      results.push(await processLocation(cfg));
    } catch (e) {
      console.error(`[dlm-realtime] loc=${cfg.location_id} error`, e);
      results.push({ location_id: cfg.location_id, status: "error", detail: (e as Error).message });
    }
  }
  return { processed: cfgs.length, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const result = await run();
    console.log(`[dlm-realtime-controller] processed=${result.processed}`);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
