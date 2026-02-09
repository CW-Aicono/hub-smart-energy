import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { image } = await req.json(); // base64 data URL
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    if (!image) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Du bist ein Experte für das Ablesen von Zählerständen. Analysiere das Bild und extrahiere:
1. Den Zählerstand (die Ziffern auf dem Display/Rollenzählwerk). Gib nur die Vorkomma-Ziffern zurück, KEINE Nachkommastellen die rot markiert sind.
2. Die Zählernummer (falls sichtbar, oft auf einem Schild am Zähler).
Gib die Daten strukturiert zurück.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Bitte lies den Zählerstand und die Zählernummer von diesem Bild ab." },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_meter_data",
              description: "Extrahiert Zählerstand und Zählernummer aus einem Zähler-Foto",
              parameters: {
                type: "object",
                properties: {
                  reading: {
                    type: "number",
                    description: "Der abgelesene Zählerstand als Zahl (nur Vorkomma-Ziffern)",
                  },
                  meter_number: {
                    type: "string",
                    description: "Die Zählernummer, falls auf dem Bild sichtbar. Leer lassen wenn nicht erkennbar.",
                  },
                  confidence: {
                    type: "string",
                    enum: ["high", "medium", "low"],
                    description: "Wie sicher die Erkennung ist",
                  },
                  notes: {
                    type: "string",
                    description: "Zusätzliche Hinweise zur Erkennung",
                  },
                },
                required: ["reading", "confidence"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_meter_data" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit erreicht. Bitte versuchen Sie es später erneut." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "KI-Kontingent erschöpft." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      return new Response(JSON.stringify({ error: "KI-Erkennung fehlgeschlagen" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Keine Daten erkannt" }), {
      status: 422,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("meter-ocr error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
