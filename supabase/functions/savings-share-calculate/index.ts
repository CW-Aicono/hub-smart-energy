// Berechnet die Jahresabrechnung eines Gain-Sharing-Vertrags für ein Kalenderjahr.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const HEATING_TYPES = new Set(["gas", "heating_oil", "district_heating", "heat_pump", "wood_pellets"]);

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

  const { data: baselines } = await admin.from("tenant_savings_baselines")
    .select("energy_type, baseline_kwh_normalized, baseline_hdd, baseline_kwh_raw")
    .eq("contract_id", contractId);
  if (!baselines || baselines.length === 0) return json({ error: "Keine Baseline vorhanden – zuerst Baseline berechnen" }, 400);

  const fromDate = `${periodYear}-01-01`;
  const toDate = `${periodYear}-12-31`;

  const { data: meters, error: mErr } = await admin.from("meters")
    .select("id, energy_type, location_id, capture_type")
    .eq("tenant_id", contract.tenant_id);
  if (mErr) return json({ error: "meters query failed: " + mErr.message }, 500);
  const consumptionMeters = (meters ?? []).filter((m: any) =>
    m.energy_type && m.capture_type !== "export" && m.capture_type !== "generation");

  const groups = new Map<string, string[]>();
  const locationSet = new Set<string>();
  for (const m of consumptionMeters) {
    if (!groups.has(m.energy_type)) groups.set(m.energy_type, []);
    groups.get(m.energy_type)!.push(m.id);
    if (m.location_id) locationSet.add(m.location_id);
  }

  // Period HDD
  let periodHdd: number | null = null;
  if (locationSet.size > 0) {
    const { data: hddRows } = await admin.from("weather_degree_days")
      .select("location_id, month, heating_degree_days")
      .in("location_id", [...locationSet])
      .gte("month", fromDate).lte("month", toDate);
    if (hddRows && hddRows.length > 0) {
      const perLoc = new Map<string, number>();
      for (const r of hddRows) {
        perLoc.set(r.location_id, (perLoc.get(r.location_id) ?? 0) + Number(r.heating_degree_days ?? 0));
      }
      const sum = [...perLoc.values()].reduce((a, b) => a + b, 0);
      periodHdd = sum / perLoc.size;
    }
  }

  // Preise: Jahresmittel je energy_type aus energy_prices (Mandanten-Ebene)
  const { data: priceRows } = await admin.from("energy_prices")
    .select("energy_type, price_per_unit, valid_from")
    .eq("tenant_id", contract.tenant_id)
    .order("valid_from", { ascending: false });

  const priceByType = new Map<string, number>();
  for (const p of priceRows ?? []) {
    if (!priceByType.has(p.energy_type)) priceByType.set(p.energy_type, Number(p.price_per_unit));
  }
  const fixedPrices = (contract.fixed_price_eur_per_kwh ?? {}) as Record<string, number>;

  const perEnergyType: any[] = [];
  let totalSavings = 0;

  for (const b of baselines) {
    const meterIds = groups.get(b.energy_type) ?? [];
    let actualKwh = 0;
    if (meterIds.length > 0) {
      const { data: sums } = await admin.rpc("get_meter_period_sums", {
        p_meter_ids: meterIds, p_from_date: fromDate, p_to_date: toDate,
      });
      actualKwh = Number(sums?.[0]?.total_value ?? 0);
    }

    const isHeating = HEATING_TYPES.has(b.energy_type) && contract.weather_normalize;
    let hddFactor = 1;
    if (isHeating && b.baseline_hdd && periodHdd && periodHdd > 0) {
      // Ist-Verbrauch auf Baseline-Klima hochrechnen
      hddFactor = Number(b.baseline_hdd) / periodHdd;
    }
    const actualNorm = actualKwh * hddFactor;
    const baselineNorm = Number(b.baseline_kwh_normalized);
    const savingsKwh = Math.max(0, baselineNorm - actualNorm);

    const price = contract.price_basis === "contract_fixed"
      ? Number(fixedPrices[b.energy_type] ?? 0)
      : Number(priceByType.get(b.energy_type) ?? 0);
    const savingsEur = Math.round(savingsKwh * price * 100) / 100;

    perEnergyType.push({
      energy_type: b.energy_type,
      baseline_kwh: baselineNorm,
      actual_kwh: actualKwh,
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
    }, { onConflict: "contract_id,period_year" })
    .select().maybeSingle();
  if (upErr) return json({ error: upErr.message }, 500);

  return json({ success: true, settlement });
});
