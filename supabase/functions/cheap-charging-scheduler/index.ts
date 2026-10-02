// Cheap-Charging Scheduler — runs every 5 minutes via pg_cron.
//
// Reads each charge point's effective cheap-charging configuration (CP override
// or inherited from group), checks whether the current EPEX day-ahead spot
// price (DE-LU) is at or below the configured threshold OR — if no price data
// is available — whether the current Berlin local time falls inside the
// fallback time window. If yes, dispatches a SetChargingProfile (or fallback
// ChangeConfiguration when supports_charging_profile === false) at the
// configured kW limit, with stackLevel=1 so it sits below DLM (stackLevel=2)
// but above the regular power-limit schedule (stackLevel=0).
//
// All commands are deduplicated against public.charge_point_active_profile so
// we don't re-issue the same profile every tick.

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

interface CheapChargingConfig {
  enabled: boolean;
  max_price_eur_mwh: number;
  limit_kw: number;
  use_fallback_window: boolean;
  fallback_time_from: string; // "HH:mm"
  fallback_time_to: string;   // "HH:mm"
}

const DEFAULT_CFG: CheapChargingConfig = {
  enabled: false,
  max_price_eur_mwh: 60,
  limit_kw: 11,
  use_fallback_window: true,
  fallback_time_from: "22:00",
  fallback_time_to: "06:00",
};

function asConfig(raw: unknown): CheapChargingConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_CFG;
  const r = raw as Record<string, unknown>;
  return {
    enabled: Boolean(r.enabled),
    max_price_eur_mwh: typeof r.max_price_eur_mwh === "number" ? r.max_price_eur_mwh : 60,
    limit_kw: typeof r.limit_kw === "number" && r.limit_kw > 0 ? r.limit_kw : 11,
    use_fallback_window: r.use_fallback_window !== false,
    fallback_time_from: typeof r.fallback_time_from === "string" ? r.fallback_time_from : "22:00",
    fallback_time_to: typeof r.fallback_time_to === "string" ? r.fallback_time_to : "06:00",
  };
}

