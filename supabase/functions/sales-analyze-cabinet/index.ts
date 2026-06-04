import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Suggestion {
  bezeichnung: string;
  energieart: string;
  phasen: number;
  strombereich_a: number;
  anwendungsfall: string;
  montage: string;
  hinweise?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { distribution_id, image_path } = await req.json();
    if (!distribution_id || !image_path) {
      return new Response(
        JSON.stringify({ error: "distribution_id and image_path required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Signed URL aus privatem Bucket
    const { data: signed, error: signErr } = await supabase.storage
      .from("sales-photos")
      .createSignedUrl(image_path, 300);
    if (signErr || !signed) {
      return new Response(
        JSON.stringify({ error: "Cannot read image: " + signErr?.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Bild laden + base64
    const imgRes = await fetch(signed.signedUrl);
    if (!imgRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch image" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    const buf = await imgRes.arrayBuffer();
    const b64 = btoa(
      new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), "")
    );
    const mime = imgRes.headers.get("content-type") || "image/jpeg";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `Du bist ein Experte für elektrische Verteilungen und Energiemessung in Deutschland. Du analysierst Fotos von Schaltschränken, NSHV und UV. Erkenne: Anzahl Sicherungsabgänge, Phasen (1- oder 3-phasig), vermutete Strombereiche, freie Hutschienen-Plätze, Hauptzähler-Position. Schlage konkrete Messpunkte vor, die für ein Energie-Monitoring sinnvoll wären (Hauptzähler, große Abgänge, Maschinen, PV, Wallbox etc.). Antworte AUSSCHLIESSLICH mit gültigem JSON, ohne Markdown-Codeblöcke, ohne Erklärtext drumherum.`;

    const userPrompt = `Analysiere dieses Schaltschrank-Foto und schlage 1–8 sinnvolle Messpunkte vor.

Antworte nur mit JSON in genau diesem Schema:
{
  "zusammenfassung": "kurzer Text zur Verteilung",
  "erkannte_sicherungen": 0,
  "freie_hutschienen_plaetze": 0,
  "vorschlaege": [
    {
      "bezeichnung": "kurz, sprechend",
      "energieart": "electricity",
      "phasen": 1,
      "strombereich_a": 16,
      "anwendungsfall": "Hauptzähler",
      "montage": "Hutschiene",
      "hinweise": "optional, kann leer sein"
    }
  ]
}

Erlaubte Werte:
- energieart: "electricity" | "heat" | "gas" | "water"
- phasen: 1 oder 3
- strombereich_a: 16, 25, 32, 63, 125 oder 250
- anwendungsfall: "Hauptzähler" | "Abgang" | "Maschine" | "PV" | "Speicher" | "Wallbox" | "Wärmepumpe" | "Sonstiges"
- montage: "Hutschiene" | "Wandlermessung" | "Sammelschiene" | "Steckdose"`;

    const aiRes = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: userPrompt },
                {
                  type: "image_url",
                  image_url: { url: `data:${mime};base64,${b64}` },
                },
              ],
            },
          ],
          response_format: { type: "json_object" },
        }),
      }
    );

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate-Limit erreicht. Bitte gleich erneut versuchen." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI-Guthaben aufgebraucht. Bitte Workspace-Credits aufladen." }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      const t = await aiRes.text();
      console.error("AI error:", aiRes.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error", detail: t }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const rawContent: string | undefined = aiJson.choices?.[0]?.message?.content;
    if (!rawContent) {
      return new Response(
        JSON.stringify({ error: "AI returned no result" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    const cleaned = rawContent.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("JSON parse error:", e, rawContent);
      return new Response(
        JSON.stringify({ error: "AI returned invalid JSON" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Speichere KI-Analyse zurück in Verteilung
    await supabase
      .from("sales_distributions")
      .update({
        foto_url: image_path,
        ki_analyse: parsed,
      })
      .eq("id", distribution_id);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sales-analyze-cabinet error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
