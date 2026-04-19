import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface MeasurementPoint {
  id: string;
  bezeichnung: string;
  energieart: string;
  phasen: number;
  strombereich_a: number | null;
  anwendungsfall: string | null;
  montage: string | null;
  bestand: boolean;
}

interface DeviceCatalogItem {
  id: string;
  hersteller: string;
  modell: string;
  vk_preis: number;
  installations_pauschale: number;
  kompatibilitaet: Record<string, unknown>;
  beschreibung: string | null;
}

interface Rule {
  id: string;
  name: string;
  prio: number;
  bedingung: Record<string, unknown>;
  device_catalog_id: string;
}

function matchesRule(point: MeasurementPoint, cond: Record<string, unknown>): boolean {
  // bedingung is JSON like:
  // { energieart: "electricity", phasen: 3, max_strom_a: 63, montage: ["Hutschiene"], anwendungsfall: ["Abgang","Maschine"] }
  if (cond.energieart && cond.energieart !== point.energieart) return false;
  if (cond.phasen !== undefined && cond.phasen !== point.phasen) return false;
  if (
    cond.max_strom_a !== undefined &&
    point.strombereich_a !== null &&
    point.strombereich_a > Number(cond.max_strom_a)
  )
    return false;
  if (
    cond.min_strom_a !== undefined &&
    point.strombereich_a !== null &&
    point.strombereich_a < Number(cond.min_strom_a)
  )
    return false;
  if (cond.montage && Array.isArray(cond.montage)) {
    if (!point.montage || !(cond.montage as string[]).includes(point.montage))
      return false;
  }
  if (cond.anwendungsfall && Array.isArray(cond.anwendungsfall)) {
    if (
      !point.anwendungsfall ||
      !(cond.anwendungsfall as string[]).includes(point.anwendungsfall)
    )
      return false;
  }
  return true;
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

    const { measurement_point_id, replace } = await req.json();
    if (!measurement_point_id) {
      return new Response(
        JSON.stringify({ error: "measurement_point_id required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Lade Messpunkt
    const { data: point, error: pErr } = await supabase
      .from("sales_measurement_points")
      .select("id, bezeichnung, energieart, phasen, strombereich_a, anwendungsfall, montage, bestand")
      .eq("id", measurement_point_id)
      .maybeSingle();
    if (pErr || !point) {
      return new Response(
        JSON.stringify({ error: "Measurement point not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Lade aktive Regeln (sortiert nach Prio)
    const { data: rules } = await supabase
      .from("device_selection_rules")
      .select("id, name, prio, bedingung, device_catalog_id")
      .eq("is_active", true)
      .order("prio", { ascending: false });

    let chosenDeviceId: string | null = null;
    let begruendung = "";
    let source = "rule";
    let matchedRule: Rule | null = null;

    for (const rule of (rules ?? []) as Rule[]) {
      if (matchesRule(point as MeasurementPoint, rule.bedingung)) {
        chosenDeviceId = rule.device_catalog_id;
        matchedRule = rule;
        break;
      }
    }

    if (chosenDeviceId && matchedRule) {
      const { data: dev } = await supabase
        .from("device_catalog")
        .select("hersteller, modell")
        .eq("id", chosenDeviceId)
        .maybeSingle();
      begruendung = `Regel "${matchedRule.name}" (Prio ${matchedRule.prio}) → ${dev?.hersteller ?? ""} ${dev?.modell ?? ""}`;
    } else {
      // KI-Fallback: lade aktiven Katalog und frage Gemini
      const { data: catalog } = await supabase
        .from("device_catalog")
        .select("id, hersteller, modell, vk_preis, installations_pauschale, kompatibilitaet, beschreibung")
        .eq("is_active", true);

      if (!catalog || catalog.length === 0) {
        return new Response(
          JSON.stringify({
            error: "Kein Gerät im Katalog verfügbar. Bitte Geräte-Katalog im Super-Admin pflegen.",
          }),
          {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

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
              {
                role: "system",
                content:
                  "Du wählst aus einem vorgegebenen Geräte-Katalog das technisch passendste Messgerät für einen Messpunkt aus. Beachte Phasen, Strombereich, Montageart und Anwendungsfall. Wähle nur eine ID aus dem Katalog.",
              },
              {
                role: "user",
                content:
                  `Messpunkt: ${JSON.stringify(point)}\n\nVerfügbarer Katalog:\n${JSON.stringify(catalog)}\n\nWähle die beste device_catalog_id und begründe kurz.`,
              },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "waehle_geraet",
                  description: "Wähle ein Gerät aus dem Katalog",
                  parameters: {
                    type: "object",
                    properties: {
                      device_catalog_id: { type: "string" },
                      begruendung: { type: "string" },
                    },
                    required: ["device_catalog_id", "begruendung"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: {
              type: "function",
              function: { name: "waehle_geraet" },
            },
          }),
        }
      );

      if (!aiRes.ok) {
        if (aiRes.status === 429 || aiRes.status === 402) {
          return new Response(
            JSON.stringify({
              error:
                aiRes.status === 429
                  ? "Rate-Limit erreicht."
                  : "AI-Guthaben aufgebraucht.",
            }),
            {
              status: aiRes.status,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        const t = await aiRes.text();
        console.error("AI error:", aiRes.status, t);
        return new Response(JSON.stringify({ error: "AI gateway error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiJson = await aiRes.json();
      const tc = aiJson.choices?.[0]?.message?.tool_calls?.[0];
      if (!tc?.function?.arguments) {
        return new Response(
          JSON.stringify({ error: "AI returned no result" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      const parsed = JSON.parse(tc.function.arguments);
      // Validate ID is in catalog
      const exists = (catalog as DeviceCatalogItem[]).find(
        (d) => d.id === parsed.device_catalog_id
      );
      if (!exists) {
        return new Response(
          JSON.stringify({ error: "AI hat ungültige Geräte-ID gewählt" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      chosenDeviceId = parsed.device_catalog_id;
      begruendung = "KI: " + parsed.begruendung;
      source = "ai";
    }

    if (!chosenDeviceId) {
      return new Response(
        JSON.stringify({ error: "Kein passendes Gerät gefunden" }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Replace existing recommendation? (delete old non-override entries)
    if (replace) {
      await supabase
        .from("sales_recommended_devices")
        .delete()
        .eq("measurement_point_id", measurement_point_id)
        .eq("partner_override", false);
    }

    const { data: inserted, error: insErr } = await supabase
      .from("sales_recommended_devices")
      .insert({
        measurement_point_id,
        device_catalog_id: chosenDeviceId,
        begruendung,
        source,
        ist_alternativ: false,
        partner_override: false,
        menge: 1,
      })
      .select("id, device_catalog_id, begruendung, source")
      .single();

    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(inserted), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sales-recommend-devices error:", e);
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
