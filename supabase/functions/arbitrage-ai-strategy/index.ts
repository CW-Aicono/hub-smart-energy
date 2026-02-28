import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tenant_id, language = "de" } = await req.json();
    if (!tenant_id) throw new Error("tenant_id is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(supabaseUrl, serviceKey);

    const langMap: Record<string, string> = {
      de: "German",
      en: "English",
      es: "Spanish",
      nl: "Dutch",
    };
    const outputLang = langMap[language] || "English";

    // 1. Load storages for this tenant
    const { data: storages } = await supabase
      .from("energy_storages")
      .select("id, name, capacity_kwh, max_charge_kw, max_discharge_kw, efficiency_pct, location_id, status")
      .eq("tenant_id", tenant_id)
      .eq("status", "active");

    if (!storages || storages.length === 0) {
      return new Response(JSON.stringify({ suggestions: [], message: "No active storages found." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Load spot prices (next 48h + past 12h)
    const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const { data: prices } = await supabase
      .from("spot_prices")
      .select("timestamp, price_eur_mwh")
      .eq("market_area", "DE-LU")
      .gte("timestamp", since)
      .order("timestamp", { ascending: true });

    // 3. Load PV forecasts for locations with storages
    const locationIds = [...new Set(storages.map((s) => s.location_id).filter(Boolean))];
    const pvForecasts: Record<string, any> = {};

    for (const locId of locationIds) {
      try {
        const { data: pvSettings } = await supabase
          .from("pv_forecast_settings")
          .select("peak_power_kwp, tilt_deg, azimuth_deg")
          .eq("location_id", locId)
          .eq("is_active", true)
          .maybeSingle();

        if (pvSettings) {
          const { data: loc } = await supabase
            .from("locations")
            .select("latitude, longitude, name")
            .eq("id", locId)
            .single();

          if (loc?.latitude && loc?.longitude) {
            const meteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&hourly=shortwave_radiation&timezone=Europe/Berlin&forecast_days=2`;
            const meteoRes = await fetch(meteoUrl);
            if (meteoRes.ok) {
              const meteo = await meteoRes.json();
              const times: string[] = meteo.hourly.time;
              const ghi: number[] = meteo.hourly.shortwave_radiation;
              const PR = 0.80;
              pvForecasts[locId as string] = times.map((ts: string, i: number) => ({
                timestamp: ts,
                estimated_kwh: Math.round((ghi[i] * pvSettings.peak_power_kwp * PR) / 1000 * 100) / 100,
              }));
            }
          }
        }
      } catch (e) {
        console.error("PV forecast fetch error for location", locId, e);
      }
    }

    // 4. Load existing strategies
    const { data: existingStrategies } = await supabase
      .from("arbitrage_strategies")
      .select("name, storage_id, buy_below_eur_mwh, sell_above_eur_mwh, is_active")
      .eq("tenant_id", tenant_id);

    // 5. Build AI prompt data
    const pricesSummary = (prices || [])
      .map((p: any) => `${p.timestamp}: ${p.price_eur_mwh} €/MWh`)
      .join("\n");

    const storagesSummary = storages
      .map((s) => `${s.name}: ${s.capacity_kwh} kWh, charge max ${s.max_charge_kw} kW, discharge max ${s.max_discharge_kw} kW, efficiency ${s.efficiency_pct}%`)
      .join("\n");

    const pvSummary = Object.entries(pvForecasts)
      .map(([locId, entries]: [string, any]) => {
        const storage = storages.find((s) => s.location_id === locId);
        const relevantEntries = entries.filter((e: any) => e.estimated_kwh > 0).slice(0, 24);
        return `Storage "${storage?.name}" – PV forecast:\n${relevantEntries.map((e: any) => `  ${e.timestamp}: ${e.estimated_kwh} kWh`).join("\n")}`;
      })
      .join("\n\n");

    const existingStr = (existingStrategies || [])
      .map((s: any) => `"${s.name}" (storage: ${s.storage_id}, buy <${s.buy_below_eur_mwh} €/MWh, sell >${s.sell_above_eur_mwh} €/MWh, active: ${s.is_active})`)
      .join("\n");

    // 6. Call AI
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an expert in energy storage arbitrage on the spot market (EPEX Spot DE-LU).
Your task: Analyze spot prices and PV forecasts to suggest optimal charge/discharge times and trading strategies.
Consider:
- Storage capacity and efficiency (round-trip losses)
- PV surplus should be used for charging instead of expensive grid power
- Low spot prices = charge, high spot prices = discharge/sell
- Price spreads must be large enough to compensate for efficiency losses
- Provide concrete time windows and estimated revenues in Euro

IMPORTANT: All text output (strategy names, reasoning, market_summary, window reasons) MUST be written in ${outputLang}.
The confidence field must use the English values: "high", "medium", or "low".`,
          },
          {
            role: "user",
            content: `Current spot prices (DE-LU):\n${pricesSummary}\n\nStorages:\n${storagesSummary}\n\nPV forecasts:\n${pvSummary || "No PV data available"}\n\nExisting strategies:\n${existingStr || "None"}\n\nPlease suggest 2-4 optimal strategies.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_strategies",
              description: "Return arbitrage strategy suggestions based on spot prices and PV forecast",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Short strategy name" },
                        storage_name: { type: "string", description: "Name of the storage" },
                        buy_below_eur_mwh: { type: "number", description: "Buy threshold in €/MWh" },
                        sell_above_eur_mwh: { type: "number", description: "Sell threshold in €/MWh" },
                        charge_windows: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              start: { type: "string", description: "Start time ISO" },
                              end: { type: "string", description: "End time ISO" },
                              reason: { type: "string", description: "Reason (e.g. low price, PV surplus)" },
                            },
                            required: ["start", "end", "reason"],
                          },
                        },
                        discharge_windows: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              start: { type: "string", description: "Start time ISO" },
                              end: { type: "string", description: "End time ISO" },
                              reason: { type: "string" },
                            },
                            required: ["start", "end", "reason"],
                          },
                        },
                        estimated_revenue_eur: { type: "number", description: "Estimated revenue in Euro for 48h" },
                        confidence: { type: "string", enum: ["high", "medium", "low"] },
                        reasoning: { type: "string", description: "Brief reasoning for the strategy" },
                      },
                      required: ["name", "storage_name", "buy_below_eur_mwh", "sell_above_eur_mwh", "charge_windows", "discharge_windows", "estimated_revenue_eur", "confidence", "reasoning"],
                    },
                  },
                  market_summary: { type: "string", description: "Brief summary of the current market situation" },
                },
                required: ["suggestions", "market_summary"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_strategies" } },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI error:", aiRes.status, errText);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted. Please top up." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI request failed");
    }

    const aiData = await aiRes.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No AI response");

    const result = JSON.parse(toolCall.function.arguments);

    // Map storage names to IDs for one-click adoption
    const suggestionsWithIds = result.suggestions.map((s: any) => {
      const storage = storages.find((st) => st.name === s.storage_name);
      return { ...s, storage_id: storage?.id || null };
    });

    return new Response(JSON.stringify({
      suggestions: suggestionsWithIds,
      market_summary: result.market_summary,
      generated_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("arbitrage-ai-strategy error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
