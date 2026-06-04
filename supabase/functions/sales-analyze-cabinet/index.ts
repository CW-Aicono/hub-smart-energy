import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MODEL = "google/gemini-2.5-pro";
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function callAI(
  apiKey: string,
  messages: any[],
): Promise<{ ok: true; data: any } | { ok: false; status: number; detail: string }> {
  const res = await fetch(AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    return { ok: false, status: res.status, detail };
  }
  const aiJson = await res.json();
  const raw: string | undefined = aiJson.choices?.[0]?.message?.content;
  if (!raw) return { ok: false, status: 500, detail: "empty content" };
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  try {
    return { ok: true, data: JSON.parse(cleaned) };
  } catch (e) {
    console.error("JSON parse error:", e, raw);
    return { ok: false, status: 500, detail: "invalid JSON from AI" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResp({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes.user) return jsonResp({ error: "Unauthorized" }, 401);

    const { distribution_id, image_path } = await req.json();
    if (!distribution_id || !image_path) {
      return jsonResp({ error: "distribution_id and image_path required" }, 400);
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from("sales-photos")
      .createSignedUrl(image_path, 300);
    if (signErr || !signed) {
      return jsonResp({ error: "Cannot read image: " + signErr?.message }, 400);
    }

    const imgRes = await fetch(signed.signedUrl);
    if (!imgRes.ok) return jsonResp({ error: "Failed to fetch image" }, 500);
    const buf = await imgRes.arrayBuffer();
    const b64 = btoa(
      new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""),
    );
    const mime = imgRes.headers.get("content-type") || "image/jpeg";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // =============== PASS 1: reine Beobachtung ===============
    const pass1System = `Du bist eine erfahrene Elektrofachkraft in Deutschland und analysierst Fotos von Unterverteilungen (UV) und Niederspannungs-Hauptverteilungen (NSHV).
DEINE EINZIGE AUFGABE: Zählen und Beschreiben, was im Bild EINDEUTIG sichtbar ist.
HARTE REGELN:
- Du erfindest NICHTS. Wenn etwas nicht eindeutig erkennbar ist, schreibe null oder lasse das Array leer und liste den Punkt in "nicht_eindeutig_erkennbar".
- Du schlägst KEINE Messpunkte vor. Du gibst KEINE Empfehlungen. Nur Beobachtung.
- Zähle Leitungsschutzschalter (LS/Sicherungen) pro Reihe und summiere genau.
- FI/RCDs sind breiter als LS und tragen einen Test-Knopf "T" und meist Beschriftungen wie "30 mA".
- Antworte AUSSCHLIESSLICH mit gültigem JSON, ohne Markdown, ohne Erklärtext.`;

    const pass1User = `Analysiere das Foto und antworte mit JSON exakt in diesem Schema:
{
  "bildqualitaet": "gut" | "mittel" | "schlecht",
  "anzahl_reihen": number,
  "fi_schutzschalter": [ { "polig": 2 | 4, "nennstrom_a": number | null, "ausloesestrom_ma": number | null } ],
  "leitungsschutzschalter": [ { "polig": 1 | 3, "charakteristik": "B" | "C" | null, "nennstrom_a": number | null, "anzahl": number } ],
  "n_schienen": number,
  "pe_schienen": number,
  "klemmen_bloecke": number,
  "freie_te_plaetze": number | null,
  "zuleitung": { "phasen": 1 | 3 | null, "von_oben_oder_unten": "oben" | "unten" | null },
  "bereits_verbaute_zaehler": [ { "typ": string, "beschriftung": string | null } ],
  "beschriftungen_sichtbar": [ string ],
  "nicht_eindeutig_erkennbar": [ string ]
}`;

    const pass1 = await callAI(LOVABLE_API_KEY, [
      { role: "system", content: pass1System },
      {
        role: "user",
        content: [
          { type: "text", text: pass1User },
          { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
        ],
      },
    ]);

    if (!pass1.ok) {
      if (pass1.status === 429) return jsonResp({ error: "Rate-Limit erreicht. Bitte gleich erneut versuchen." }, 429);
      if (pass1.status === 402) return jsonResp({ error: "AI-Guthaben aufgebraucht. Bitte Workspace-Credits aufladen." }, 402);
      console.error("Pass 1 failed:", pass1.status, pass1.detail);
      return jsonResp({ error: "AI gateway error (pass 1)", detail: pass1.detail }, 500);
    }

    const observ = pass1.data;

    // Serverseitige Zählungen (Quelle der Wahrheit)
    const erkannte_sicherungen = Array.isArray(observ?.leitungsschutzschalter)
      ? observ.leitungsschutzschalter.reduce((sum: number, g: any) => sum + (Number(g?.anzahl) || 0), 0)
      : 0;
    const freie_hutschienen_plaetze = Number(observ?.freie_te_plaetze) || 0;
    const fi_count = Array.isArray(observ?.fi_schutzschalter) ? observ.fi_schutzschalter.length : 0;
    const beschriftungen: string[] = Array.isArray(observ?.beschriftungen_sichtbar) ? observ.beschriftungen_sichtbar : [];
    const beschriftungen_joined = beschriftungen.join(" | ").toLowerCase();

    // =============== PASS 2: Vorschläge ===============
    const pass2System = `Du bist Energie-Monitoring-Planer. Du bekommst eine strukturierte BEOBACHTUNG einer Unterverteilung (KEIN Bild).
HARTE REGELN:
- Du darfst KEINE Verbraucher erfinden. PV, Wallbox, Wärmepumpe, Speicher oder Maschine darfst du NUR vorschlagen, wenn ein eindeutiger Hinweis in "beschriftungen_sichtbar" steht.
- Wenn keine spezifischen Beschriftungen vorhanden sind, verwende neutrale Bezeichnungen wie "Abgangsgruppe FI 1", "Hauptzähler" oder anwendungsfall "Abgang" / "Sonstiges".
- Maximal 4 Vorschläge.
- Empfehle pro FI-Gruppe höchstens 1 neutralen Gruppen-Vorschlag.
- Wenn Zuleitung 3-phasig ist, ist ein "Hauptzähler" (Wandlermessung) ein sinnvoller erster Vorschlag.
- Setze "sicherheit": "hoch" nur, wenn die Beobachtung den Vorschlag direkt stützt; sonst "mittel" oder "niedrig".
- Antworte AUSSCHLIESSLICH mit gültigem JSON, ohne Markdown.`;

    const pass2User = `BEOBACHTUNG (aus Pass 1):
${JSON.stringify(observ, null, 2)}

Erstelle JSON in diesem Schema:
{
  "zusammenfassung": "1–3 Sätze, was tatsächlich beobachtet wurde",
  "vorschlaege": [
    {
      "bezeichnung": "kurz",
      "energieart": "electricity" | "heat" | "gas" | "water",
      "phasen": 1 | 3,
      "strombereich_a": 16 | 25 | 32 | 63 | 125 | 250,
      "anwendungsfall": "Hauptzähler" | "Abgang" | "Maschine" | "PV" | "Speicher" | "Wallbox" | "Wärmepumpe" | "Sonstiges",
      "montage": "Hutschiene" | "Wandlermessung" | "Sammelschiene" | "Steckdose",
      "hinweise": "optional, kann leer sein",
      "sicherheit": "hoch" | "mittel" | "niedrig"
    }
  ]
}`;

    let zusammenfassung = `Beobachtet: ${fi_count} FI/RCD, ${erkannte_sicherungen} Leitungsschutzschalter, ${freie_hutschienen_plaetze} freie TE-Plätze.`;
    let vorschlaege: any[] = [];
    const unsicherheiten: string[] = Array.isArray(observ?.nicht_eindeutig_erkennbar) ? observ.nicht_eindeutig_erkennbar : [];

    const pass2 = await callAI(LOVABLE_API_KEY, [
      { role: "system", content: pass2System },
      { role: "user", content: pass2User },
    ]);

    if (pass2.ok) {
      if (typeof pass2.data?.zusammenfassung === "string") zusammenfassung = pass2.data.zusammenfassung;
      if (Array.isArray(pass2.data?.vorschlaege)) {
        // Plausibilitäts-Filter: erfundene Spezial-Verbraucher entfernen
        const forbiddenWhenUnlabeled = new Set(["PV", "Wallbox", "Wärmepumpe", "Speicher", "Maschine"]);
        const hints = {
          pv: /\b(pv|photovoltaik|wechselrichter|inverter)\b/.test(beschriftungen_joined),
          wallbox: /\b(wallbox|ladestation|ladepunkt|emobil|e-?auto)\b/.test(beschriftungen_joined),
          wp: /\b(wp|wärmepumpe|waermepumpe|heatpump)\b/.test(beschriftungen_joined),
          speicher: /\b(speicher|batterie|battery|akku)\b/.test(beschriftungen_joined),
          maschine: /\b(maschine|cnc|kompressor|werkstatt)\b/.test(beschriftungen_joined),
        };
        vorschlaege = pass2.data.vorschlaege
          .filter((v: any) => {
            const a = v?.anwendungsfall;
            if (!forbiddenWhenUnlabeled.has(a)) return true;
            if (a === "PV" && hints.pv) return true;
            if (a === "Wallbox" && hints.wallbox) return true;
            if (a === "Wärmepumpe" && hints.wp) return true;
            if (a === "Speicher" && hints.speicher) return true;
            if (a === "Maschine" && hints.maschine) return true;
            return false;
          })
          .slice(0, 4);
      }
    } else {
      console.error("Pass 2 failed (non-fatal):", pass2.status, pass2.detail);
      unsicherheiten.push("Vorschlagsgenerierung fehlgeschlagen – nur Beobachtung verfügbar.");
    }

    const result = {
      zusammenfassung,
      erkannte_sicherungen,
      freie_hutschienen_plaetze,
      bildqualitaet: observ?.bildqualitaet ?? null,
      erkannte_komponenten: observ,
      unsicherheiten,
      vorschlaege,
    };

    await supabase
      .from("sales_distributions")
      .update({ foto_url: image_path, ki_analyse: result })
      .eq("id", distribution_id);

    return jsonResp(result);
  } catch (e) {
    console.error("sales-analyze-cabinet error:", e);
    return jsonResp({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
