// Peak-Shaving Scheduler — kappt Lastspitzen durch Speicherentladung
//
// Pro aktiver Konfiguration:
//  1. Lese aktuelle Leistung vom Hauptzähler der Location
//  2. Schwellwert + 15-Min-Prognose (Hybrid)
//  3. Wenn nahe/über Limit -> Eingriff starten/aktualisieren (peak_shaving_events offen lassen)
//  4. Wenn Leistung unter Hysterese -> Eingriff schließen, eur_saved berechnen
//  5. Monats-Aggregat pflegen
//
// Phase 1: Logik + Tracking + Live-KPIs. Echte Speicherbefehle in Phase 2 (Hardware-Bus).
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

interface DispatchResult {
  config_id: string;
  status:
    | "no_main_meter"
    | "no_data"
    | "below_limit"
    | "engaged_started"
    | "engaged_updated"
    | "released"
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

/** Aktuellen 15-Min-Mittel inkl. linearer Extrapolation auf VS-Ende. */
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
  const avg = data.reduce((s, r) => s + Number(r.power_avg), 0) / data.length;
  // Hochrechnung: aktueller Durchschnitt = Erwartungswert für restliche Viertelstunde
  return avg;
}

async function getMainMeterId(locationId: string): Promise<string | null> {
  const { data, error } = await admin.rpc("get_location_main_meter", { p_location_id: locationId }).single();
  if (error || !data) return null;
  return data as unknown as string;
}

async function upsertMonthlySummary(cfg: ConfigRow, startedAt: Date, eurSaved: number, kwhDischarged: number, peakKw: number, baselineKw: number) {
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

  const limit = Number(cfg.peak_limit_kw);
  const hyst = limit * (Number(cfg.hysteresis_pct) / 100);
  const forecastKw = cfg.mode === "forecast" ? (await forecast15MinAvg(meterId)) ?? reading.kw : reading.kw;
  const effectiveKw = Math.max(reading.kw, forecastKw);

  // Speicher-Daten (für Discharge-Schätzung)
  const { data: storage } = await admin
    .from("energy_storages")
    .select("max_discharge_kw, capacity_kwh")
    .eq("id", cfg.storage_id)
    .maybeSingle();
  const maxDischargeKw = Number(storage?.max_discharge_kw ?? 0);

  // Offener Event?
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
    // Neuen Eingriff starten
    const baselineKw = effectiveKw;
    await admin.from("peak_shaving_events").insert({
      config_id: cfg.id,
      tenant_id: cfg.tenant_id,
      started_at: new Date().toISOString(),
      peak_kw_without_shaving: baselineKw,
      peak_kw_actual: reading.kw,
      kwh_discharged: 0,
      eur_saved: 0,
      trigger_reason: cfg.mode === "forecast" ? "forecast_above_limit" : "threshold_exceeded",
      metadata: { limit_kw: limit, reading_kw: reading.kw, forecast_kw: forecastKw, max_discharge_kw: maxDischargeKw },
    });
    return { config_id: cfg.id, status: "engaged_started", reading_kw: reading.kw, forecast_kw: forecastKw, limit_kw: limit };
  }

  if (openEvent && !belowHysteresis) {
    // Eingriff läuft, aktualisieren
    const newBaseline = Math.max(Number(openEvent.peak_kw_without_shaving ?? 0), effectiveKw);
    const newActual = Math.max(Number(openEvent.peak_kw_actual ?? 0), reading.kw);
    // 1-Minuten-Inkrement der entladenen Energie (Annahme: Discharge = headroom-Bedarf, gedeckelt)
    const dischargeKw = Math.min(maxDischargeKw, Math.max(0, effectiveKw - limit));
    const incKwh = dischargeKw * (1 / 60);
    await admin
      .from("peak_shaving_events")
      .update({
        peak_kw_without_shaving: newBaseline,
        peak_kw_actual: newActual,
        kwh_discharged: Number(openEvent.kwh_discharged) + incKwh,
      })
      .eq("id", openEvent.id);
    return { config_id: cfg.id, status: "engaged_updated", reading_kw: reading.kw, forecast_kw: forecastKw, limit_kw: limit };
  }

  if (openEvent && belowHysteresis) {
    // Eingriff schließen + eur_saved berechnen
    const baseline = Number(openEvent.peak_kw_without_shaving ?? 0);
    const actual = Number(openEvent.peak_kw_actual ?? 0);
    const savedKw = Math.max(0, baseline - actual);
    const divisor = cfg.billing_cycle === "monthly" ? 12 : 1;
    const eurSaved = (savedKw * Number(cfg.network_tariff_eur_per_kw_year)) / divisor;
    const endedAt = new Date();
    await admin
      .from("peak_shaving_events")
      .update({
        ended_at: endedAt.toISOString(),
        eur_saved: eurSaved,
      })
      .eq("id", openEvent.id);
    await upsertMonthlySummary(cfg, new Date(openEvent.started_at), eurSaved, Number(openEvent.kwh_discharged), actual, baseline);
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
