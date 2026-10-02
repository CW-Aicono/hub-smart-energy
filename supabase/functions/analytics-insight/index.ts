import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

interface SeriesSummary {
  label: string;
  unit: string;
  stats: { min: number; max: number; avg: number; sum: number; count: number };
  peaks: { t: number; v: number }[];
  valleys: { t: number; v: number }[];
  samples: { t: number; v: number }[];
}

interface BlockSummary {
  id: string;
  title: string;
  type: string;
  series: SeriesSummary[];
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const body = await req.json();
    const period: string = body.period ?? "day";
    const blocks: BlockSummary[] = Array.isArray(body.blocks) ? body.blocks : [];
    const rangeLabel: string = body.rangeLabel ?? "";

    if (blocks.length === 0) {
      return new Response(
        JSON.stringify({ analysis: "_Keine Blöcke mit Daten für die Analyse vorhanden._", refs: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `Du bist ein erfahrener Energie-Analyst und erklärst Auffälligkeiten in Messwerten auf Deutsch, prägnant und für Nicht-Techniker verständlich.

**Regeln:**
- Antworte in kurzem, gut lesbarem Markdown (keine Code-Blöcke).
- Beginne mit einer 1–2-Satz-Zusammenfassung.
- Nutze anschließend Bulletpoints (max. 5) für konkrete Beobachtungen: Spitzen, Einbrüche, ungewöhnliche Muster, Zusammenhänge zwischen Blöcken, Vermutungen zur Ursache.
- Nenne relevante Zeitpunkte in lokaler Zeit (Europe/Berlin) und Werte mit Einheit.
- Wenn du dich auf einen bestimmten Analyse-Block beziehst, verwende **exakt** das Token \`[[block:BLOCK_ID]]\` (mit der übergebenen ID). Setze das Token direkt am Anfang oder Ende des Bullets.
- Wenn nichts Auffälliges erkennbar ist: sag das ehrlich in einem Satz.
- Keine Erfindungen — beziehe dich nur auf gelieferte Zahlen.
- Alle Zahlen im deutschen Format (z. B. 1.234,56).`;

    const userPrompt = `Zeitraum: **${period}${rangeLabel ? " · " + rangeLabel : ""}**

Analyse-Blöcke:
${JSON.stringify(blocks, null, 2)}

Bitte identifiziere die wichtigsten Auffälligkeiten und erkläre kurz, was hier passiert ist.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.6-sol",
        reasoning_effort: "none",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error(`AI Gateway ${aiRes.status}: ${errText}`);
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "KI-Ratelimit erreicht. Bitte gleich erneut versuchen." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "KI-Guthaben aufgebraucht. Bitte im Workspace nachfüllen." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "KI-Analyse fehlgeschlagen", details: errText }),
        { status: aiRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiJson = await aiRes.json();
    const analysis: string = aiJson?.choices?.[0]?.message?.content ?? "";

    // Extract referenced block IDs
    const refIds = new Set<string>();
    const re = /\[\[block:([a-zA-Z0-9_-]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(analysis)) !== null) refIds.add(m[1]);

    return new Response(
      JSON.stringify({
        analysis,
        refs: Array.from(refIds),
        model: "openai/gpt-5.6-sol",
        generatedAt: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("analytics-insight error", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "Unbekannter Fehler" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
