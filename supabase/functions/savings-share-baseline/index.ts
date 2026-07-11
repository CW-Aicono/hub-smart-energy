// Berechnet die Baseline eines Gain-Sharing-Vertrags: Rohverbrauch je Energieart
// über alle Zähler (Consumption-Seite) des Mandanten für das Baseline-Jahr, plus HDD.
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
  if (!contractId) return json({ error: "contract_id required" }, 400);

  const { data: contract, error: cErr } = await admin
    .from("tenant_savings_contracts")
    .select("id, tenant_id, baseline_year, weather_normalize")
    .eq("id", contractId).maybeSingle();
  if (cErr || !contract) return json({ error: "Contract not found" }, 404);

  // Modul-Check: gain_sharing muss aktiv sein
  const { data: mod } = await admin.from("tenant_modules")
    .select("is_enabled").eq("tenant_id", contract.tenant_id).eq("module_code", "gain_sharing").maybeSingle();
  if (!mod?.is_enabled) return json({ error: "Modul gain_sharing für diesen Mandanten nicht aktiv" }, 403);

  const year = contract.baseline_year;
  const fromDate = `${year}-01-01`;
  const toDate = `${year}-12-31`;

  // Verbrauchszähler des Mandanten (nur Bezugsseite, keine Einspeisung/PV)
  const { data: meters } = await admin.from("meters")
    .select("id, energy_type, location_id, is_export_meter, is_generation_meter")
    .eq("tenant_id", contract.tenant_id);

  const consumptionMeters = (meters ?? []).filter((m: any) =>
    !m.is_export_meter && !m.is_generation_meter && m.energy_type);

  // Gruppieren je energy_type
  const groups = new Map<string, string[]>();
  const locationSet = new Set<string>();
  for (const m of consumptionMeters) {
    if (!groups.has(m.energy_type)) groups.set(m.energy_type, []);
    groups.get(m.energy_type)!.push(m.id);
    if (m.location_id) locationSet.add(m.location_id);
  }

  // HDD des Baseline-Jahres (Summe je Location, dann Durchschnitt)
  let baselineHdd: number | null = null;
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
      baselineHdd = sum / perLoc.size;
    }
  }

  const results: Array<{
    energy_type: string; baseline_kwh_raw: number; baseline_hdd: number | null;
    baseline_kwh_normalized: number;
  }> = [];

  for (const [energyType, meterIds] of groups) {
    const { data: sums } = await admin.rpc("get_meter_period_sums", {
      p_meter_ids: meterIds, p_from_date: fromDate, p_to_date: toDate,
    });
    const totalKwh = Number(sums?.[0]?.total_value ?? 0);
    const isHeating = HEATING_TYPES.has(energyType) && contract.weather_normalize;
    const hdd = isHeating ? baselineHdd : null;
    // Baseline-normalized = raw (Normalisierung erfolgt in Calculate über Verhältnis)
    const normalized = totalKwh;

    // Upsert
    const { error: upErr } = await admin.from("tenant_savings_baselines")
      .upsert({
        contract_id: contractId,
        energy_type: energyType,
        baseline_kwh_raw: totalKwh,
        baseline_hdd: hdd,
        baseline_kwh_normalized: normalized,
        baseline_source: "auto_from_meters",
        override_reason: null,
      }, { onConflict: "contract_id,energy_type" });
    if (upErr) return json({ error: upErr.message }, 500);

    results.push({ energy_type: energyType, baseline_kwh_raw: totalKwh, baseline_hdd: hdd, baseline_kwh_normalized: normalized });
  }

  return json({ success: true, baseline_year: year, results });
});
