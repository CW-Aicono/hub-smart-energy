import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonOk(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function jsonError(message: string, status = 500, detail?: string) {
  return new Response(JSON.stringify({ error: message, detail }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function resolveAuth(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) throw { status: 401, message: "Nicht authentifiziert" };
  const token = authHeader.replace("Bearer ", "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authClient = createClient(supabaseUrl, supabaseKey);
  const { data: claimsData, error: claimsError } = await authClient.auth.getUser(token);
  if (claimsError || !claimsData?.user) throw { status: 401, message: "Nicht authentifiziert", detail: claimsError?.message };
  const userId = claimsData.user.id;
  const db = createClient(supabaseUrl, serviceKey);
  const { data: profile } = await db.from("profiles").select("tenant_id").eq("user_id", userId).single();
  if (!profile?.tenant_id) throw { status: 403, message: "Kein Mandant zugeordnet" };
  return { userId, tenantId: profile.tenant_id, db };
}

// ─── Datenkontext für die KI sammeln ──────────────────────────────────────
async function gatherContext(db: any, tenantId: string, locationId: string | null, periodStart: string, periodEnd: string) {
  // Standorte (mit optionalem Filter)
  let locQuery = db.from("locations").select("id, name, building_type, area_m2, address_city").eq("tenant_id", tenantId);
  if (locationId) locQuery = locQuery.eq("id", locationId);
  const { data: locationsData } = await locQuery;
  const locations = locationsData ?? [];

  const locationIds = locations.map((l: any) => l.id);

  // Tages-Aggregate pro Standort/Meter (Stromverbrauch, PV, Einspeisung)
  let dailyAgg: any[] = [];
  if (locationIds.length > 0) {
    const { data } = await db.rpc("get_meter_daily_totals_for_locations" as any, {
      p_location_ids: locationIds,
      p_start: periodStart,
      p_end: periodEnd,
    }).select?.() ?? { data: null };

    // Fallback wenn RPC nicht existiert: 5min Aggregat lesen
    if (!data) {
      const { data: readings = [] } = await db
        .from("meter_power_readings_5min")
        .select("meter_id, ts_5min, power_kw, energy_kwh")
        .gte("ts_5min", periodStart)
        .lte("ts_5min", periodEnd + "T23:59:59")
        .limit(20000);
      // Aggregiere pro Tag/Meter
      const map = new Map<string, { meter_id: string; day: string; energy_kwh: number; peak_kw: number }>();
      for (const r of readings) {
        const day = (r.ts_5min as string).slice(0, 10);
        const key = `${r.meter_id}|${day}`;
        const cur = map.get(key) ?? { meter_id: r.meter_id, day, energy_kwh: 0, peak_kw: 0 };
        cur.energy_kwh += Number(r.energy_kwh || 0);
        cur.peak_kw = Math.max(cur.peak_kw, Number(r.power_kw || 0));
        map.set(key, cur);
      }
      dailyAgg = Array.from(map.values());
    } else {
      dailyAgg = data;
    }
  }

  // Meter-Liste für Kontext
  const { data: meters = [] } = await db
    .from("meters")
    .select("id, name, location_id, meter_type, direction, energy_type")
    .eq("tenant_id", tenantId)
    .in("location_id", locationIds.length ? locationIds : ["00000000-0000-0000-0000-000000000000"]);

  // PV-Ist
  const { data: pvActual = [] } = await db
    .from("pv_actual_hourly")
    .select("location_id, ts_hour, energy_kwh")
    .in("location_id", locationIds.length ? locationIds : ["00000000-0000-0000-0000-000000000000"])
    .gte("ts_hour", periodStart)
    .lte("ts_hour", periodEnd + "T23:59:59")
    .limit(10000);

  // Wallbox-Sessions
  const { data: chargingSessions = [] } = await db
    .from("charging_sessions")
    .select("id, charge_point_id, energy_kwh, started_at, stopped_at, status")
    .eq("tenant_id", tenantId)
    .gte("started_at", periodStart)
    .lte("started_at", periodEnd + "T23:59:59")
    .limit(2000);

  return {
    period: { start: periodStart, end: periodEnd },
    locations,
    meters,
    daily_meter_totals: dailyAgg.slice(0, 5000),
    pv_actual_hourly: pvActual.slice(0, 5000),
    charging_sessions: chargingSessions,
  };
}

// ─── AI-Call mit strukturiertem Schema ────────────────────────────────────
async function callAI(prompt: string, context: any) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw { status: 500, message: "KI nicht konfiguriert" };

  const systemPrompt = `Du bist der Analytics-Assistent eines deutschen Energie-Management-Systems (AICONO EMS).
Du erhältst aggregierte Mess- und Anlagendaten eines Mandanten und beantwortest die Frage des Nutzers mit einer strukturierten Analyse:
- Knapper, sprechender Titel auf Deutsch
- 1–3 aussagekräftige KPIs (deutsche Einheiten, z.B. kWh, MWh, %, €, kg CO₂)
- Genau EIN passender Chart (bar / line / pie / table)
- 3–5 Sätze "insight_markdown" mit klarer Handlungsempfehlung
- Liste der verwendeten Datenquellen

WICHTIG:
- Verwende ausschließlich die übergebenen Daten. Erfinde nichts.
- Wenn die Daten nicht ausreichen, schreibe das ehrlich in "insight_markdown" und gib ein leeres KPI-/Chart-Array zurück.
- Zahlen IMMER im deutschen Format denken (Punkt = Tausender, Komma = Dezimal) – die Formatierung übernimmt das Frontend.
- Chart-Daten so liefern, dass sie 1:1 in Recharts gerendert werden können.`;

  const tools = [{
    type: "function",
    function: {
      name: "deliver_analytics",
      description: "Strukturierte Analytics-Antwort",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          kpis: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                value: { type: "number" },
                unit: { type: "string" },
              },
              required: ["label", "value", "unit"],
            },
          },
          chart: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["bar", "line", "pie", "table"] },
              x_label: { type: "string" },
              y_label: { type: "string" },
              series: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          x: { type: "string" },
                          y: { type: "number" },
                        },
                        required: ["x", "y"],
                      },
                    },
                  },
                  required: ["name", "data"],
                },
              },
            },
            required: ["type", "x_label", "y_label", "series"],
          },
          insight_markdown: { type: "string" },
          sources: { type: "array", items: { type: "string" } },
        },
        required: ["title", "kpis", "chart", "insight_markdown", "sources"],
      },
    },
  }];

  const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Frage: ${prompt}\n\nDaten-Kontext (JSON):\n${JSON.stringify(context).slice(0, 120000)}` },
      ],
      tools,
      tool_choice: { type: "function", function: { name: "deliver_analytics" } },
    }),
  });

  if (!aiResponse.ok) {
    const text = await aiResponse.text();
    console.error("AI Gateway error:", aiResponse.status, text);
    if (aiResponse.status === 429) throw { status: 429, message: "KI-Rate-Limit erreicht", detail: "Bitte in einer Minute erneut versuchen." };
    if (aiResponse.status === 402) throw { status: 402, message: "KI-Credits aufgebraucht", detail: "Bitte Credits aufladen." };
    throw { status: 500, message: "KI-Analyse fehlgeschlagen", detail: text };
  }

  const aiResult = await aiResponse.json();
  const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) throw { status: 500, message: "KI hat keine strukturierte Antwort geliefert" };
  return JSON.parse(toolCall.function.arguments);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { userId, tenantId, db } = await resolveAuth(req);
    const body = await req.json().catch(() => ({}));
    const prompt: string = (body.prompt ?? "").toString().trim();
    if (!prompt || prompt.length < 3) return jsonError("Bitte eine Frage eingeben", 400);
    if (prompt.length > 1000) return jsonError("Frage zu lang (max. 1000 Zeichen)", 400);

    const locationId: string | null = body.location_id || null;
    const today = new Date();
    const periodEnd = (body.period_end || today.toISOString().slice(0, 10)) as string;
    const defaultStart = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    const periodStart = (body.period_start || defaultStart) as string;

    const context = await gatherContext(db, tenantId, locationId, periodStart, periodEnd);
    const result = await callAI(prompt, context);

    const { data: inserted, error: insertError } = await db
      .from("copilot_analytics_queries")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        title: result.title || prompt.slice(0, 80),
        prompt,
        location_id: locationId,
        period_start: periodStart,
        period_end: periodEnd,
        result_json: result,
        model_used: "google/gemini-2.5-flash",
        status: "completed",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return jsonError("Analyse konnte nicht gespeichert werden", 500, insertError.message);
    }

    return jsonOk({ query: inserted });
  } catch (err: any) {
    console.error("copilot-analytics error:", err);
    const status = typeof err?.status === "number" ? err.status : 500;
    return jsonError(err?.message ?? "Unerwarteter Fehler", status, err?.detail);
  }
});
