import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get tenant_id
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", user.id)
      .single();

    if (!profile?.tenant_id) {
      return new Response(JSON.stringify({ error: "No tenant" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { file_base64, file_type, locations } = await req.json();

    if (!file_base64) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build location context for fuzzy matching
    const locationContext = (locations || [])
      .map((l: any) => `ID: ${l.id} | Name: ${l.name} | Adresse: ${l.address || ""}`)
      .join("\n");

    const mimeType = file_type === "pdf" ? "application/pdf" : `image/${file_type || "jpeg"}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content: `Du bist ein Experte für die Analyse von Energierechnungen. Extrahiere strukturierte Daten aus der hochgeladenen Rechnung. Verwende die Tool-Funktion, um die extrahierten Daten zurückzugeben.

Verfügbare Liegenschaften für die Zuordnung:
${locationContext || "Keine Liegenschaften verfügbar"}

Regeln:
- energy_type muss eines von: strom, gas, waerme, wasser, fernwaerme sein
- Datumsformate: YYYY-MM-DD
- consumption_unit: kWh oder m³
- Wenn du unsicher bist, setze confidence auf "low"
- Versuche die Lieferadresse auf der Rechnung mit den Liegenschaften abzugleichen
- Extrahiere Brutto, Netto und Steuerbetrag wenn vorhanden`,
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${file_base64}`,
                },
              },
              {
                type: "text",
                text: "Bitte analysiere diese Energierechnung und extrahiere alle relevanten Daten.",
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_invoice_data",
              description: "Extrahierte Rechnungsdaten strukturiert zurückgeben",
              parameters: {
                type: "object",
                properties: {
                  supplier_name: { type: "string", description: "Name des Energieversorgers" },
                  invoice_number: { type: "string", description: "Rechnungsnummer" },
                  energy_type: {
                    type: "string",
                    enum: ["strom", "gas", "waerme", "wasser", "fernwaerme"],
                    description: "Art der Energie",
                  },
                  period_start: { type: "string", description: "Beginn Abrechnungszeitraum (YYYY-MM-DD)" },
                  period_end: { type: "string", description: "Ende Abrechnungszeitraum (YYYY-MM-DD)" },
                  consumption_kwh: { type: "number", description: "Verbrauch in kWh oder m³" },
                  consumption_unit: {
                    type: "string",
                    enum: ["kWh", "m³"],
                    description: "Einheit des Verbrauchs",
                  },
                  total_gross: { type: "number", description: "Bruttobetrag in EUR" },
                  total_net: { type: "number", description: "Nettobetrag in EUR" },
                  tax_amount: { type: "number", description: "Steuerbetrag in EUR" },
                  suggested_location_id: {
                    type: "string",
                    description: "UUID der am besten passenden Liegenschaft",
                  },
                  confidence: {
                    type: "string",
                    enum: ["high", "medium", "low"],
                    description: "Gesamtkonfidenz der Extraktion",
                  },
                  field_confidences: {
                    type: "object",
                    description: "Konfidenz pro Feld",
                    properties: {
                      supplier_name: { type: "string", enum: ["high", "medium", "low"] },
                      invoice_number: { type: "string", enum: ["high", "medium", "low"] },
                      energy_type: { type: "string", enum: ["high", "medium", "low"] },
                      period_start: { type: "string", enum: ["high", "medium", "low"] },
                      period_end: { type: "string", enum: ["high", "medium", "low"] },
                      consumption_kwh: { type: "string", enum: ["high", "medium", "low"] },
                      total_gross: { type: "string", enum: ["high", "medium", "low"] },
                      location: { type: "string", enum: ["high", "medium", "low"] },
                    },
                  },
                },
                required: [
                  "supplier_name",
                  "energy_type",
                  "consumption_kwh",
                  "total_gross",
                  "confidence",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_invoice_data" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", status, errText);
      return new Response(JSON.stringify({ error: "AI extraction failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "AI returned no structured data" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let extracted: Record<string, any>;
    try {
      extracted = JSON.parse(toolCall.function.arguments);
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, data: extracted, raw: aiData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-invoice error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
