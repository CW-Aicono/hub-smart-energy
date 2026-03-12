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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return jsonError("Nicht authentifiziert", 401);

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(supabaseUrl, supabaseKey);
    const { data: claimsData, error: claimsError } = await authClient.auth.getUser(token);
    if (claimsError || !claimsData?.user) return jsonError("Nicht authentifiziert", 401, claimsError?.message);

    const userId = claimsData.user.id;
    const db = createClient(supabaseUrl, serviceKey);

    // Get tenant
    const { data: profile } = await db.from("profiles").select("tenant_id").eq("user_id", userId).single();
    if (!profile?.tenant_id) return jsonError("Kein Mandant zugeordnet", 403);
    const tenantId = profile.tenant_id;

    // Parse request
    const body = await req.json();
    const { location_id, location_ids, input_params = {} } = body;
    const analysisType = location_ids?.length > 1 ? "portfolio" : "single_location";
    const targetLocationIds: string[] = location_ids || (location_id ? [location_id] : []);

    if (targetLocationIds.length === 0) return jsonError("Mindestens ein Standort erforderlich", 400);

    // Verify locations belong to tenant
    const { data: locations, error: locError } = await db
      .from("locations")
      .select("id, name, address, city, postal_code, country, latitude, longitude, usage_type, net_floor_area, gross_floor_area, heating_type")
      .eq("tenant_id", tenantId)
      .in("id", targetLocationIds);

    console.log("Location query result:", locations?.length, "error:", locError?.message);
    if (!locations || locations.length === 0) return jsonError("Standort nicht gefunden", 404, locError?.message || `IDs: ${targetLocationIds.join(", ")}`);

    // Aggregate data for each location
    const locationData = [];
    for (const loc of locations) {
      // PV forecast settings
      const { data: pvSettings } = await db
        .from("pv_forecast_settings")
        .select("*")
        .eq("location_id", loc.id)
        .eq("is_active", true);

      // Energy storages
      const { data: storages } = await db
        .from("energy_storages")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("location_id", loc.id);

      // Energy prices
      const { data: prices } = await db
        .from("energy_prices")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("location_id", loc.id)
        .order("valid_from", { ascending: false })
        .limit(5);

      // Meters for load profile info
      const { data: meters } = await db
        .from("meters")
        .select("id, name, energy_type, is_main_meter, max_power_kw")
        .eq("tenant_id", tenantId)
        .eq("location_id", loc.id);

      // Recent spot prices
      const { data: spotPrices } = await db
        .from("spot_prices")
        .select("price_eur_mwh, hour_start")
        .order("hour_start", { ascending: false })
        .limit(48);

      locationData.push({
        location: loc,
        pvSettings: pvSettings || [],
        storages: storages || [],
        prices: prices || [],
        meters: meters || [],
        recentSpotPrices: spotPrices || [],
      });
    }

    // Fetch matching funding programs
    // Bundesland aus Adresse ableiten (kein state-Feld in locations)
    const states: string[] = [];
    let fundingQuery = db
      .from("funding_programs")
      .select("*")
      .eq("is_active", true);

    const { data: fundingPrograms } = await fundingQuery;

    // Filter funding by state relevance
    const relevantFunding = (fundingPrograms || []).filter((fp: any) => {
      if (fp.level === "bund") return true;
      if (fp.level === "land" && states.includes(fp.state)) return true;
      return false;
    });

    // Build AI prompt context
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
        name: loc.name,
        address: `${loc.address || ""}, ${loc.city || ""}`.trim(),
        state: loc.state || "unbekannt",
        area_sqm: loc.area_sqm || input_params.roof_area_sqm,
        grid_connection_kva: input_params.grid_connection_kva || (mainMeter?.max_power_kw ?? null),
        existing_pv_kwp: existingPV,
        existing_storage_kwh: existingStorage,
        meter_count: ld.meters.length,
        energy_types: [...new Set(ld.meters.map((m: any) => m.energy_type))],
        current_energy_price_eur_kwh: currentEnergyPrice,
        avg_spot_price_eur_mwh: avgSpotPrice,
      };
    });

    const fundingSummary = relevantFunding.map((fp: any) => ({
      name: fp.name,
      level: fp.level,
      state: fp.state,
      technology: fp.technology,
      funding_type: fp.funding_type,
      amount_description: fp.amount_description,
      max_amount: fp.max_amount,
    }));

    // Call Lovable AI with tool-calling
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return jsonError("KI nicht konfiguriert", 500, "LOVABLE_API_KEY fehlt");

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

    const tools = [
      {
        type: "function",
        function: {
          name: "investment_analysis",
          description: "Liefert die vollständige Investitionsanalyse mit Empfehlungen, ROI-Szenarien und Förder-Matching",
          parameters: {
            type: "object",
            properties: {
              recommendations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    technology: { type: "string", enum: ["pv", "battery", "heat_pump", "load_management", "ev_charging", "insulation"] },
                    title: { type: "string" },
                    description: { type: "string" },
                    capacity: { type: "string", description: "z.B. '1.1 MWp' oder '800 kWh'" },
                    estimated_cost_eur: { type: "number" },
                    estimated_savings_year_eur: { type: "number" },
                    confidence: { type: "string", enum: ["high", "medium", "low"] },
                    rationale: { type: "string" },
                  },
                  required: ["technology", "title", "description", "capacity", "estimated_cost_eur", "estimated_savings_year_eur", "confidence"],
                },
              },
              roi_scenarios: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    technologies: { type: "array", items: { type: "string" } },
                    total_investment_eur: { type: "number" },
                    total_funding_eur: { type: "number" },
                    annual_savings_eur: { type: "number" },
                    roi_years: { type: "number" },
                    co2_savings_tons_year: { type: "number" },
                  },
                  required: ["name", "technologies", "total_investment_eur", "total_funding_eur", "annual_savings_eur", "roi_years"],
                },
              },
              funding_matches: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    program_name: { type: "string" },
                    level: { type: "string", enum: ["bund", "land", "kommune"] },
                    estimated_amount_eur: { type: "number" },
                    applicable_technologies: { type: "array", items: { type: "string" } },
                    notes: { type: "string" },
                  },
                  required: ["program_name", "level", "estimated_amount_eur", "applicable_technologies"],
                },
              },
              summary: {
                type: "object",
                properties: {
                  total_investment_eur: { type: "number" },
                  total_funding_eur: { type: "number" },
                  best_roi_years: { type: "number" },
                  annual_savings_eur: { type: "number" },
                  co2_savings_tons_year: { type: "number" },
                  key_insight: { type: "string" },
                },
                required: ["total_investment_eur", "total_funding_eur", "best_roi_years", "annual_savings_eur", "key_insight"],
              },
            },
            required: ["recommendations", "roi_scenarios", "funding_matches", "summary"],
            additionalProperties: false,
          },
        },
      },
    ];

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "investment_analysis" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      const text = await aiResponse.text();
      console.error("AI Gateway error:", status, text);
      if (status === 429) return jsonError("KI-Rate-Limit erreicht", 429, "Bitte versuchen Sie es in einer Minute erneut.");
      if (status === 402) return jsonError("KI-Credits aufgebraucht", 402, "Bitte Credits im Workspace aufladen.");
      return jsonError("KI-Analyse fehlgeschlagen", 500, text);
    }

    const aiResult = await aiResponse.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in AI response:", JSON.stringify(aiResult));
      return jsonError("KI hat keine strukturierte Antwort geliefert", 500);
    }

    let analysis;
    try {
      analysis = JSON.parse(toolCall.function.arguments);
    } catch {
      console.error("Failed to parse tool call arguments:", toolCall.function.arguments);
      return jsonError("KI-Antwort konnte nicht verarbeitet werden", 500);
    }

    // Store analysis
    const { data: savedAnalysis, error: saveError } = await db
      .from("copilot_analyses")
      .insert({
        tenant_id: tenantId,
        location_id: targetLocationIds[0],
        analysis_type: analysisType,
        input_params: { ...input_params, location_ids: targetLocationIds },
        recommendations: analysis.recommendations || [],
        funding_matches: analysis.funding_matches || [],
        roi_scenarios: analysis.roi_scenarios || [],
        total_investment: analysis.summary?.total_investment_eur || 0,
        total_funding: analysis.summary?.total_funding_eur || 0,
        best_roi_years: analysis.summary?.best_roi_years,
        status: "draft",
        created_by: userId,
      })
      .select()
      .single();

    if (saveError) {
      console.error("Save error:", saveError);
      return jsonError("Analyse konnte nicht gespeichert werden", 500, saveError.message);
    }

    return jsonOk({
      analysis: savedAnalysis,
      summary: analysis.summary,
      recommendations: analysis.recommendations,
      roi_scenarios: analysis.roi_scenarios,
      funding_matches: analysis.funding_matches,
    });
  } catch (e) {
    console.error("copilot-analysis error:", e);
    return jsonError("Interner Fehler", 500, e instanceof Error ? e.message : String(e));
  }
});
