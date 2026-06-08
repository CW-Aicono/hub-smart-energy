// Peak-Shaving Scheduler — Phase 2: jetzt mit echtem Hardware-Dispatch via gateway_commands
//
// Erweiterungen vs. Phase 1:
//  - Wenn dem Speicher ein gateway_device_id zugeordnet ist, wird der Lade-/Entladebefehl
//    über public.gateway_commands an das EMS-Gateway/Modbus weitergereicht.
//  - Jeder Dispatch wird in public.peak_shaving_dispatch_log dokumentiert.
//  - Idempotenz: Wenn die letzte gesendete Soll-Leistung sich nicht ändert, kein neuer Befehl.
//  - SoC-Reserve wird respektiert (Entladung stoppt, wenn current_soc_pct < reserve_soc_pct).
//
// Aufgerufen jede Minute via pg_cron.

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

const RECENT_WINDOW_MIN = 5;

interface ConfigRow {
  id: string;
  tenant_id: string;
  location_id: string;
  storage_id: string;
  peak_limit_kw: number;
  reserve_soc_pct: number;
  mode: "threshold" | "forecast" | "event";
  network_tariff_eur_per_kw_year: number;
  billing_cycle: "monthly" | "yearly";
  hysteresis_pct: number;
}

interface StorageRow {
  id: string;
  max_discharge_kw: number;
  max_charge_kw: number;
  capacity_kwh: number;
  current_soc_pct: number | null;
  gateway_device_id: string | null;
}

interface DispatchResult {
  config_id: string;
  status:
    | "no_main_meter"
    | "no_data"
    | "no_storage"
    | "below_limit"
    | "engaged_started"
    | "engaged_updated"
    | "released"
    | "throttled_by_soc"
    | "dispatch_unchanged"
    | "error";
  reading_kw?: number;
  forecast_kw?: number;
  limit_kw?: number;
  eur_saved?: number;
  detail?: string;
}

async function fetchLatestMeterPowerKw(meterId: string): Promise<{ kw: number; at: Date } | null> {
  const cutoff = new Date(Date.now() - RECENT_WINDOW_MIN * 60_000).toISOString();
  const { data: agg } = await admin
    .from("meter_power_readings_5min")
    .select("power_avg, bucket")
    .eq("meter_id", meterId)
    .gte("bucket", cutoff)
    .order("bucket", { ascending: false })
    .limit(1);
  if (agg && agg.length > 0) return { kw: Number(agg[0].power_avg), at: new Date(agg[0].bucket) };

  const { data: raw } = await admin
    .from("meter_power_readings")
    .select("power_value, recorded_at")
    .eq("meter_id", meterId)
    .gte("recorded_at", cutoff)
    .order("recorded_at", { ascending: false })
    .limit(1);
  if (raw && raw.length > 0) return { kw: Number(raw[0].power_value), at: new Date(raw[0].recorded_at) };
  return null;
}

async function forecast15MinAvg(meterId: string): Promise<number | null> {
  const now = new Date();
  const minuteOfQH = now.getUTCMinutes() % 15;
  const qhStart = new Date(now.getTime() - minuteOfQH * 60_000 - now.getUTCSeconds() * 1000 - now.getUTCMilliseconds());
  const { data } = await admin
    .from("meter_power_readings_5min")
    .select("power_avg, bucket")
    .eq("meter_id", meterId)
    .gte("bucket", qhStart.toISOString())
    .order("bucket", { ascending: true });
  if (!data || data.length === 0) return null;
  return data.reduce((s, r) => s + Number(r.power_avg), 0) / data.length;
}

async function getMainMeterId(locationId: string): Promise<string | null> {
  const { data, error } = await admin.rpc("get_location_main_meter", { p_location_id: locationId }).single();
  if (error || !data) return null;
  return data as unknown as string;
}

/**
 * Dispatch Befehl an Hardware via gateway_commands.
 * Returns gateway_command_id (oder null wenn kein Gateway hinterlegt).
 */
