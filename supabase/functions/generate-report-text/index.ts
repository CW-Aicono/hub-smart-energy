import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type TenantType = "kommune" | "gewerbe_industrie" | "privat" | "sonstige";

interface RequestBody {
  tenantType?: TenantType;
  section: string;
  // Kommune
  profile?: {
    code: string;
    name: string;
    legalBasis: string;
    reportingCycle: number;
    extraTopics: string[];
  };
  // Gewerbe / Sonstige
  framework?: {
    code: string;
    label: string;
    legalBasis: string;
    description: string;
  };
  context: Record<string, any>;
}

const SYSTEM_PROMPTS: Record<TenantType, string> = {
  kommune: `Du bist ein professioneller Redakteur für kommunale Energieberichte in Deutschland.
Schreibe in sachlichem, verwaltungsadäquatem Deutsch (Sie-Form), ohne Marketing-Floskeln.
Verwende konkrete Zahlen wenn vorhanden.
WICHTIG: Vermeide Wiederholungen. Jeder Abschnitt hat eine klar abgegrenzte Funktion.
Antworte ausschließlich mit gültigem semantischen HTML (z.B. <p>, <h3>, <ul>, <li>) – kein Markdown, kein <html>/<body>-Wrapper, KEINE Überschrift mit dem Abschnittsnamen.`,
  gewerbe_industrie: `Du bist Redakteur für Energie- und Nachhaltigkeitsberichte von Unternehmen (Gewerbe/Industrie) in Deutschland.
Schreibe sachlich, fachlich präzise, Sie-Form. Beziehe dich auf den gewählten Rechtsrahmen (EDL-G, EnEfG, CSRD/ESRS E1 oder ISO 50001) und nutze die übermittelten Kennzahlen (Endenergie, Scope 1/2, EnPI).
Antworte ausschließlich mit gültigem semantischen HTML – kein Markdown, kein Wrapper, KEINE Abschnittsüberschrift.`,
  privat: `Du bist Redakteur für persönliche Energieberichte für Privathaushalte.
Schreibe verständlich, freundlich, Sie-Form, ohne Fachjargon. Beziehe dich auf BDEW-Vergleichswerte und GEG-Orientierung sofern Daten vorliegen.
Antworte ausschließlich mit gültigem semantischen HTML – kein Markdown, kein Wrapper, KEINE Abschnittsüberschrift.`,
  sonstige: `Du bist Redakteur für freiwillige Energie- und Nachhaltigkeitsberichte von Vereinen, Stiftungen, Kirchen und vergleichbaren Organisationen.
Schreibe sachlich, motivierend, Sie-Form. Beziehe dich auf den gewählten Rahmen (DNK, EMASeasy oder freiwilliger Bericht) und auf die übermittelten Kennzahlen.
Antworte ausschließlich mit gültigem semantischen HTML – kein Markdown, kein Wrapper, KEINE Abschnittsüberschrift.`,
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function existingBlock(ctx: Record<string, any>, currentSection: string): string {
  const existing = ctx.existingSections ?? {};
  const keys = Object.keys(existing).filter((k) => k !== currentSection && existing[k]);
  if (keys.length === 0) return "";
  return (
    "\n" +
    keys
      .map((k) => `--- Bereits vorhanden "${k}" (NICHT wiederholen) ---\n${stripHtml(existing[k]).slice(0, 1200)}`)
      .join("\n\n") +
    "\nFormuliere deinen Abschnitt so, dass er sich inhaltlich deutlich von den oben aufgeführten Abschnitten unterscheidet.\n"
  );
}

function buildPromptKommune(body: RequestBody): string {
  const { section, profile, context } = body;
  const baseCtx = `
Bundesland: ${profile?.name} (${profile?.code})
Rechtliche Grundlage: ${profile?.legalBasis}
Berichtsturnus: alle ${profile?.reportingCycle} Jahre
Besondere Pflichten: ${profile?.extraTopics?.length ? profile.extraTopics.join("; ") : "keine"}
Kommune/Mandant: ${context.tenantName ?? "(unbenannt)"}
Berichtsjahr: ${context.reportYear}
Anzahl Liegenschaften: ${context.locationCount ?? "?"}
Gesamtfläche NGF: ${context.totalArea ?? "?"} m²
CO₂-Emissionen gesamt: ${context.totalCo2Tons ?? "?"} t/a
Energiekosten gesamt: ${context.totalCostEur ?? "?"} €
`;
  const avoid = existingBlock(context, section);
  switch (section) {
    case "vorwort":
      return `${baseCtx}${avoid}\nSchreibe ein 2 Absätze langes Vorwort der Verwaltungsspitze. Tonalität: persönlich-politisch, motivierend.`;
    case "einleitung":
      return `${baseCtx}${avoid}\nSchreibe eine 3 Absätze lange Einleitung: Zweck, methodisches Vorgehen, Aufbau des Berichts.`;
    case "ausblick":
      return `${baseCtx}${avoid}\nSchreibe einen Ausblick (2–3 Absätze) mit konkreten nächsten Schritten.`;
    default:
      return `${baseCtx}${avoid}\nSchreibe einen passenden Abschnitt zu "${section}".`;
  }
}

function buildPromptGewerbe(body: RequestBody): string {
  const { section, framework, context } = body;
  const baseCtx = `
Rechtsrahmen: ${framework?.label} (${framework?.code})
Rechtsgrundlage: ${framework?.legalBasis}
Unternehmen/Mandant: ${context.tenantName ?? "(unbenannt)"}
Berichtsjahr: ${context.reportYear}
Anzahl Standorte: ${context.locationCount ?? "?"}
Gesamtfläche NGF: ${context.totalArea ?? "?"} m²
Endenergie gesamt: ${context.totalKwh ?? "?"} kWh
Scope 1 (direkt): ${context.scope1Co2Tons ?? "?"} t CO₂
Scope 2 (Strom/Wärme): ${context.scope2Co2Tons ?? "?"} t CO₂
Energiekosten gesamt: ${context.totalCostEur ?? "?"} €
Produktion: ${context.productionVolume ?? "–"} ${context.productionUnit ?? ""}
Jahresumsatz: ${context.revenueEur ?? "–"} €
`;
  const avoid = existingBlock(context, section);
  switch (section) {
    case "executive_summary":
      return `${baseCtx}${avoid}\nSchreibe eine Executive Summary (2 Absätze): wichtigste Kennzahlen, Trend, Handlungsbedarf.`;
    case "methodik_audit":
      return `${baseCtx}${avoid}\nBeschreibe Methodik und Bilanzraum (2–3 Absätze): Systemgrenzen, Datenquellen, Emissionsfaktoren, marktbasiert vs. standortbasiert (sofern relevant).`;
    case "massnahmen_roi":
      return `${baseCtx}${avoid}\nSchreibe 2 Absätze zu Maßnahmenpriorisierung und Wirtschaftlichkeit (Amortisation, ROI, EnPI-Wirkung).`;
    case "ausblick_dekarbonisierung":
      return `${baseCtx}${avoid}\nSchreibe einen Dekarbonisierungsausblick (2–3 Absätze): Pfade, Ziele, nächste Schritte gemäß ${framework?.code}.`;
    default:
      return `${baseCtx}${avoid}\nSchreibe einen passenden Abschnitt zu "${section}".`;
  }
}

function buildPromptPrivat(body: RequestBody): string {
  const { section, context } = body;
  const baseCtx = `
Berichtsjahr: ${context.reportYear}
Haushaltsgröße: ${context.persons ?? "?"} Personen
Wohnfläche: ${context.livingArea ?? "?"} m²
Baujahr: ${context.constructionYear ?? "–"}
Heizungsart: ${context.heatingType ?? "–"}
Stromverbrauch: ${context.electricityKwh ?? 0} kWh (BDEW-Ø: ${context.bdewMin}–${context.bdewMax} kWh, Mittel ${context.bdewAvg})
Wärmeverbrauch: ${context.heatingKwh ?? 0} kWh (${context.heatingPerM2 ?? "?"} kWh/m²a)
CO₂-Fußabdruck: ${context.totalCo2Kg ?? "?"} kg
Energiekosten: ${context.totalCostEur ?? "?"} €
`;
  const avoid = existingBlock(context, section);
  switch (section) {
    case "zusammenfassung":
      return `${baseCtx}${avoid}\nSchreibe eine kurze, freundliche Zusammenfassung (2 Absätze).`;
    case "vergleich_durchschnitt":
      return `${baseCtx}${avoid}\nVergleiche den Haushalt mit dem BDEW-Durchschnitt und gib eine kurze Bewertung (2 Absätze).`;
    case "spartipps":
      return `${baseCtx}${avoid}\nGib 5 konkrete Spartipps als <ul><li>…</li></ul>, passend zu Verbrauch und Heizungsart.`;
    default:
      return `${baseCtx}${avoid}\nSchreibe einen passenden Abschnitt zu "${section}".`;
  }
}

function buildPromptSonstige(body: RequestBody): string {
  const { section, framework, context } = body;
  const baseCtx = `
Berichtsrahmen: ${framework?.label} (${framework?.code})
Grundlage: ${framework?.legalBasis}
Organisation: ${context.tenantName ?? "(unbenannt)"}
Berichtsjahr: ${context.reportYear}
Anzahl Objekte: ${context.locationCount ?? "?"}
Endenergie gesamt: ${context.totalKwh ?? "?"} kWh
CO₂ gesamt (Scope 1+2): ${context.totalCo2Tons ?? "?"} t
Energiekosten: ${context.totalCostEur ?? "?"} €
`;
  const avoid = existingBlock(context, section);
  switch (section) {
    case "vorwort":
      return `${baseCtx}${avoid}\nSchreibe ein 2 Absätze langes Vorwort der Leitung. Motivierend, werteorientiert.`;
    case "nachhaltigkeitskontext":
      return `${baseCtx}${avoid}\nSchreibe 2 Absätze zum Nachhaltigkeitskontext und zur Einordnung in ${framework?.code}.`;
    case "massnahmen":
      return `${baseCtx}${avoid}\nSchreibe 2 Absätze zu umgesetzten und geplanten Maßnahmen.`;
    case "ausblick":
      return `${baseCtx}${avoid}\nSchreibe einen Ausblick (2 Absätze) mit Zielen und nächsten Schritten.`;
    default:
      return `${baseCtx}${avoid}\nSchreibe einen passenden Abschnitt zu "${section}".`;
  }
}

function buildPrompt(body: RequestBody): string {
  const tt = body.tenantType ?? "kommune";
  switch (tt) {
    case "gewerbe_industrie":
      return buildPromptGewerbe(body);
    case "privat":
      return buildPromptPrivat(body);
    case "sonstige":
      return buildPromptSonstige(body);
    case "kommune":
    default:
      return buildPromptKommune(body);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as RequestBody;
    if (!body?.section || !body?.context) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const tt: TenantType = body.tenantType ?? "kommune";

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPTS[tt] },
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
