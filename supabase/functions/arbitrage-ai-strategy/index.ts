import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tenant_id } = await req.json();
    if (!tenant_id) throw new Error("tenant_id is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(supabaseUrl, serviceKey);

    // 1. Load storages for this tenant
    const { data: storages } = await supabase
      .from("energy_storages")
      .select("id, name, capacity_kwh, max_charge_kw, max_discharge_kw, efficiency_pct, location_id, status")
      .eq("tenant_id", tenant_id)
      .eq("status", "active");

    if (!storages || storages.length === 0) {
      return new Response(JSON.stringify({ suggestions: [], message: "Keine aktiven Speicher vorhanden." }), {
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
        // Check if PV settings exist for this location
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

    // 5. Build AI prompt
    const pricesSummary = (prices || [])
      .map((p: any) => `${p.timestamp}: ${p.price_eur_mwh} €/MWh`)
      .join("\n");

    const storagesSummary = storages
      .map((s) => `${s.name}: ${s.capacity_kwh} kWh, Laden max ${s.max_charge_kw} kW, Entladen max ${s.max_discharge_kw} kW, Wirkungsgrad ${s.efficiency_pct}%`)
      .join("\n");

    const pvSummary = Object.entries(pvForecasts)
      .map(([locId, entries]: [string, any]) => {
        const storage = storages.find((s) => s.location_id === locId);
        const relevantEntries = entries.filter((e: any) => e.estimated_kwh > 0).slice(0, 24);
        return `Speicher "${storage?.name}" – PV-Prognose:\n${relevantEntries.map((e: any) => `  ${e.timestamp}: ${e.estimated_kwh} kWh`).join("\n")}`;
      })
      .join("\n\n");

    const existingStr = (existingStrategies || [])
      .map((s: any) => `"${s.name}" (Speicher: ${s.storage_id}, Kauf <${s.buy_below_eur_mwh} €/MWh, Verkauf >${s.sell_above_eur_mwh} €/MWh, aktiv: ${s.is_active})`)
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
            content: `Du bist ein Experte für Energiespeicher-Arbitrage am Spotmarkt (EPEX Spot DE-LU).
Deine Aufgabe: Analysiere Spotpreise und PV-Prognosen, um optimale Lade-/Entladezeiten und Handelsstrategien vorzuschlagen.
Berücksichtige:
- Speicherkapazität und Wirkungsgrad (Verluste beim Laden/Entladen)
- PV-Überschuss sollte zum Laden genutzt werden statt teuer aus dem Netz
- Niedrige Spotpreise = laden, hohe Spotpreise = entladen/verkaufen
- Preisspreads müssen groß genug sein, um Wirkungsgradverluste zu kompensieren
- Gib konkrete Zeitfenster und geschätzte Erlöse in Euro an`,
          },
          {
            role: "user",
            content: `Aktuelle Spotpreise (DE-LU):\n${pricesSummary}\n\nSpeicher:\n${storagesSummary}\n\nPV-Prognosen:\n${pvSummary || "Keine PV-Daten verfügbar"}\n\nBestehende Strategien:\n${existingStr || "Keine"}\n\nBitte schlage 2-4 optimale Strategien vor.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_strategies",
              description: "Liefere Arbitrage-Strategievorschläge basierend auf Spotpreisen und PV-Prognose",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Kurzname der Strategie" },
                        storage_name: { type: "string", description: "Name des Speichers" },
                        buy_below_eur_mwh: { type: "number", description: "Kaufschwelle in €/MWh" },
                        sell_above_eur_mwh: { type: "number", description: "Verkaufsschwelle in €/MWh" },
                        charge_windows: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              start: { type: "string", description: "Startzeit ISO" },
                              end: { type: "string", description: "Endzeit ISO" },
                              reason: { type: "string", description: "Grund (z.B. Niedrigpreis, PV-Überschuss)" },
                            },
                            required: ["start", "end", "reason"],
                          },
                        },
                        discharge_windows: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              start: { type: "string", description: "Startzeit ISO" },
                              end: { type: "string", description: "Endzeit ISO" },
                              reason: { type: "string" },
                            },
                            required: ["start", "end", "reason"],
                          },
                        },
                        estimated_revenue_eur: { type: "number", description: "Geschätzter Erlös in Euro für 48h" },
                        confidence: { type: "string", enum: ["hoch", "mittel", "niedrig"] },
                        reasoning: { type: "string", description: "Kurze Begründung der Strategie" },
                      },
                      required: ["name", "storage_name", "buy_below_eur_mwh", "sell_above_eur_mwh", "charge_windows", "discharge_windows", "estimated_revenue_eur", "confidence", "reasoning"],
                    },
                  },
                  market_summary: { type: "string", description: "Kurze Zusammenfassung der aktuellen Marktsituation" },
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
        return new Response(JSON.stringify({ error: "Rate Limit erreicht. Bitte versuchen Sie es später erneut." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "Guthaben erschöpft. Bitte laden Sie Ihr Guthaben auf." }), {
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