async function dispatchToGateway(
  cfg: ConfigRow,
  storage: StorageRow,
  action: "discharge" | "charge" | "release",
  targetPowerKw: number,
  reason: string,
  refs: { event_id?: string | null; calendar_id?: string | null },
): Promise<{ command_id: string | null; skipped: string | null }> {
  // Idempotenz: prüfe letzten Dispatch für diesen Speicher
  const { data: last } = await admin
    .from("peak_shaving_dispatch_log")
    .select("action, target_power_kw, created_at")
    .eq("config_id", cfg.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last && last.action === action && Math.abs(Number(last.target_power_kw) - targetPowerKw) < 0.1) {
    return { command_id: null, skipped: "unchanged" };
  }

  let commandId: string | null = null;

  if (storage.gateway_device_id) {
    const commandType =
      action === "discharge" ? "storage_discharge"
      : action === "charge" ? "storage_charge"
      : "storage_release";

    const { data: cmd, error } = await admin
      .from("gateway_commands")
      .insert({
        tenant_id: cfg.tenant_id,
        gateway_device_id: storage.gateway_device_id,
        command_type: commandType,
        payload: {
          storage_id: storage.id,
          target_power_kw: Number(targetPowerKw.toFixed(2)),
          source: "peak_shaving",
          config_id: cfg.id,
        },
        status: "pending",
        expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      })
      .select("id")
      .single();
    if (error) {
      await admin.from("peak_shaving_dispatch_log").insert({
        config_id: cfg.id,
        tenant_id: cfg.tenant_id,
        storage_id: storage.id,
        action,
        target_power_kw: targetPowerKw,
        reason,
        success: false,
        error_message: error.message,
        event_id: refs.event_id ?? null,
        calendar_id: refs.calendar_id ?? null,
      });
      return { command_id: null, skipped: "dispatch_error" };
    }
    commandId = cmd?.id ?? null;
  }

  await admin.from("peak_shaving_dispatch_log").insert({
    config_id: cfg.id,
    tenant_id: cfg.tenant_id,
    storage_id: storage.id,
    gateway_command_id: commandId,
    action,
    target_power_kw: Number(targetPowerKw.toFixed(2)),
    reason,
    success: true,
    event_id: refs.event_id ?? null,
    calendar_id: refs.calendar_id ?? null,
    metadata: { gateway_dispatched: !!storage.gateway_device_id },
  });

  return { command_id: commandId, skipped: null };
}

async function upsertMonthlySummary(
  cfg: ConfigRow,
  startedAt: Date,
  eurSaved: number,
  kwhDischarged: number,
  peakKw: number,
  baselineKw: number,
) {
  const year = startedAt.getUTCFullYear();
  const month = startedAt.getUTCMonth() + 1;
  const { data: existing } = await admin
    .from("peak_shaving_monthly_summary")
    .select("id, max_peak_kw, baseline_peak_kw, total_kwh_discharged, total_eur_saved, event_count")
    .eq("config_id", cfg.id)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();
  if (existing) {
    await admin
      .from("peak_shaving_monthly_summary")
      .update({
        max_peak_kw: Math.max(Number(existing.max_peak_kw), peakKw),
        baseline_peak_kw: Math.max(Number(existing.baseline_peak_kw), baselineKw),
        total_kwh_discharged: Number(existing.total_kwh_discharged) + kwhDischarged,
        total_eur_saved: Number(existing.total_eur_saved) + eurSaved,
        event_count: Number(existing.event_count) + 1,
      })
      .eq("id", existing.id);
  } else {
    await admin.from("peak_shaving_monthly_summary").insert({
      config_id: cfg.id,
      tenant_id: cfg.tenant_id,
      year,
      month,
      max_peak_kw: peakKw,
      baseline_peak_kw: baselineKw,
      total_kwh_discharged: kwhDischarged,
      total_eur_saved: eurSaved,
      event_count: 1,
    });
  }
}

