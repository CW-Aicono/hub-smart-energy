import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonOk(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(message: string, status = 500, detail?: string) {
  return new Response(JSON.stringify({ error: message, detail }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Auth & tenant resolution (shared) ──────────────────────────────────
async function resolveAuth(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) throw { status: 401, message: "Nicht authentifiziert" };

  const token = authHeader.replace("Bearer ", "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authClient = createClient(supabaseUrl, supabaseKey);
  const { data: claimsData, error: claimsError } = await authClient.auth.getUser(token);
  if (claimsError || !claimsData?.user) throw { status: 401, message: "Nicht authentifiziert", detail: claimsError?.message };

  const userId = claimsData.user.id;
  const db = createClient(supabaseUrl, serviceKey);

  const { data: profile } = await db.from("profiles").select("tenant_id").eq("user_id", userId).single();
  if (!profile?.tenant_id) throw { status: 403, message: "Kein Mandant zugeordnet" };

  return { userId, tenantId: profile.tenant_id, db };
}

// ── AI Gateway call helper ─────────────────────────────────────────────
async function callAI(messages: any[], tools: any[], toolName: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw { status: 500, message: "KI nicht konfiguriert", detail: "LOVABLE_API_KEY fehlt" };

  const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages,
      tools,
      tool_choice: { type: "function", function: { name: toolName } },
    }),
  });

  if (!aiResponse.ok) {
    const status = aiResponse.status;
    const text = await aiResponse.text();
    console.error("AI Gateway error:", status, text);
    if (status === 429) throw { status: 429, message: "KI-Rate-Limit erreicht", detail: "Bitte versuchen Sie es in einer Minute erneut." };
    if (status === 402) throw { status: 402, message: "KI-Credits aufgebraucht", detail: "Bitte Credits im Workspace aufladen." };
    throw { status: 500, message: "KI-Analyse fehlgeschlagen", detail: text };
  }

  const aiResult = await aiResponse.json();
  const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    console.error("No tool call in AI response:", JSON.stringify(aiResult));
    throw { status: 500, message: "KI hat keine strukturierte Antwort geliefert" };
  }

  try {
    return JSON.parse(toolCall.function.arguments);
  } catch {
    console.error("Failed to parse tool call arguments:", toolCall.function.arguments);
    throw { status: 500, message: "KI-Antwort konnte nicht verarbeitet werden" };
  }
}

