// Berechnet die Jahresabrechnung eines Gain-Sharing-Vertrags für ein Kalenderjahr.
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
  const periodYear = Number(body?.period_year);
  if (!contractId || !Number.isFinite(periodYear)) return json({ error: "contract_id and period_year required" }, 400);

  const { data: contract, error: cErr } = await admin
    .from("tenant_savings_contracts")
    .select("id, tenant_id, weather_normalize, aicono_share_pct, partner_share_pct_of_aicono, price_basis, fixed_price_eur_per_kwh")
    .eq("id", contractId).maybeSingle();
  if (cErr || !contract) return json({ error: "Contract not found" }, 404);

  const { data: mod } = await admin.from("tenant_modules")
    .select("is_enabled").eq("tenant_id", contract.tenant_id).eq("module_code", "gain_sharing").maybeSingle();
  if (!mod?.is_enabled) return json({ error: "Modul gain_sharing für diesen Mandanten nicht aktiv" }, 403);

  const { data: baselines, error: bErr } = await admin.from("tenant_savings_baselines")
    .select("energy_type, baseline_kwh_normalized, baseline_hdd, baseline_kwh_raw, data_quality, coverage_months")
    .eq("contract_id", contractId)
    .neq("data_quality", "none");
  if (bErr) return json({ error: "Baseline konnte nicht geladen werden: " + bErr.message }, 500);
  if (!baselines || baselines.length === 0) return json({ error: "Keine gültige Baseline vorhanden – zuerst Baseline berechnen oder manuell anlegen" }, 400);

  const fromDate = `${periodYear}-01-01`;
  const toDate = `${periodYear}-12-31`;

  const { data: meters, error: mErr } = await admin.from("meters")
    .select("id, energy_type, location_id, capture_type, meter_function, is_archived")
    .eq("tenant_id", contract.tenant_id);
  if (mErr) return json({ error: "meters query failed: " + mErr.message }, 500);
  const consumptionMeters = (meters ?? []).filter((m: any) => {
    const energyType = String(m.energy_type ?? "").trim().toLowerCase();
    const captureType = String(m.capture_type ?? "").trim().toLowerCase();
    const meterFunction = String(m.meter_function ?? "").trim().toLowerCase();
    return !m.is_archived
      && energyType
      && !EXCLUDED_ENERGY_TYPES.has(energyType)
      && !EXCLUDED_CAPTURE_TYPES.has(captureType)
      && !EXCLUDED_METER_FUNCTIONS.has(meterFunction);
  }).map((m: any) => ({ ...m, energy_type: String(m.energy_type).trim().toLowerCase() }));

  const groups = new Map<string, string[]>();
  const locationSet = new Set<string>();
  for (const m of consumptionMeters) {
    if (!groups.has(m.energy_type)) groups.set(m.energy_type, []);
    groups.get(m.energy_type)!.push(m.id);
    if (m.location_id) locationSet.add(m.location_id);
  }

  let periodHdd: number | null = null;
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
      periodHdd = perLoc.size > 0 ? sum / perLoc.size : null;
    }
  }

  const { data: priceRows, error: priceErr } = await admin.from("energy_prices")
    .select("energy_type, price_per_unit, valid_from")
    .eq("tenant_id", contract.tenant_id)
    .order("valid_from", { ascending: false });
  if (priceErr) return json({ error: "Preise konnten nicht geladen werden: " + priceErr.message }, 500);

  const priceByType = new Map<string, number>();
  for (const p of priceRows ?? []) {
    const energyType = String(p.energy_type ?? "").trim().toLowerCase();
    if (!priceByType.has(energyType)) priceByType.set(energyType, Number(p.price_per_unit));
  }
  const fixedPrices = (contract.fixed_price_eur_per_kwh ?? {}) as Record<string, number>;

  const perEnergyType: any[] = [];
  const warnings: string[] = [];
  let totalSavings = 0;

  for (const b of baselines) {
    const energyType = String(b.energy_type).trim().toLowerCase();
    const meterIds = groups.get(energyType) ?? [];
    let actualKwh = 0;
    let coverageMonths = 0;
    let sourcePeriodType = "none";
    if (meterIds.length > 0) {
      const { data: periodRows, error: periodErr } = await admin.from("meter_period_totals")
        .select("period_type, period_start, total_value")
        .in("meter_id", meterIds)
        .in("period_type", ["month", "day"])
        .gte("period_start", fromDate)
        .lte("period_start", toDate);
      if (periodErr) return json({ error: `Ist-Werte konnten nicht geladen werden (${energyType}): ${periodErr.message}` }, 500);
      const monthlyRows = (periodRows ?? []).filter((r: any) => r.period_type === "month");
      const dailyRows = (periodRows ?? []).filter((r: any) => r.period_type === "day");
      const sourceRows = monthlyRows.length > 0 ? monthlyRows : dailyRows;
      sourcePeriodType = monthlyRows.length > 0 ? "month" : dailyRows.length > 0 ? "day" : "none";
      actualKwh = sourceRows.reduce((sum: number, r: any) => sum + Number(r.total_value ?? 0), 0);
      coverageMonths = new Set(sourceRows.map((r: any) => monthKey(String(r.period_start)))).size;
    }
    if (coverageMonths < 12) warnings.push(`Ist-Jahr ${periodYear}: Für ${energyType} liegen nur ${coverageMonths} von 12 Monaten vor.`);

    const isHeating = HEATING_TYPES.has(energyType) && contract.weather_normalize;
    let hddFactor = 1;
    if (isHeating && b.baseline_hdd && periodHdd && periodHdd > 0) {
      hddFactor = Number(b.baseline_hdd) / periodHdd;
    }
    const actualNorm = actualKwh * hddFactor;
    const baselineNorm = Number(b.baseline_kwh_normalized);
    const savingsKwh = Math.max(0, baselineNorm - actualNorm);

    const price = contract.price_basis === "contract_fixed"
      ? Number(fixedPrices[energyType] ?? fixedPrices[b.energy_type] ?? 0)
      : Number(priceByType.get(energyType) ?? 0);
    if (price === 0) warnings.push(`Für ${energyType} ist kein Preis hinterlegt; monetäre Einsparung wird mit 0 € berechnet.`);
    const savingsEur = Math.round(savingsKwh * price * 100) / 100;

    perEnergyType.push({
      energy_type: energyType,
      baseline_kwh: baselineNorm,
      baseline_quality: b.data_quality ?? "unknown",
      baseline_coverage_months: b.coverage_months ?? null,
      actual_kwh: actualKwh,
      actual_coverage_months: coverageMonths,
      actual_source_period_type: sourcePeriodType,
      hdd_factor: Math.round(hddFactor * 10000) / 10000,
      avg_price_eur_per_kwh: price,
      savings_kwh: Math.round(savingsKwh * 100) / 100,
      savings_eur: savingsEur,
    });
    totalSavings += savingsEur;
  }

  totalSavings = Math.round(totalSavings * 100) / 100;
  const aiconoPct = Number(contract.aicono_share_pct) / 100;
  const partnerPctOfAicono = Number(contract.partner_share_pct_of_aicono) / 100;
  const aiconoAmount = Math.round(totalSavings * aiconoPct * 100) / 100;
  const partnerAmount = Math.round(aiconoAmount * partnerPctOfAicono * 100) / 100;
  const tenantRetained = Math.round((totalSavings - aiconoAmount) * 100) / 100;

  const { data: settlement, error: upErr } = await admin.from("tenant_savings_settlements")
    .upsert({
      contract_id: contractId,
      period_year: periodYear,
      status: "draft",
      per_energy_type: perEnergyType,
      total_savings_eur: totalSavings,
      aicono_amount_eur: aiconoAmount,
      partner_amount_eur: partnerAmount,
      tenant_retained_eur: tenantRetained,
      notes: warnings.length > 0 ? warnings.join("\n") : null,
    }, { onConflict: "contract_id,period_year" })
    .select().maybeSingle();
  if (upErr) return json({ error: upErr.message }, 500);

  console.log("savings-share-calculate", JSON.stringify({
    contract_id: contractId,
    tenant_id: contract.tenant_id,
    period_year: periodYear,
    rows: perEnergyType.length,
    total_savings: totalSavings,
    warnings: warnings.length,
  }));

  return json({ success: true, settlement, warnings });
});