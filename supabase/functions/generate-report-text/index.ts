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
Verwende konkrete Zahlen wenn vorhanden. Erwähne immer die jeweilige landesrechtliche Grundlage.
Antworte ausschließlich mit gültigem semantischen HTML (z.B. <p>, <h3>, <ul>, <li>) – kein Markdown, kein <html>/<body>-Wrapper.`;

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

  switch (section) {
    case "vorwort":
      return `${baseCtx}\nSchreibe ein 2–3 Absätze langes Vorwort der Verwaltungsspitze${context.mayorName ? ` (${context.mayorName})` : ""}. Bezug auf Klimaziele und Verantwortung der Kommune.`;
    case "einleitung":
      return `${baseCtx}\nSchreibe eine 3–4 Absätze lange Einleitung zum Energiebericht. Erkläre Zweck, methodisches Vorgehen (Witterungsbereinigung, Benchmark-Vergleich nach BMWi/BMUB 2015) und Bezug zur landesrechtlichen Grundlage.`;
    case "ausblick":
      return `${baseCtx}\nSchreibe einen Ausblick (2–3 Absätze) mit konkreten nächsten Schritten: priorisierte Sanierungen, erneuerbare Wärme, PV-Ausbau. Berücksichtige die landesspezifischen Pflichten.`;
    case "massnahmen": {
      const locs = (context.locations ?? []).slice(0, 10).map((l) =>
        `- ${l.name} (${l.usageType ?? "?"}, ${l.area ?? "?"} m², Heizung: ${l.heatingType ?? "?"}, Abweichung Benchmark: ${l.benchmarkDeviation ?? "?"} %)`
      ).join("\n");
      return `${baseCtx}\nFolgende Liegenschaften zeigen Auffälligkeiten:\n${locs}\n\nErstelle pro Liegenschaft eine konkrete Maßnahmenempfehlung (1–2 Sätze) als <h3>Liegenschaftsname</h3><p>Empfehlung</p>.`;
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