function toBerlinHHmm(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function isInsideWindow(now: string, from: string, to: string): boolean {
  if (from === to) return true;
  if (from < to) return now >= from && now < to;
  return now >= from || now < to;
}

function kwToAmps(kw: number): number {
  // 3-phase 400V
  return Math.max(6, Math.round((kw * 1000) / (400 * Math.sqrt(3))));
}

interface DispatchResult {
  charge_point_id: string;
  ocpp_id: string;
  action: "queued" | "skipped_unchanged" | "skipped_offline" | "cleared" | "no_config" | "error";
  detail?: string;
  target_amps?: number | null;
  current_price?: number | null;
}

async function getCurrentSpotPrice(): Promise<number | null> {
  // Find the spot price covering "now" (timestamp is the start of the hour, validity = 1h)
  const now = new Date();
  const hourStart = new Date(now);
  hourStart.setMinutes(0, 0, 0);
  const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

  const { data, error } = await admin
    .from("spot_prices")
    .select("price_eur_mwh, timestamp")
    .eq("market_area", "DE-LU")
    .gte("timestamp", hourStart.toISOString())
    .lt("timestamp", hourEnd.toISOString())
    .order("timestamp", { ascending: false })
    .limit(1);

  if (error) {
    console.warn("[cheap-charging] spot price fetch error:", error.message);
    return null;
  }
  if (!data || data.length === 0) return null;
  return Number(data[0].price_eur_mwh);
}

async function processChargePoint(
  cp: any,
  groupCfg: CheapChargingConfig,
  spotPrice: number | null,
): Promise<DispatchResult> {
  const cpCfg = asConfig(cp.cheap_charging_schedule);
  const cfg = cpCfg.enabled ? cpCfg : groupCfg;

  if (!cfg.enabled) {
    return { charge_point_id: cp.id, ocpp_id: cp.ocpp_id, action: "no_config", current_price: spotPrice };
  }

  // Decide whether cheap-window applies
  let shouldCharge = false;
  let reason = "";
  if (spotPrice !== null) {
    if (spotPrice <= cfg.max_price_eur_mwh) {
      shouldCharge = true;
      reason = `spot ${spotPrice}€/MWh ≤ ${cfg.max_price_eur_mwh}`;
    } else {
      reason = `spot ${spotPrice}€/MWh > ${cfg.max_price_eur_mwh}`;
    }
  } else if (cfg.use_fallback_window) {
    const nowHHmm = toBerlinHHmm(new Date());
    if (isInsideWindow(nowHHmm, cfg.fallback_time_from, cfg.fallback_time_to)) {
      shouldCharge = true;
      reason = `fallback window ${cfg.fallback_time_from}-${cfg.fallback_time_to}`;
    } else {
      reason = `outside fallback window`;
    }
  } else {
    reason = "no spot price & fallback disabled";
  }

  const targetAmps = shouldCharge ? kwToAmps(cfg.limit_kw) : null;

  // Idempotency check against active profile
  const { data: active } = await admin
    .from("charge_point_active_profile")
    .select("id, current_limit_a")
    .eq("charge_point_id", cp.id)
    .eq("connector_id", 0)
    .eq("source", "cheap_charging")
    .maybeSingle();

  const activeAmps = active?.current_limit_a != null ? Number(active.current_limit_a) : null;

  if (targetAmps === activeAmps) {
    return {
      charge_point_id: cp.id,
      ocpp_id: cp.ocpp_id,
      action: "skipped_unchanged",
      target_amps: targetAmps,
      current_price: spotPrice,
      detail: reason,
    };
  }

  if (!cp.ws_connected) {
    return {
      charge_point_id: cp.id,
      ocpp_id: cp.ocpp_id,
      action: "skipped_offline",
      target_amps: targetAmps,
      current_price: spotPrice,
    };
  }

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
      payload = { connectorId: 0, chargingProfilePurpose: "TxDefaultProfile", stackLevel: 1 };
    }
  } else if (useChangeConfig) {
    command = "ChangeConfiguration";
    payload = { key: "MaxChargingCurrent", value: String(targetAmps) };
  } else {
    command = "SetChargingProfile";
    payload = {
      connectorId: 0,
      csChargingProfiles: {
        chargingProfileId: 3, // 1=power_limit, 2=pv_surplus (solar-charging), 3=cheap
        stackLevel: 1,
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
    return {
      charge_point_id: cp.id,
      ocpp_id: cp.ocpp_id,
      action: "error",
      detail: `insert error: ${insErr.message}`,
      current_price: spotPrice,
    };
  }

  if (targetAmps === null) {
    await admin
      .from("charge_point_active_profile")
      .delete()
      .eq("charge_point_id", cp.id)
      .eq("connector_id", 0)
      .eq("source", "cheap_charging");
  } else {
    await admin
      .from("charge_point_active_profile")
      .upsert({
        charge_point_id: cp.id,
        connector_id: 0,
        profile_purpose: "TxDefaultProfile",
        source: "cheap_charging",
        current_limit_a: targetAmps,
        applied_at: new Date().toISOString(),
        metadata: { command, reason, spot_price_eur_mwh: spotPrice, limit_kw: cfg.limit_kw },
      }, { onConflict: "charge_point_id,connector_id,profile_purpose" });
  }

  return {
    charge_point_id: cp.id,
    ocpp_id: cp.ocpp_id,
    action: targetAmps === null ? "cleared" : "queued",
    detail: `${command} -> ${targetAmps ?? "clear"} A (${reason})`,
    target_amps: targetAmps,
    current_price: spotPrice,
  };
}

async function run() {
  const spotPrice = await getCurrentSpotPrice();

  const { data: cps, error } = await admin
    .from("charge_points")
    .select("id, tenant_id, ocpp_id, group_id, cheap_charging_schedule, ws_connected, supports_charging_profile, supports_change_configuration, max_power_kw");
  if (error) throw new Error(`fetch charge_points: ${error.message}`);
  if (!cps || cps.length === 0) return { processed: 0, spot_price: spotPrice, results: [] };

  const groupIds = Array.from(new Set(cps.map((c: any) => c.group_id).filter(Boolean)));
  const groupCfgMap = new Map<string, CheapChargingConfig>();
  if (groupIds.length > 0) {
    const { data: groups } = await admin
      .from("charge_point_groups")
      .select("id, energy_settings")
      .in("id", groupIds);
    for (const g of groups ?? []) {
      const es = (g as any).energy_settings ?? {};
      groupCfgMap.set(g.id as string, asConfig(es.cheap_charging));
    }
  }

  const results: DispatchResult[] = [];
  for (const cp of cps as any[]) {
    try {
      const groupCfg = cp.group_id ? groupCfgMap.get(cp.group_id) ?? DEFAULT_CFG : DEFAULT_CFG;
      results.push(await processChargePoint(cp, groupCfg, spotPrice));
    } catch (e) {
      results.push({
        charge_point_id: cp.id,
        ocpp_id: cp.ocpp_id,
        action: "error",
        detail: (e as Error).message,
      });
    }
  }
  return { processed: cps.length, spot_price: spotPrice, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const result = await run();
    const interesting = result.results.filter(r =>
      r.action !== "skipped_unchanged" && r.action !== "skipped_offline" && r.action !== "no_config"
    );
    console.log(`[cheap-charging-scheduler] processed=${result.processed} spot=${result.spot_price}`,
      JSON.stringify(interesting));
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[cheap-charging-scheduler] error", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
