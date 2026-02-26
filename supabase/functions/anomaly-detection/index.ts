import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { energyData, locationName } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `Du bist ein Energie-Analyst für kommunale Liegenschaften. Analysiere die Verbrauchsdaten und identifiziere Anomalien und Auffälligkeiten.

Antworte IMMER im folgenden JSON-Format (keine Markdown-Codeblöcke, nur reines JSON):
{
  "anomalies": [
    {
      "severity": "warning" | "critical" | "info",
      "title": "Kurzer Titel der Anomalie",
      "description": "Detaillierte Beschreibung",
      "month": "Betroffener Monat",
      "energyType": "strom" | "gas" | "waerme",
      "recommendation": "Handlungsempfehlung"
    }
  ],
  "summary": "Zusammenfassende Bewertung der Gesamtsituation in 2-3 Sätzen",
  "overallRisk": "low" | "medium" | "high"
}

Prüfe insbesondere auf:
- Ungewöhnliche Verbrauchsspitzen oder -einbrüche
- Saisonale Abweichungen (z.B. hoher Heizverbrauch im Sommer)
- Trends die auf Defekte oder Ineffizienz hindeuten
- Vergleich zwischen Energiearten (Verhältnismäßigkeit)

Sei präzise und gib konkrete Handlungsempfehlungen.`;

    const userPrompt = `Analysiere die folgenden monatlichen Energieverbrauchsdaten${locationName ? ` für den Standort "${locationName}"` : " über alle Liegenschaften"}:

${JSON.stringify(energyData, null, 2)}

Die Werte sind in kWh. Identifiziere alle Anomalien und Auffälligkeiten.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate-Limit erreicht. Bitte versuchen Sie es später erneut." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "KI-Kontingent aufgebraucht. Bitte Credits aufladen." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "KI-Analyse fehlgeschlagen" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(JSON.stringify({ error: "Keine Antwort von der KI erhalten" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse the JSON response, handling potential markdown code blocks
    let parsed;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = {
        anomalies: [],
        summary: content,
        overallRisk: "low",
      };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("anomaly-detection error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unbekannter Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
