// Power-Limit-Scheduler — runs every few minutes via pg_cron.
// Reads each connected charge point's effective power-limit schedule (CP-level
// or inherited from group), computes the target current limit (Amps) for the
// current local time, and queues the corresponding OCPP command in
// public.pending_ocpp_commands. Commands are deduplicated against
// public.charge_point_active_profile so we don't spam the wallbox.
//
// Fallback strategy:
//   1) If supports_charging_profile === true OR NULL -> SetChargingProfile
//   2) If supports_charging_profile === false        -> ChangeConfiguration(MaxChargingCurrent)
// The persistent OCPP server flips supports_charging_profile to false when it
// receives a CALLERROR with NotSupported, then the next tick uses the fallback.

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

interface PowerLimitSchedule {
  enabled: boolean;
  mode: "allday" | "window";
  time_from: string; // "HH:mm"
  time_to: string;   // "HH:mm"
  limit_type: "kw" | "minimal";
  limit_kw: number | null;
}

const DEFAULT_SCHEDULE: PowerLimitSchedule = {
  enabled: false,
  mode: "allday",
  time_from: "18:00",
  time_to: "07:00",
  limit_type: "kw",
  limit_kw: null,
};

const MINIMAL_KW_PER_CONNECTOR = 1.4; // 6 A * 230 V single-phase ≈ minimum allowed by most wallboxes

function toBerlinHHmm(d: Date): string {
  // Convert to Europe/Berlin local HH:mm
  const fmt = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(d).replace(".", ":"); // safety
}

function isInsideWindow(now: string, from: string, to: string): boolean {
  // Compare HH:mm strings, supports overnight windows
  if (from === to) return true;
  if (from < to) return now >= from && now < to;
  return now >= from || now < to; // overnight
}

function effectiveSchedule(raw: unknown): PowerLimitSchedule {
  if (!raw || typeof raw !== "object") return DEFAULT_SCHEDULE;
  const s = raw as Partial<PowerLimitSchedule>;
  return {
    enabled: Boolean(s.enabled),
    mode: s.mode === "window" ? "window" : "allday",
    time_from: typeof s.time_from === "string" ? s.time_from : "18:00",
    time_to: typeof s.time_to === "string" ? s.time_to : "07:00",
    limit_type: s.limit_type === "minimal" ? "minimal" : "kw",
    limit_kw: typeof s.limit_kw === "number" ? s.limit_kw : null,
  };
}

function kwToAmps(kw: number, phases: 1 | 3 = 3): number {
  // 3-phase 400V: A = kW * 1000 / (400 * sqrt(3)) ≈ kW * 1.443
  // 1-phase 230V: A = kW * 1000 / 230 ≈ kW * 4.348
  if (phases === 1) return Math.max(6, Math.round((kw * 1000) / 230));
  return Math.max(6, Math.round((kw * 1000) / (400 * Math.sqrt(3))));
}

interface DispatchResult {
  charge_point_id: string;
  ocpp_id: string;
  action: "queued" | "skipped_unchanged" | "skipped_offline" | "cleared" | "no_schedule";
  detail?: string;
  target_amps?: number | null;
}