async function processConfig(cfg: ConfigRow): Promise<DispatchResult> {
  const meterId = await getMainMeterId(cfg.location_id);
  if (!meterId) return { config_id: cfg.id, status: "no_main_meter" };

  const reading = await fetchLatestMeterPowerKw(meterId);
  if (!reading) return { config_id: cfg.id, status: "no_data" };

  const { data: storageData } = await admin
    .from("energy_storages")
    .select("id, max_discharge_kw, max_charge_kw, capacity_kwh, current_soc_pct, gateway_device_id")
    .eq("id", cfg.storage_id)
    .maybeSingle();
  if (!storageData) return { config_id: cfg.id, status: "no_storage" };
  const storage = storageData as StorageRow;

  const limit = Number(cfg.peak_limit_kw);
  const hyst = limit * (Number(cfg.hysteresis_pct) / 100);
  const forecastKw = cfg.mode === "forecast" ? (await forecast15MinAvg(meterId)) ?? reading.kw : reading.kw;
  const effectiveKw = Math.max(reading.kw, forecastKw);

  // SoC-Reserve respektieren
  const soc = storage.current_soc_pct == null ? null : Number(storage.current_soc_pct);
  const reserveBlocked = soc !== null && soc <= Number(cfg.reserve_soc_pct);

  const { data: openEvent } = await admin
    .from("peak_shaving_events")
    .select("*")
    .eq("config_id", cfg.id)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const aboveLimit = effectiveKw > limit;
  const belowHysteresis = reading.kw < hyst;

  if (!openEvent && aboveLimit) {
    const baselineKw = effectiveKw;
    const { data: inserted } = await admin
      .from("peak_shaving_events")
      .insert({
        config_id: cfg.id,
        tenant_id: cfg.tenant_id,
        started_at: new Date().toISOString(),
        peak_kw_without_shaving: baselineKw,
        peak_kw_actual: reading.kw,
        kwh_discharged: 0,
        eur_saved: 0,
        trigger_reason: cfg.mode === "forecast" ? "forecast_above_limit" : "threshold_exceeded",
        metadata: { limit_kw: limit, reading_kw: reading.kw, forecast_kw: forecastKw, max_discharge_kw: storage.max_discharge_kw, soc_pct: soc },
      })
      .select("id")
      .single();

    if (reserveBlocked) {
      return { config_id: cfg.id, status: "throttled_by_soc", reading_kw: reading.kw, limit_kw: limit, detail: `SoC ${soc}% <= reserve ${cfg.reserve_soc_pct}%` };
    }
    const targetDischarge = Math.min(Number(storage.max_discharge_kw), Math.max(0, effectiveKw - limit));
    await dispatchToGateway(cfg, storage, "discharge", targetDischarge, "peak_started", { event_id: inserted?.id });
    return { config_id: cfg.id, status: "engaged_started", reading_kw: reading.kw, forecast_kw: forecastKw, limit_kw: limit };
  }

  if (openEvent && !belowHysteresis) {
    const newBaseline = Math.max(Number(openEvent.peak_kw_without_shaving ?? 0), effectiveKw);
    const newActual = Math.max(Number(openEvent.peak_kw_actual ?? 0), reading.kw);
    const dischargeKw = reserveBlocked ? 0 : Math.min(Number(storage.max_discharge_kw), Math.max(0, effectiveKw - limit));
    const incKwh = dischargeKw * (1 / 60);
    await admin
      .from("peak_shaving_events")
      .update({
        peak_kw_without_shaving: newBaseline,
        peak_kw_actual: newActual,
        kwh_discharged: Number(openEvent.kwh_discharged) + incKwh,
      })
      .eq("id", openEvent.id);

    if (!reserveBlocked) {
      await dispatchToGateway(cfg, storage, "discharge", dischargeKw, "peak_continued", { event_id: openEvent.id });
    }
    return { config_id: cfg.id, status: reserveBlocked ? "throttled_by_soc" : "engaged_updated", reading_kw: reading.kw, forecast_kw: forecastKw, limit_kw: limit };
  }

  if (openEvent && belowHysteresis) {
    const baseline = Number(openEvent.peak_kw_without_shaving ?? 0);
    const actual = Number(openEvent.peak_kw_actual ?? 0);
    const savedKw = Math.max(0, baseline - actual);
    const divisor = cfg.billing_cycle === "monthly" ? 12 : 1;
    const eurSaved = (savedKw * Number(cfg.network_tariff_eur_per_kw_year)) / divisor;
    const endedAt = new Date();
    await admin
      .from("peak_shaving_events")
      .update({ ended_at: endedAt.toISOString(), eur_saved: eurSaved })
      .eq("id", openEvent.id);
    await upsertMonthlySummary(cfg, new Date(openEvent.started_at), eurSaved, Number(openEvent.kwh_discharged), actual, baseline);
    await dispatchToGateway(cfg, storage, "release", 0, "peak_ended", { event_id: openEvent.id });
    return { config_id: cfg.id, status: "released", reading_kw: reading.kw, limit_kw: limit, eur_saved: eurSaved };
  }

  return { config_id: cfg.id, status: "below_limit", reading_kw: reading.kw, limit_kw: limit };
}

async function run() {
  const { data: configs } = await admin
    .from("peak_shaving_configs")
    .select("id, tenant_id, location_id, storage_id, peak_limit_kw, reserve_soc_pct, mode, network_tariff_eur_per_kw_year, billing_cycle, hysteresis_pct")
    .eq("active", true);
  const results: DispatchResult[] = [];
  for (const cfg of configs ?? []) {
    try {
      results.push(await processConfig(cfg as ConfigRow));
    } catch (e) {
      results.push({ config_id: (cfg as ConfigRow).id, status: "error", detail: (e as Error).message });
    }
  }
  return { processed: results.length, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const out = await run();
    console.log(
      `[peak-shaving-scheduler] processed=${out.processed}`,
      JSON.stringify(out.results.filter((r) => r.status !== "below_limit")),
    );
    return new Response(JSON.stringify({ ok: true, ...out }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[peak-shaving-scheduler] error", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