// ── Investment Analysis handler ────────────────────────────────────────
async function handleInvestmentAnalysis(
  db: any, tenantId: string, userId: string,
  targetLocationIds: string[], input_params: any, analysisType: string
) {
  const { data: locations, error: locError } = await db
    .from("locations")
    .select("id, name, address, city, postal_code, country, latitude, longitude, usage_type, net_floor_area, gross_floor_area, heating_type")
    .eq("tenant_id", tenantId)
    .in("id", targetLocationIds);

  if (!locations || locations.length === 0) return jsonError("Standort nicht gefunden", 404, locError?.message);

  const locationData = [];
  for (const loc of locations) {
    const [{ data: pvSettings }, { data: storages }, { data: prices }, { data: meters }, { data: spotPrices }] = await Promise.all([
      db.from("pv_forecast_settings").select("*").eq("location_id", loc.id).eq("is_active", true),
      db.from("energy_storages").select("*").eq("tenant_id", tenantId).eq("location_id", loc.id),
      db.from("energy_prices").select("*").eq("tenant_id", tenantId).eq("location_id", loc.id).order("valid_from", { ascending: false }).limit(5),
      db.from("meters").select("id, name, energy_type, is_main_meter, max_power_kw").eq("tenant_id", tenantId).eq("location_id", loc.id),
      db.from("spot_prices").select("price_eur_mwh, hour_start").order("hour_start", { ascending: false }).limit(48),
    ]);
    locationData.push({ location: loc, pvSettings: pvSettings || [], storages: storages || [], prices: prices || [], meters: meters || [], recentSpotPrices: spotPrices || [] });
  }

  const { data: fundingPrograms } = await db.from("funding_programs").select("*").eq("is_active", true);
  const relevantFunding = (fundingPrograms || []).filter((fp: any) => fp.level === "bund");

  const contextSummary = locationData.map((ld) => {
    const loc = ld.location;
    const existingPV = ld.pvSettings.reduce((sum: number, pv: any) => sum + (pv.capacity_kwp || 0), 0);
    const existingStorage = ld.storages.reduce((sum: number, s: any) => sum + (s.capacity_kwh || 0), 0);
    const mainMeter = ld.meters.find((m: any) => m.is_main_meter);
    const avgSpotPrice = ld.recentSpotPrices.length > 0
      ? ld.recentSpotPrices.reduce((s: number, p: any) => s + p.price_eur_mwh, 0) / ld.recentSpotPrices.length
      : null;
    const currentEnergyPrice = ld.prices.length > 0 ? ld.prices[0].price_per_unit : null;
    return {
      name: loc.name, address: `${loc.address || ""}, ${loc.city || ""}`.trim(),
      usage_type: loc.usage_type || "unbekannt",
      net_floor_area_sqm: loc.net_floor_area || input_params.roof_area_sqm,
      grid_connection_kva: input_params.grid_connection_kva || (mainMeter?.max_power_kw ?? null),
      existing_pv_kwp: existingPV, existing_storage_kwh: existingStorage,
      meter_count: ld.meters.length,
      energy_types: [...new Set(ld.meters.map((m: any) => m.energy_type))],
      current_energy_price_eur_kwh: currentEnergyPrice, avg_spot_price_eur_mwh: avgSpotPrice,
    };
  });

  const fundingSummary = relevantFunding.map((fp: any) => ({
    name: fp.name, level: fp.level, state: fp.state, technology: fp.technology,
    funding_type: fp.funding_type, amount_description: fp.amount_description, max_amount: fp.max_amount,
  }));

  const systemPrompt = `Du bist ein Experte für Energieinvestitionen in Deutschland. 
Du analysierst Standortdaten eines Energiemanagementsystems und gibst konkrete Investitionsempfehlungen.

Deine Aufgabe:
1. Analysiere die Standortdaten (Bestandsanlagen, Fläche, Netzanschluss, Energiepreise)
2. Empfehle sinnvolle Investitionen (PV, Batterie, Wärmepumpe, Lastmanagement)
3. Dimensioniere die Anlagen realistisch
4. Berechne ROI-Szenarien mit und ohne Förderung
5. Ordne passende Förderprogramme zu

Antworte immer strukturiert über die bereitgestellten Tool-Funktionen.
Berücksichtige deutsche Marktbedingungen, aktuelle Strompreise und typische Investitionskosten.
Alle Währungsangaben in EUR. Alle Energieangaben in kWh/kWp/kW.`;

  const userPrompt = `Analysiere folgende Standortdaten und erstelle eine Investitionsempfehlung:

STANDORTE:
${JSON.stringify(contextSummary, null, 2)}

ZUSÄTZLICHE PARAMETER:
- Budget-Obergrenze: ${input_params.budget_limit ? `${input_params.budget_limit} €` : "keine Angabe"}
- Verfügbare Dachfläche: ${input_params.roof_area_sqm ? `${input_params.roof_area_sqm} m²` : "aus Standortdaten"}
- Netzanschlussleistung: ${input_params.grid_connection_kva ? `${input_params.grid_connection_kva} kVA` : "aus Standortdaten"}

VERFÜGBARE FÖRDERPROGRAMME:
${JSON.stringify(fundingSummary, null, 2)}

Erstelle eine vollständige Investitionsanalyse mit Empfehlungen, ROI-Szenarien und Förder-Matching.`;

  const tools = [{
    type: "function",
    function: {
      name: "investment_analysis",
      description: "Liefert die vollständige Investitionsanalyse mit Empfehlungen, ROI-Szenarien und Förder-Matching",
      parameters: {
        type: "object",
        properties: {
          recommendations: {
            type: "array", items: {
              type: "object", properties: {
                technology: { type: "string", enum: ["pv", "battery", "heat_pump", "load_management", "ev_charging", "insulation"] },
                title: { type: "string" }, description: { type: "string" },
                capacity: { type: "string" }, estimated_cost_eur: { type: "number" },
                estimated_savings_year_eur: { type: "number" },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
                rationale: { type: "string" },
              }, required: ["technology", "title", "description", "capacity", "estimated_cost_eur", "estimated_savings_year_eur", "confidence"],
            },
          },
          roi_scenarios: {
            type: "array", items: {
              type: "object", properties: {
                name: { type: "string" }, technologies: { type: "array", items: { type: "string" } },
                total_investment_eur: { type: "number" }, total_funding_eur: { type: "number" },
                annual_savings_eur: { type: "number" }, roi_years: { type: "number" },
                co2_savings_tons_year: { type: "number" },
              }, required: ["name", "technologies", "total_investment_eur", "total_funding_eur", "annual_savings_eur", "roi_years"],
            },
          },
          funding_matches: {
            type: "array", items: {
              type: "object", properties: {
                program_name: { type: "string" }, level: { type: "string", enum: ["bund", "land", "kommune"] },
                estimated_amount_eur: { type: "number" },
                applicable_technologies: { type: "array", items: { type: "string" } },
                notes: { type: "string" },
              }, required: ["program_name", "level", "estimated_amount_eur", "applicable_technologies"],
            },
          },
          summary: {
            type: "object", properties: {
              total_investment_eur: { type: "number" }, total_funding_eur: { type: "number" },
              best_roi_years: { type: "number" }, annual_savings_eur: { type: "number" },
              co2_savings_tons_year: { type: "number" }, key_insight: { type: "string" },
            }, required: ["total_investment_eur", "total_funding_eur", "best_roi_years", "annual_savings_eur", "key_insight"],
          },
        },
        required: ["recommendations", "roi_scenarios", "funding_matches", "summary"],
        additionalProperties: false,
      },
    },
  }];

  const analysis = await callAI(
    [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
    tools, "investment_analysis"
  );

  const { data: savedAnalysis, error: saveError } = await db
    .from("copilot_analyses")
    .insert({
      tenant_id: tenantId, location_id: targetLocationIds[0], analysis_type: analysisType,
      input_params: { ...input_params, location_ids: targetLocationIds },
      recommendations: analysis.recommendations || [], funding_matches: analysis.funding_matches || [],
      roi_scenarios: analysis.roi_scenarios || [],
      total_investment: analysis.summary?.total_investment_eur || 0,
      total_funding: analysis.summary?.total_funding_eur || 0,
      best_roi_years: analysis.summary?.best_roi_years, status: "draft", created_by: userId,
    })
    .select().single();

  if (saveError) {
    console.error("Save error:", saveError);
    return jsonError("Analyse konnte nicht gespeichert werden", 500, saveError.message);
  }

  return jsonOk({
    analysis: savedAnalysis, summary: analysis.summary,
    recommendations: analysis.recommendations, roi_scenarios: analysis.roi_scenarios,
    funding_matches: analysis.funding_matches,
  });
}

// ── Savings Potential Analysis handler ──────────────────────────────────
async function handleSavingsPotential(
  db: any, tenantId: string, userId: string,
  locationId: string, periodDays: number
) {
  // Verify location
  const { data: location } = await db
    .from("locations")
    .select("id, name, address, city, usage_type, net_floor_area")
    .eq("tenant_id", tenantId).eq("id", locationId).single();

  if (!location) return jsonError("Standort nicht gefunden", 404);

  // Get meters for this location
  const { data: meters } = await db
    .from("meters")
    .select("id, name, energy_type, is_main_meter, max_power_kw")
    .eq("tenant_id", tenantId).eq("location_id", locationId);

  if (!meters || meters.length === 0) return jsonError("Keine Zähler am Standort", 400);

  const meterIds = meters.map((m: any) => m.id);
  const now = new Date();
  const fromDate = new Date(now.getTime() - periodDays * 86400000);
  const fromStr = fromDate.toISOString();
  const toStr = now.toISOString();
  const fromDateStr = fromDate.toISOString().slice(0, 10);
  const toDateStr = now.toISOString().slice(0, 10);

  // ── 1. Hourly profiles via 5-min data (aggregated to hourly averages) ──
  const { data: hourlyRaw } = await db.rpc("get_power_readings_5min", {
    p_meter_ids: meterIds,
    p_start: fromStr,
    p_end: toStr,
  });

  // Aggregate into hourly profiles: weekday vs weekend, and hour-of-day
  const hourlyByProfile: Record<string, { sum: number; count: number }> = {};
  const nightValues: number[] = []; // 22:00-05:00 power values for base load
  const peakEntries: { power: number; timestamp: string }[] = [];

  for (const r of (hourlyRaw || [])) {
    const d = new Date(r.bucket);
    const hour = d.getUTCHours(); // bucket is already in local-ish time from the function
    const dayOfWeek = d.getUTCDay(); // 0=Sun, 6=Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const profileKey = `${isWeekend ? "we" : "wd"}_${String(hour).padStart(2, "0")}`;

    if (!hourlyByProfile[profileKey]) hourlyByProfile[profileKey] = { sum: 0, count: 0 };
    hourlyByProfile[profileKey].sum += r.power_avg;
    hourlyByProfile[profileKey].count += 1;

    // Night base load (22-05)
    if (hour >= 22 || hour < 5) {
      nightValues.push(r.power_avg);
    }

    // Track peaks
    peakEntries.push({ power: r.power_avg, timestamp: r.bucket });
  }

  // Average hourly profiles
  const avgProfiles: Record<string, number> = {};
  for (const [key, val] of Object.entries(hourlyByProfile)) {
    avgProfiles[key] = Math.round((val.sum / val.count) * 100) / 100;
  }

  // Night base load stats
  nightValues.sort((a, b) => a - b);
  const nightBaseLoadKw = nightValues.length > 0
    ? Math.round((nightValues.reduce((s, v) => s + v, 0) / nightValues.length) * 100) / 100
    : 0;
  const nightMinKw = nightValues.length > 0 ? Math.round(nightValues[0] * 100) / 100 : 0;

  // Top 5 peaks
  peakEntries.sort((a, b) => b.power - a.power);
  const topPeaks = peakEntries.slice(0, 5).map((p) => ({
    power_kw: Math.round(p.power * 100) / 100,
    timestamp: p.timestamp,
  }));

  // ── 2. Daily totals for weekday vs weekend comparison ──
  const { data: dailyTotals } = await db.rpc("get_meter_daily_totals", {
    p_meter_ids: meterIds,
    p_from_date: fromDateStr,
    p_to_date: toDateStr,
  });

  let weekdayDailyAvg = 0;
  let weekendDailyAvg = 0;
  const wdDays: number[] = [];
  const weDays: number[] = [];

  // Aggregate all meters per day first
  const dayTotals: Record<string, number> = {};
  for (const dt of (dailyTotals || [])) {
    const day = dt.day;
    dayTotals[day] = (dayTotals[day] || 0) + dt.total_value;
  }

  for (const [day, total] of Object.entries(dayTotals)) {
    const d = new Date(day);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) weDays.push(total);
    else wdDays.push(total);
  }

  if (wdDays.length > 0) weekdayDailyAvg = Math.round(wdDays.reduce((s, v) => s + v, 0) / wdDays.length);
  if (weDays.length > 0) weekendDailyAvg = Math.round(weDays.reduce((s, v) => s + v, 0) / weDays.length);

  // ── 3. PV self-consumption (if PV exists) ──
  let pvSelfConsumptionPct: number | null = null;
  const { data: pvSettings } = await db
    .from("pv_forecast_settings")
    .select("pv_meter_id, capacity_kwp")
    .eq("location_id", locationId).eq("is_active", true);

  if (pvSettings && pvSettings.length > 0 && pvSettings[0].pv_meter_id) {
    const pvMeterId = pvSettings[0].pv_meter_id;
    const { data: pvDaily } = await db.rpc("get_meter_period_sums", {
      p_meter_ids: [pvMeterId],
      p_from_date: fromDateStr,
      p_to_date: toDateStr,
    });
    const totalPvKwh = pvDaily?.[0]?.total_value || 0;

    // Main meter consumption
    const mainMeter = meters.find((m: any) => m.is_main_meter);
    if (mainMeter && totalPvKwh > 0) {
      const { data: mainDaily } = await db.rpc("get_meter_period_sums", {
        p_meter_ids: [mainMeter.id],
        p_from_date: fromDateStr,
        p_to_date: toDateStr,
      });
      const totalConsumptionKwh = mainDaily?.[0]?.total_value || 0;
      // Rough self-consumption: min(pvGeneration, consumption) / pvGeneration
      if (totalPvKwh > 0) {
        pvSelfConsumptionPct = Math.round(Math.min(totalConsumptionKwh, totalPvKwh) / totalPvKwh * 100);
      }
    }
  }

  // ── 4. Energy prices & CO₂ factors ──
  const { data: prices } = await db
    .from("energy_prices")
    .select("energy_type, price_per_unit")
    .eq("tenant_id", tenantId).eq("location_id", locationId)
    .order("valid_from", { ascending: false }).limit(3);

  const electricityPriceEurKwh = prices?.find((p: any) => p.energy_type === "electricity")?.price_per_unit || 0.30;

  const { data: co2Factors } = await db
    .from("co2_emission_factors")
    .select("energy_type, factor_kg_per_kwh")
    .eq("tenant_id", tenantId)
    .order("valid_from", { ascending: false }).limit(5);

  const co2FactorKgPerKwh = co2Factors?.find((f: any) => f.energy_type === "electricity")?.factor_kg_per_kwh || 0.4;

  // ── Build AI prompt ──
  const contextData = {
    location: { name: location.name, usage_type: location.usage_type, area_sqm: location.net_floor_area },
    period_days: periodDays,
    meters_count: meters.length,
    energy_types: [...new Set(meters.map((m: any) => m.energy_type))],
    avg_hourly_profiles_kw: avgProfiles,
    night_base_load_avg_kw: nightBaseLoadKw,
    night_base_load_min_kw: nightMinKw,
    top_5_peaks: topPeaks,
    weekday_daily_avg_kwh: weekdayDailyAvg,
    weekend_daily_avg_kwh: weekendDailyAvg,
    weekend_to_weekday_ratio: weekdayDailyAvg > 0 ? Math.round(weekendDailyAvg / weekdayDailyAvg * 100) / 100 : null,
    pv_self_consumption_pct: pvSelfConsumptionPct,
    pv_capacity_kwp: pvSettings?.[0]?.capacity_kwp || null,
    electricity_price_eur_kwh: electricityPriceEurKwh,
    co2_factor_kg_per_kwh: co2FactorKgPerKwh,
    total_days_data: Object.keys(dayTotals).length,
  };

  const systemPrompt = `Du bist ein Experte für Energieeffizienz und Betriebsoptimierung in Deutschland.
Du analysierst aggregierte Messdaten eines Energiemanagementsystems und identifizierst konkrete Einsparpotentiale — OHNE neue Investitionen (keine PV, keine Speicher etc.).

Fokus auf:
1. Grundlast-Reduktion (unnötiger Verbrauch nachts/am Wochenende)
2. Lastspitzen-Vermeidung (staffeltes Einschalten, Lastmanagement)
3. Betriebszeiten-Optimierung (Heizung/Kühlung, Beleuchtung, Lüftung)
4. PV-Eigenverbrauchsoptimierung (Lastverschiebung in Erzeugungsstunden)
5. Saisonale Auffälligkeiten

Für jedes Finding:
- Berechne die geschätzte Einsparung in kWh/Jahr basierend auf den Messdaten
- Multipliziere mit dem Strompreis für EUR/Jahr
- Multipliziere mit dem CO₂-Faktor für kg CO₂/Jahr
- Gib eine konkrete, umsetzbare Handlungsanweisung

Sei konservativ bei Schätzungen — lieber vorsichtig als übertrieben.`;

  const userPrompt = `Analysiere die folgenden aggregierten Messdaten und identifiziere Einsparpotentiale:

${JSON.stringify(contextData, null, 2)}

Hinweise zur Interpretation:
- avg_hourly_profiles_kw: Schlüssel "wd_08" = Werktag 08:00 Uhr, "we_14" = Wochenende 14:00 Uhr. Wert = durchschnittliche Leistung in kW.
- night_base_load_avg_kw: Durchschnittliche Leistung 22:00-05:00
- weekend_to_weekday_ratio: 1.0 = gleicher Verbrauch, 0.3 = 30% des Werktags-Verbrauchs
- pv_self_consumption_pct: null wenn keine PV vorhanden

Identifiziere 3-8 konkrete Einsparpotentiale mit Quantifizierung.`;

  const tools = [{
    type: "function",
    function: {
      name: "savings_analysis",
      description: "Liefert identifizierte Einsparpotentiale mit Quantifizierung",
      parameters: {
        type: "object",
        properties: {
          findings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "Kurzer Titel des Einsparpotentials" },
                description: { type: "string", description: "Erklärung des gefundenen Musters und warum es ein Problem ist" },
                category: { type: "string", enum: ["base_load", "peak_load", "operating_hours", "pv_optimization", "seasonal", "behavior"] },
                priority: { type: "string", enum: ["high", "medium", "low"] },
                estimated_savings_kwh_year: { type: "number", description: "Geschätzte Einsparung in kWh pro Jahr" },
                estimated_savings_eur_year: { type: "number", description: "Geschätzte Einsparung in EUR pro Jahr" },
                estimated_co2_savings_kg_year: { type: "number", description: "Geschätzte CO₂-Einsparung in kg pro Jahr" },
                action_item: { type: "string", description: "Konkrete Handlungsanweisung zur Umsetzung" },
                data_basis: { type: "string", description: "Welche Daten die Grundlage für dieses Finding sind" },
              },
              required: ["title", "description", "category", "priority", "estimated_savings_kwh_year", "estimated_savings_eur_year", "estimated_co2_savings_kg_year", "action_item"],
            },
          },
          summary: {
            type: "object",
            properties: {
              total_savings_kwh_year: { type: "number" },
              total_savings_eur_year: { type: "number" },
              total_co2_savings_kg_year: { type: "number" },
              key_insight: { type: "string", description: "Wichtigste Erkenntnis in einem Satz" },
              data_quality_note: { type: "string", description: "Hinweis zur Datenqualität und Aussagekraft" },
            },
            required: ["total_savings_kwh_year", "total_savings_eur_year", "total_co2_savings_kg_year", "key_insight"],
          },
        },
        required: ["findings", "summary"],
        additionalProperties: false,
      },
    },
  }];

  const analysis = await callAI(
    [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
    tools, "savings_analysis"
  );

  // Save to copilot_analyses
  const { data: savedAnalysis, error: saveError } = await db
    .from("copilot_analyses")
    .insert({
      tenant_id: tenantId, location_id: locationId, analysis_type: "savings_potential",
      input_params: { period_days: periodDays },
      recommendations: analysis.findings || [],
      funding_matches: null, roi_scenarios: null,
      total_investment: 0,
      total_funding: 0,
      best_roi_years: null,
      status: "draft", created_by: userId,
    })
    .select().single();

  if (saveError) {
    console.error("Save error:", saveError);
    return jsonError("Analyse konnte nicht gespeichert werden", 500, saveError.message);
  }

  return jsonOk({
    analysis: savedAnalysis,
    findings: analysis.findings,
    savings_summary: analysis.summary,
  });
}

// ── Main handler ───────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, tenantId, db } = await resolveAuth(req);
    const body = await req.json();
    const { location_id, location_ids, input_params = {}, analysis_mode } = body;

    // Route to savings_potential handler
    if (analysis_mode === "savings_potential") {
      if (!location_id) return jsonError("Standort erforderlich", 400);
      const periodDays = body.period_days || 30;
      return await handleSavingsPotential(db, tenantId, userId, location_id, periodDays);
    }

    // Default: investment analysis
    const analysisType = location_ids?.length > 1 ? "portfolio" : "single_location";
    const targetLocationIds: string[] = location_ids || (location_id ? [location_id] : []);
    if (targetLocationIds.length === 0) return jsonError("Mindestens ein Standort erforderlich", 400);

    return await handleInvestmentAnalysis(db, tenantId, userId, targetLocationIds, input_params, analysisType);
  } catch (e: any) {
    if (e.status && e.message) return jsonError(e.message, e.status, e.detail);
    console.error("copilot-analysis error:", e);
    return jsonError("Interner Fehler", 500, e instanceof Error ? e.message : String(e));
  }
});
