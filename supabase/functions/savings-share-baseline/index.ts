// Berechnet die Baseline eines Gain-Sharing-Vertrags mit fachlicher Diagnose.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const HEATING_TYPES = new Set(["gas", "heating_oil", "district_heating", "heat_pump", "wood_pellets", "waerme", "wärme"]);
const EXCLUDED_ENERGY_TYPES = new Set(["none", "", "unknown", "co2"]);
const EXCLUDED_CAPTURE_TYPES = new Set(["export", "generation"]);
const EXCLUDED_METER_FUNCTIONS = new Set(["generation", "export"]);

type Diagnostic = {
  tenant_id: string;
  baseline_year: number;
  all_meters: number;
  eligible_meters: number;
  excluded_meters: Record<string, number>;
  written_rows: number;
  warnings: string[];
  energy_types: Array<{
    energy_type: string;
    meter_count: number;
    source_period_type: "month" | "day" | "none";
    coverage_months: number;
    first_period: string | null;
    last_period: string | null;
    total_kwh: number;
    data_quality: "complete" | "partial" | "none";
    warning: string | null;
  }>;
};

const bump = (bucket: Record<string, number>, key: string) => {
  bucket[key] = (bucket[key] ?? 0) + 1;
};

const monthKey = (value: string) => value.slice(0, 7);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);

  const authClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const admin = createClient(SUPABASE_URL, SERVICE);

  const { data: userRes } = await authClient.auth.getUser();
  const user = userRes?.user;
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { data: role } = await admin.from("user_roles")
    .select("role").eq("user_id", user.id).eq("role", "super_admin").maybeSingle();
  if (!role) return json({ error: "Forbidden" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const contractId = body?.contract_id as string | undefined;
  if (!contractId) return json({ error: "contract_id required" }, 400);

  const { data: contract, error: cErr } = await admin
    .from("tenant_savings_contracts")
    .select("id, tenant_id, baseline_year, weather_normalize")
    .eq("id", contractId).maybeSingle();
  if (cErr || !contract) return json({ error: "Contract not found" }, 404);

  const { data: mod } = await admin.from("tenant_modules")
    .select("is_enabled").eq("tenant_id", contract.tenant_id).eq("module_code", "gain_sharing").maybeSingle();
  if (!mod?.is_enabled) return json({ error: "Modul gain_sharing für diesen Mandanten nicht aktiv" }, 403);

  const year = Number(contract.baseline_year);
  const fromDate = `${year}-01-01`;
  const toDate = `${year}-12-31`;
  const currentYear = new Date().getFullYear();

  const { data: meters, error: mErr } = await admin.from("meters")
    .select("id, name, energy_type, location_id, capture_type, meter_function, device_type, is_archived")
    .eq("tenant_id", contract.tenant_id);
  if (mErr) return json({ error: "meters query failed: " + mErr.message }, 500);

  const excluded: Record<string, number> = {};
  const eligibleMeters: any[] = [];
  for (const meter of meters ?? []) {
    const energyType = String(meter.energy_type ?? "").trim().toLowerCase();
    const captureType = String(meter.capture_type ?? "").trim().toLowerCase();
    const meterFunction = String(meter.meter_function ?? "").trim().toLowerCase();

    if (meter.is_archived) { bump(excluded, "archiviert"); continue; }
    if (!energyType || EXCLUDED_ENERGY_TYPES.has(energyType)) { bump(excluded, "keine fachliche Energieart"); continue; }
    if (EXCLUDED_CAPTURE_TYPES.has(captureType)) { bump(excluded, "Erzeugung/Einspeisung"); continue; }
    if (EXCLUDED_METER_FUNCTIONS.has(meterFunction)) { bump(excluded, "Erzeugung/Einspeisung"); continue; }
    eligibleMeters.push({ ...meter, energy_type: energyType });
  }

  const warnings: string[] = [];
  if (year === currentYear) warnings.push("Das Baseline-Jahr ist das laufende Jahr; die Datenbasis ist voraussichtlich noch unvollständig.");
  if ((meters ?? []).length === 0) warnings.push("Für diesen Tenant wurden keine Zähler gefunden.");
  if (eligibleMeters.length === 0) warnings.push("Es wurden keine geeigneten Verbrauchszähler für die Baseline gefunden.");

  const diagnostic: Diagnostic = {
    tenant_id: contract.tenant_id,
    baseline_year: year,
    all_meters: (meters ?? []).length,
    eligible_meters: eligibleMeters.length,
    excluded_meters: excluded,
    written_rows: 0,
    warnings,
    energy_types: [],
  };

  const groups = new Map<string, any[]>();
  const locationSet = new Set<string>();
  for (const meter of eligibleMeters) {
    if (!groups.has(meter.energy_type)) groups.set(meter.energy_type, []);
    groups.get(meter.energy_type)!.push(meter);
    if (meter.location_id) locationSet.add(meter.location_id);
  }

  const { data: manualRows, error: manualErr } = await admin.from("tenant_savings_baselines")
    .select("energy_type")
    .eq("contract_id", contractId)
    .in("baseline_source", ["manual_override", "invoice_based"]);
  if (manualErr) return json({ error: "existing baselines query failed: " + manualErr.message }, 500);
  const protectedEnergyTypes = new Set((manualRows ?? []).map((r: any) => String(r.energy_type).trim().toLowerCase()));

  const { error: cleanupErr } = await admin.from("tenant_savings_baselines")
    .delete()
    .eq("contract_id", contractId)
    .eq("baseline_source", "auto_from_meters");
  if (cleanupErr) return json({ error: "baseline cleanup failed: " + cleanupErr.message }, 500);

  let baselineHdd: number | null = null;
  if (locationSet.size > 0) {
    const { data: hddRows, error: hddErr } = await admin.from("weather_degree_days")
      .select("location_id, month, heating_degree_days")
      .in("location_id", [...locationSet])
      .gte("month", fromDate).lte("month", toDate);
    if (hddErr) return json({ error: "weather query failed: " + hddErr.message }, 500);
    if (hddRows && hddRows.length > 0) {
      const perLoc = new Map<string, number>();
      for (const r of hddRows) {
        perLoc.set(r.location_id, (perLoc.get(r.location_id) ?? 0) + Number(r.heating_degree_days ?? 0));
      }
      const sum = [...perLoc.values()].reduce((a, b) => a + b, 0);
      baselineHdd = perLoc.size > 0 ? sum / perLoc.size : null;
    }
  }

  const results: Array<{
    energy_type: string; baseline_kwh_raw: number; baseline_hdd: number | null;
    baseline_kwh_normalized: number; coverage_months: number; data_quality: string;
  }> = [];

  for (const [energyType, groupMeters] of groups) {
    const meterIds = groupMeters.map((m) => m.id);
    const { data: periodRows, error: pErr } = await admin.from("meter_period_totals")
      .select("period_type, period_start, total_value")
      .in("meter_id", meterIds)
      .in("period_type", ["month", "day"])
      .gte("period_start", fromDate)
      .lte("period_start", toDate);
    if (pErr) return json({ error: `period totals query failed (${energyType}): ${pErr.message}` }, 500);

    const monthlyRows = (periodRows ?? []).filter((r: any) => r.period_type === "month");
    const dailyRows = (periodRows ?? []).filter((r: any) => r.period_type === "day");
    const sourceRows = monthlyRows.length > 0 ? monthlyRows : dailyRows;
    const sourcePeriodType = monthlyRows.length > 0 ? "month" : dailyRows.length > 0 ? "day" : "none";
    const totalKwh = sourceRows.reduce((sum: number, r: any) => sum + Number(r.total_value ?? 0), 0);
    const monthKeys = new Set(sourceRows.map((r: any) => monthKey(String(r.period_start))));
    const coverageMonths = monthKeys.size;
    const firstPeriod = sourceRows.length > 0
      ? sourceRows.map((r: any) => String(r.period_start)).sort()[0]
      : null;
    const lastPeriod = sourceRows.length > 0
      ? sourceRows.map((r: any) => String(r.period_start)).sort().at(-1) ?? null
      : null;
    const dataQuality = coverageMonths >= 12 ? "complete" : coverageMonths > 0 ? "partial" : "none";
    const energyWarnings: string[] = [];
    if (dataQuality === "none") energyWarnings.push(`Für ${energyType} wurden im Baseline-Jahr keine Werte gefunden.`);
    if (dataQuality === "partial") energyWarnings.push(`Für ${energyType} liegen nur ${coverageMonths} von 12 Monaten vor.`);
    if (totalKwh === 0) energyWarnings.push(`Für ${energyType} ergibt die Datenbasis 0 kWh.`);
    diagnostic.warnings.push(...energyWarnings);

    diagnostic.energy_types.push({
      energy_type: energyType,
      meter_count: groupMeters.length,
      source_period_type: sourcePeriodType,
      coverage_months: coverageMonths,
      first_period: firstPeriod,
      last_period: lastPeriod,
      total_kwh: totalKwh,
      data_quality: dataQuality,
      warning: energyWarnings.join(" ") || null,
    });

    if (dataQuality === "none") continue;
    if (protectedEnergyTypes.has(energyType)) {
      diagnostic.warnings.push(`Für ${energyType} existiert eine manuelle oder rechnungsbasierte Baseline; automatische Werte wurden nicht überschrieben.`);
      continue;
    }

    const isHeating = HEATING_TYPES.has(energyType) && contract.weather_normalize;
    const hdd = isHeating ? baselineHdd : null;
    const normalized = totalKwh;

    const { error: upErr } = await admin.from("tenant_savings_baselines")
      .upsert({
        contract_id: contractId,
        energy_type: energyType,
        baseline_kwh_raw: totalKwh,
        baseline_hdd: hdd,
        baseline_kwh_normalized: normalized,
        baseline_source: "auto_from_meters",
        override_reason: null,
        coverage_months: coverageMonths,
        data_quality: dataQuality,
        calculation_details: {
          source_period_type: sourcePeriodType,
          first_period: firstPeriod,
          last_period: lastPeriod,
          meter_count: groupMeters.length,
          meter_ids: meterIds,
          excluded_meters: excluded,
          warnings: energyWarnings,
        },
      }, { onConflict: "contract_id,energy_type" });
    if (upErr) return json({ error: `baseline upsert failed (${energyType}): ${upErr.message}` }, 500);

    diagnostic.written_rows += 1;
    results.push({ energy_type: energyType, baseline_kwh_raw: totalKwh, baseline_hdd: hdd, baseline_kwh_normalized: normalized, coverage_months: coverageMonths, data_quality: dataQuality });
  }

  console.log("savings-share-baseline", JSON.stringify({
    contract_id: contractId,
    tenant_id: contract.tenant_id,
    baseline_year: year,
    eligible_meters: diagnostic.eligible_meters,
    written_rows: diagnostic.written_rows,
    warnings: diagnostic.warnings.length,
  }));

  if (diagnostic.written_rows === 0) {
    const reason = diagnostic.warnings[0] ?? "Es wurden keine Baseline-Zeilen geschrieben.";
    return json({ success: false, error: reason, baseline_year: year, results, diagnostic }, 422);
  }

  return json({ success: true, baseline_year: year, results, diagnostic });
});