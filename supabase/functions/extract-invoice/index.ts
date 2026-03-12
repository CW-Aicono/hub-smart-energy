import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonError(message: string, status: number, detail?: string) {
  const body: Record<string, string> = { error: message };
  if (detail) body.detail = detail;
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonError("Nicht authentifiziert", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      console.error("[extract-invoice] Auth failed:", claimsError?.message);
      return jsonError("Nicht authentifiziert", 401, claimsError?.message || "JWT-Validierung fehlgeschlagen");
    }
    const userId = claimsData.claims.sub;

    // Get tenant_id
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", userId)
      .single();

    if (!profile?.tenant_id) {
      return jsonError("Kein Mandant zugeordnet", 403, "Bitte stellen Sie sicher, dass Ihr Benutzerprofil einem Mandanten zugeordnet ist.");
    }

    const { file_base64, file_type, locations } = await req.json();

    if (!file_base64) {
      return jsonError("Keine Datei übermittelt", 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return jsonError("KI-Dienst nicht konfiguriert", 500, "Der LOVABLE_API_KEY ist nicht gesetzt. Bitte kontaktieren Sie den Administrator.");
    }

    // Build location context for fuzzy matching
    const locationContext = (locations || [])
      .map((l: any) => `ID: ${l.id} | Name: ${l.name} | Adresse: ${l.address || ""}`)
      .join("\n");

    const mimeType = file_type === "pdf" ? "application/pdf" : `image/${file_type || "jpeg"}`;

    console.log(`[extract-invoice] Calling AI gateway for user ${userId}, file_type=${file_type}, base64_length=${file_base64.length}`);

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
      const errText = await aiResponse.text();
      console.error(`[extract-invoice] AI gateway error: status=${status}, body=${errText}`);

      if (status === 429) {
        return jsonError("Rate-Limit überschritten", 429, "Bitte versuchen Sie es in einer Minute erneut.");
      }
      if (status === 402) {
        return jsonError("KI-Guthaben aufgebraucht", 402, "Bitte laden Sie Ihr Guthaben unter Einstellungen → Workspace → Nutzung auf.");
      }
      return jsonError("KI-Analyse fehlgeschlagen", 500, `AI-Gateway antwortete mit Status ${status}. ${errText.substring(0, 200)}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("[extract-invoice] No tool call in AI response:", JSON.stringify(aiData).substring(0, 500));
      return jsonError("KI hat keine strukturierten Daten zurückgegeben", 500, "Das KI-Modell hat die Rechnung nicht im erwarteten Format analysiert. Bitte versuchen Sie es erneut oder geben Sie die Daten manuell ein.");
    }

    let extracted: Record<string, any>;
    try {
      extracted = JSON.parse(toolCall.function.arguments);
    } catch {
      console.error("[extract-invoice] Failed to parse tool_call arguments:", toolCall.function.arguments);
      return jsonError("KI-Antwort konnte nicht verarbeitet werden", 500, "Die Antwort des KI-Modells war kein gültiges JSON.");
    }

    return new Response(JSON.stringify({ success: true, data: extracted, raw: aiData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[extract-invoice] Unhandled error:", e);
    const msg = e instanceof Error ? e.message : "Unbekannter Fehler";
    return jsonError("Verarbeitungsfehler", 500, msg);
  }
});