async function processChargePoint(cp: any, groupSettings: Record<string, unknown> | null): Promise<DispatchResult> {
  const cpSchedule = effectiveSchedule(cp.power_limit_schedule);
  const groupSchedule = groupSettings ? effectiveSchedule((groupSettings as any).power_limit_schedule) : DEFAULT_SCHEDULE;

  // CP overrides group when enabled
  const schedule = cpSchedule.enabled ? cpSchedule : groupSchedule;

  // Current Berlin local time
  const nowHHmm = toBerlinHHmm(new Date());

  let targetKw: number | null = null;
  if (schedule.enabled) {
    const inside = schedule.mode === "allday" || isInsideWindow(nowHHmm, schedule.time_from, schedule.time_to);
    if (inside) {
      if (schedule.limit_type === "minimal") {
        targetKw = MINIMAL_KW_PER_CONNECTOR;
      } else if (typeof schedule.limit_kw === "number" && schedule.limit_kw > 0) {
        targetKw = schedule.limit_kw;
      }
    }
  }

  // Determine target Amps (null = no profile / clear)
  const targetAmps = targetKw !== null ? kwToAmps(targetKw, 3) : null;

  // Read current active profile (source = power_limit) for idempotency
  const { data: active } = await admin
    .from("charge_point_active_profile")
    .select("id, current_limit_a")
    .eq("charge_point_id", cp.id)
    .eq("connector_id", 0)
    .eq("source", "power_limit")
    .maybeSingle();

  const activeAmps = active?.current_limit_a != null ? Number(active.current_limit_a) : null;

  // Idempotency: if target equals active, skip
  if (targetAmps === activeAmps) {
    return { charge_point_id: cp.id, ocpp_id: cp.ocpp_id, action: "skipped_unchanged", target_amps: targetAmps };
  }

  // Wallbox must be online to accept profiles; otherwise skip — next tick will retry
  if (!cp.ws_connected) {
    return { charge_point_id: cp.id, ocpp_id: cp.ocpp_id, action: "skipped_offline", target_amps: targetAmps };
  }

  // Build & queue command
  const useChangeConfig = cp.supports_charging_profile === false;
  let command: string;
  let payload: Record<string, unknown>;

  if (targetAmps === null) {
    // Clear / disable existing limit
    if (useChangeConfig) {
      // Reset to a high default; many vendors accept the connector's max
      const maxA = kwToAmps(Number(cp.max_power_kw ?? 22), 3);
      command = "ChangeConfiguration";
      payload = { key: "MaxChargingCurrent", value: String(maxA) };
    } else {
      command = "ClearChargingProfile";
      payload = { connectorId: 0, chargingProfilePurpose: "TxDefaultProfile" };
    }
  } else if (useChangeConfig) {
    command = "ChangeConfiguration";
    payload = { key: "MaxChargingCurrent", value: String(targetAmps) };
  } else {
    command = "SetChargingProfile";
    payload = {
      connectorId: 0,
      csChargingProfiles: {
        chargingProfileId: 1,
        stackLevel: 0,
        chargingProfilePurpose: "TxDefaultProfile",
        chargingProfileKind: "Recurring",
        recurrencyKind: "Daily",
        chargingSchedule: {
          chargingRateUnit: "A",
          chargingSchedulePeriod: [{ startPeriod: 0, limit: targetAmps }],
        },
      },
    };
  }

  const { error: insErr } = await admin.from("pending_ocpp_commands").insert({
    charge_point_ocpp_id: cp.ocpp_id,
    command,
    payload,
    status: "pending",
  });
  if (insErr) {
    return { charge_point_id: cp.id, ocpp_id: cp.ocpp_id, action: "queued", detail: `insert error: ${insErr.message}` };
  }

  // Update active_profile row (best-effort optimistic write — dispatcher will
  // mark CP as supports_charging_profile=false on NotSupported and a future
  // tick will reconcile).
  if (targetAmps === null) {
    await admin
      .from("charge_point_active_profile")
      .delete()
      .eq("charge_point_id", cp.id)
      .eq("connector_id", 0)
      .eq("source", "power_limit");
  } else {
    await admin
      .from("charge_point_active_profile")
      .upsert({
        charge_point_id: cp.id,
        connector_id: 0,
        profile_purpose: "TxDefaultProfile",
        source: "power_limit",
        current_limit_a: targetAmps,
        applied_at: new Date().toISOString(),
        metadata: { command, schedule_mode: schedule.mode },
      }, { onConflict: "charge_point_id,connector_id,profile_purpose" });
  }

  return {
    charge_point_id: cp.id,
    ocpp_id: cp.ocpp_id,
    action: targetAmps === null ? "cleared" : "queued",
    detail: `${command} -> ${targetAmps ?? "clear"} A`,
    target_amps: targetAmps,
  };
}

async function run(): Promise<{ processed: number; results: DispatchResult[] }> {
  // Fetch all charge points (we filter ws_connected per CP)
  const { data: cps, error } = await admin
    .from("charge_points")
    .select("id, tenant_id, ocpp_id, group_id, power_limit_schedule, ws_connected, supports_charging_profile, supports_change_configuration, max_power_kw");

  if (error) throw new Error(`fetch charge_points: ${error.message}`);
  if (!cps || cps.length === 0) return { processed: 0, results: [] };

  // Pre-fetch group energy_settings
  const groupIds = Array.from(new Set(cps.map((c: any) => c.group_id).filter(Boolean)));
  const groupSettingsMap = new Map<string, Record<string, unknown>>();
  if (groupIds.length > 0) {
    const { data: groups } = await admin
      .from("charge_point_groups")
      .select("id, energy_settings")
      .in("id", groupIds);
    for (const g of groups ?? []) {
      groupSettingsMap.set(g.id as string, (g.energy_settings ?? {}) as Record<string, unknown>);
    }
  }

  const results: DispatchResult[] = [];
  for (const cp of cps as any[]) {
    try {
      const groupSettings = cp.group_id ? groupSettingsMap.get(cp.group_id) ?? null : null;
      results.push(await processChargePoint(cp, groupSettings));
    } catch (e) {
      results.push({
        charge_point_id: cp.id,
        ocpp_id: cp.ocpp_id,
        action: "queued",
        detail: `error: ${(e as Error).message}`,
      });
    }
  }
  return { processed: cps.length, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const result = await run();
    console.log(`[power-limit-scheduler] processed=${result.processed}`,
      JSON.stringify(result.results.filter(r => r.action !== "skipped_unchanged" && r.action !== "skipped_offline")));
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[power-limit-scheduler] error", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
