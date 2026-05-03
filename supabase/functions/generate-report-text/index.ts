import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  section: "vorwort" | "einleitung" | "ausblick" | "massnahmen";
  profile: {
    code: string;
    name: string;
    legalBasis: string;
    reportingCycle: number;
    extraTopics: string[];
  };
  context: {
    tenantName?: string;
    mayorName?: string;
    reportYear: number;
    locationCount?: number;
    totalArea?: number;
    totalCo2Tons?: number;
    totalCostEur?: number;
    existingSections?: Partial<Record<"vorwort" | "einleitung" | "ausblick" | "massnahmen", string>>;
    locations?: Array<{
      name: string;
      usageType?: string;
      area?: number;
      heatingType?: string;
      benchmarkDeviation?: number;
    }>;
  };
}

const SYSTEM_PROMPT = `Du bist ein professioneller Redakteur für kommunale Energieberichte in Deutschland.
Schreibe in sachlichem, verwaltungsadäquatem Deutsch (Sie-Form), ohne Marketing-Floskeln.
Verwende konkrete Zahlen wenn vorhanden.
WICHTIG: Vermeide Wiederholungen. Jeder Abschnitt hat eine klar abgegrenzte Funktion. Wiederhole NICHT Inhalte, die in bereits vorhandenen Abschnitten stehen (z. B. dieselbe Aufzählung von Liegenschaftszahl, Fläche, CO₂, Kosten oder die wortgleiche Wiedergabe der Rechtsgrundlage). Erwähne die landesrechtliche Grundlage höchstens einmal kurz pro Abschnitt – nur wenn für den Zweck wirklich nötig.
Antworte ausschließlich mit gültigem semantischen HTML (z.B. <p>, <h3>, <ul>, <li>) – kein Markdown, kein <html>/<body>-Wrapper, KEINE Überschrift mit dem Abschnittsnamen (Vorwort/Einleitung/Ausblick) – die Überschrift wird vom Layout gesetzt.`;

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function buildPrompt(body: RequestBody): string {
  const { section, profile, context } = body;
  const baseCtx = `
Bundesland: ${profile.name} (${profile.code})
Rechtliche Grundlage: ${profile.legalBasis}
Berichtsturnus: alle ${profile.reportingCycle} Jahre
Besondere Pflichten: ${profile.extraTopics.length ? profile.extraTopics.join("; ") : "keine landesspezifischen Zusatzpflichten"}
Kommune/Mandant: ${context.tenantName ?? "(unbenannt)"}
Berichtsjahr: ${context.reportYear}
Anzahl Liegenschaften: ${context.locationCount ?? "?"}
Gesamtfläche NGF: ${context.totalArea ?? "?"} m²
CO₂-Emissionen gesamt: ${context.totalCo2Tons ?? "?"} t/a
Energiekosten gesamt: ${context.totalCostEur ?? "?"} €
`;

  const existing = context.existingSections ?? {};
  const existingBlocks = (["vorwort", "einleitung", "ausblick", "massnahmen"] as const)
    .filter((k) => k !== section && existing[k])
    .map((k) => `--- Bereits vorhandener Abschnitt "${k}" (NICHT wiederholen, weder inhaltlich noch im Wortlaut) ---\n${stripHtml(existing[k]!).slice(0, 1500)}`)
    .join("\n\n");
  const avoidBlock = existingBlocks
    ? `\n${existingBlocks}\n\nFormuliere deinen Abschnitt so, dass er sich inhaltlich und sprachlich deutlich von den oben aufgeführten Abschnitten unterscheidet.\n`
    : "";

  switch (section) {
    case "vorwort":
      return `${baseCtx}${avoidBlock}\nSchreibe ein 2 Absätze langes Vorwort der Verwaltungsspitze${context.mayorName ? ` (${context.mayorName})` : ""}.
Tonalität: persönlich-politisch, wertschätzend, motivierend. Bezug auf Verantwortung der Kommune und kommunalen Klimaschutz.
NICHT enthalten: methodische Details (Witterungsbereinigung, Benchmarks, BMWi/BMUB), wörtliche Wiederholung der Kennzahlen-Liste (Liegenschaftszahl, Fläche, CO₂, Kosten). Höchstens ein knapper qualitativer Verweis auf die Größenordnung des Portfolios.`;
    case "einleitung":
      return `${baseCtx}${avoidBlock}\nSchreibe eine 3 Absätze lange Einleitung.
Inhalt: (1) Zweck und Adressaten des Berichts, (2) methodisches Vorgehen – Witterungsbereinigung mit DWD-Klimafaktoren, Benchmark-Vergleich nach BMWi/BMUB 2015, Emissionsfaktoren –, (3) Aufbau des Berichts.
NICHT enthalten: politisches Vorwort-Vokabular ("Vorbildfunktion", "Verantwortung"), wortgleiche Wiederholung der Rechtsgrundlage aus dem Vorwort. Kennzahlen nur dort einbauen, wo sie methodisch nötig sind (z. B. Bilanzraum), nicht als zweite Aufzählung.`;
    case "ausblick":
      return `${baseCtx}${avoidBlock}\nSchreibe einen Ausblick (2–3 Absätze) mit konkreten nächsten Schritten: priorisierte Sanierungen, erneuerbare Wärme, PV-Ausbau, ggf. landesspezifische Pflichten.
NICHT enthalten: Wiederholung der Rechtsgrundlage, Zweck des Berichts oder methodische Erläuterungen aus den vorherigen Abschnitten, wortgleiche Wiederholung der Gesamtkennzahlen. Fokus ausschließlich auf zukünftige Maßnahmen, Zeitachse und Ziele.`;
    case "massnahmen": {
      const locs = (context.locations ?? []).slice(0, 10).map((l) =>
        `- ${l.name} (${l.usageType ?? "?"}, ${l.area ?? "?"} m², Heizung: ${l.heatingType ?? "?"}, Abweichung Benchmark: ${l.benchmarkDeviation ?? "?"} %)`
      ).join("\n");
      return `${baseCtx}${avoidBlock}\nFolgende Liegenschaften zeigen Auffälligkeiten:\n${locs}\n\nErstelle pro Liegenschaft eine konkrete Maßnahmenempfehlung (1–2 Sätze) als <h3>Liegenschaftsname</h3><p>Empfehlung</p>. Keine Wiederholung allgemeiner Bericht-Boilerplate.`;
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as RequestBody;
    if (!body?.section || !body?.profile || !body?.context) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildPrompt(body) },
        ],
      }),
    });

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit erreicht. Bitte später erneut versuchen." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: "AI-Guthaben erschöpft. Bitte Workspace-Credits aufladen." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI gateway error:", resp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const html = data?.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ html }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-report-text error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
