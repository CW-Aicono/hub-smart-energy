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
  let locQuery = db.from("locations").select("id, name, usage_type, net_floor_area, gross_floor_area, city").eq("tenant_id", tenantId);
  if (locationId) locQuery = locQuery.eq("id", locationId);
  const { data: locationsData, error: locationsError } = await locQuery;
  if (locationsError) throw { status: 500, message: "Standorte konnten nicht gelesen werden", detail: locationsError.message };
  const locations = locationsData ?? [];

  const locationIds = locations.map((l: any) => l.id);
  const locationById = new Map(locations.map((l: any) => [l.id, l]));
  const safeLocIds = locationIds.length ? locationIds : ["00000000-0000-0000-0000-000000000000"];

  const { data: metersData, error: metersError } = await db
    .from("meters")
    .select("id, name, location_id, meter_function, is_main_meter, energy_type")
    .eq("tenant_id", tenantId)
    .in("location_id", safeLocIds);
  if (metersError) throw { status: 500, message: "Zählerdaten konnten nicht gelesen werden", detail: metersError.message };

  const meters = metersData ?? [];
  const meterIds = meters.map((m: any) => m.id);
  const safeMeterIds = meterIds.length ? meterIds : ["00000000-0000-0000-0000-000000000000"];
  const meterById = new Map(meters.map((m: any) => [m.id, m]));

  // Read from pre-aggregated daily totals (fast: 1 row per meter per day)
  const { data: dailyTotalsData, error: dailyTotalsError } = await db
    .from("meter_daily_totals_mv")
    .select("meter_id, bucket_start, consumption_kwh, export_kwh, energy_type, coverage_ratio, source")
    .eq("tenant_id", tenantId)
    .in("meter_id", safeMeterIds)
    .gte("bucket_start", periodStart)
    .lte("bucket_start", periodEnd)
    .limit(20000);
  if (dailyTotalsError) throw { status: 500, message: "Tageswerte konnten nicht gelesen werden", detail: dailyTotalsError.message };

  const daily_meter_totals = (dailyTotalsData ?? []).map((r: any) => {
    const meter = meterById.get(r.meter_id) as any;
    const location = meter ? locationById.get(meter.location_id) as any : null;
    const bezug = Number(r.consumption_kwh || 0);
    const einspeisung = Number(r.export_kwh || 0);
    return {
      day: r.bucket_start,
      meter_id: r.meter_id,
      meter_name: meter?.name ?? "Unbekannter Zähler",
      location_id: meter?.location_id ?? null,
      location_name: location?.name ?? "Ohne Standort",
      energy_type: r.energy_type ?? meter?.energy_type ?? "unbekannt",
      meter_function: meter?.meter_function ?? "unbekannt",
      is_main_meter: Boolean(meter?.is_main_meter),
      total_kwh: bezug - einspeisung,
      bezug_kwh: bezug,
      einspeisung_kwh: einspeisung,
      coverage_ratio: Number(r.coverage_ratio ?? 1),
      source: r.source ?? "meter_daily_totals_mv",
    };
  });


  const { data: peakRowsData, error: peakRowsError } = await db
    .from("meter_power_readings_5min")
    .select("meter_id, bucket, power_avg, power_max, resolution_minutes, energy_type, source")
    .eq("tenant_id", tenantId)
    .in("meter_id", safeMeterIds)
    .gte("bucket", periodStart)
    .lte("bucket", periodEnd + "T23:59:59")
    .limit(20000);
  if (peakRowsError) throw { status: 500, message: "Leistungswerte konnten nicht gelesen werden", detail: peakRowsError.message };

  const peakMap = new Map<string, { meter_id: string; day: string; peak_kw: number; avg_kw_sum: number; samples: number }>();
  for (const r of peakRowsData ?? []) {
    const day = (r.bucket as string).slice(0, 10);
    const key = `${r.meter_id}|${day}`;
    const cur = peakMap.get(key) ?? { meter_id: r.meter_id, day, peak_kw: 0, avg_kw_sum: 0, samples: 0 };
    cur.peak_kw = Math.max(cur.peak_kw, Number(r.power_max || r.power_avg || 0));
    cur.avg_kw_sum += Number(r.power_avg || 0);
    cur.samples += 1;
    peakMap.set(key, cur);
  }
  const daily_power_peaks = Array.from(peakMap.values()).map((r) => {
    const meter = meterById.get(r.meter_id) as any;
    const location = meter ? locationById.get(meter.location_id) as any : null;
    return {
      day: r.day,
      meter_id: r.meter_id,
      meter_name: meter?.name ?? "Unbekannter Zähler",
      location_id: meter?.location_id ?? null,
      location_name: location?.name ?? "Ohne Standort",
      peak_kw: r.peak_kw,
      avg_kw: r.samples > 0 ? r.avg_kw_sum / r.samples : 0,
    };
  });

  let chargePointsQuery = db
    .from("charge_points")
    .select("id, name, location_id, max_power_kw, status")
    .eq("tenant_id", tenantId);
  if (locationId) chargePointsQuery = chargePointsQuery.eq("location_id", locationId);
  const { data: chargePointsData, error: chargePointsError } = await chargePointsQuery;
  if (chargePointsError) throw { status: 500, message: "Ladepunkte konnten nicht gelesen werden", detail: chargePointsError.message };
  const chargePoints = chargePointsData ?? [];
  const chargePointIds = chargePoints.map((cp: any) => cp.id);
  const safeChargePointIds = chargePointIds.length ? chargePointIds : ["00000000-0000-0000-0000-000000000000"];
  const chargePointById = new Map(chargePoints.map((cp: any) => [cp.id, cp]));

  const { data: pvActualData } = await db
    .from("pv_actual_hourly")
    .select("location_id, ts_hour, energy_kwh")
    .in("location_id", safeLocIds)
    .gte("ts_hour", periodStart)
    .lte("ts_hour", periodEnd + "T23:59:59")
    .limit(10000);

  const { data: chargingSessionsData, error: chargingSessionsError } = await db
    .from("charging_sessions")
    .select("id, charge_point_id, connector_id, energy_kwh, start_time, stop_time, status")
    .eq("tenant_id", tenantId)
    .in("charge_point_id", safeChargePointIds)
    .gte("start_time", periodStart)
    .lte("start_time", periodEnd + "T23:59:59")
    .limit(2000);
  if (chargingSessionsError) throw { status: 500, message: "Ladevorgänge konnten nicht gelesen werden", detail: chargingSessionsError.message };

  const charging_sessions = (chargingSessionsData ?? []).map((s: any) => {
    const cp = chargePointById.get(s.charge_point_id) as any;
    const location = cp ? locationById.get(cp.location_id) as any : null;
    return {
      ...s,
      charge_point_name: cp?.name ?? "Unbekannter Ladepunkt",
      location_id: cp?.location_id ?? null,
      location_name: location?.name ?? "Ohne Standort",
      energy_kwh: Number(s.energy_kwh || 0),
    };
  });

  const electricityByLocation = new Map<string, { location_id: string | null; location_name: string; total_kwh: number; meter_count: Set<string> }>();
  const electricityByMeter = new Map<string, { meter_id: string; meter_name: string; location_name: string; total_kwh: number }>();
  for (const row of daily_meter_totals) {
    if (row.energy_type !== "strom" || row.meter_function === "generation") continue;
    const locationKey = row.location_id ?? "unknown";
    const loc = electricityByLocation.get(locationKey) ?? { location_id: row.location_id, location_name: row.location_name, total_kwh: 0, meter_count: new Set<string>() };
    loc.total_kwh += row.total_kwh;
    loc.meter_count.add(row.meter_id);
    electricityByLocation.set(locationKey, loc);

    const meter = electricityByMeter.get(row.meter_id) ?? { meter_id: row.meter_id, meter_name: row.meter_name, location_name: row.location_name, total_kwh: 0 };
    meter.total_kwh += row.total_kwh;
    electricityByMeter.set(row.meter_id, meter);
  }

  const chargingByChargePoint = chargePoints.map((cp: any) => {
    const sessions = charging_sessions.filter((s: any) => s.charge_point_id === cp.id);
    const location = locationById.get(cp.location_id) as any;
    return {
      charge_point_id: cp.id,
      charge_point_name: cp.name ?? "Unbekannter Ladepunkt",
      location_id: cp.location_id ?? null,
      location_name: location?.name ?? "Ohne Standort",
      sessions: sessions.length,
      energy_kwh: sessions.reduce((sum: number, s: any) => sum + Number(s.energy_kwh || 0), 0),
    };
  });

  const prepared_summaries = {
    electricity_consumption_by_location: Array.from(electricityByLocation.values())
      .map((x) => ({ ...x, meter_count: x.meter_count.size, total_kwh: Number(x.total_kwh.toFixed(3)) }))
      .sort((a, b) => b.total_kwh - a.total_kwh),
    electricity_consumption_by_meter: Array.from(electricityByMeter.values())
      .map((x) => ({ ...x, total_kwh: Number(x.total_kwh.toFixed(3)) }))
      .sort((a, b) => b.total_kwh - a.total_kwh)
      .slice(0, 50),
    charging_by_charge_point: chargingByChargePoint
      .map((x) => ({ ...x, energy_kwh: Number(x.energy_kwh.toFixed(3)) }))
      .sort((a, b) => b.sessions - a.sessions || b.energy_kwh - a.energy_kwh),
    peak_power_by_day: daily_power_peaks
      .slice()
      .sort((a, b) => b.peak_kw - a.peak_kw)
      .slice(0, 50),
  };

  return {
    period: { start: periodStart, end: periodEnd },
    prepared_summaries,
    locations,
    meters,
    charge_points: chargePoints,
    daily_meter_totals: daily_meter_totals.slice(0, 5000),
    daily_power_peaks: daily_power_peaks.slice(0, 5000),
    pv_actual_hourly: (pvActualData ?? []).slice(0, 5000),
    charging_sessions,
    data_counts: {
      locations: locations.length,
      meters: meters.length,
      daily_meter_totals: daily_meter_totals.length,
      daily_power_peaks: daily_power_peaks.length,
      pv_actual_hourly: (pvActualData ?? []).length,
      charge_points: chargePoints.length,
      charging_sessions: charging_sessions.length,
    },
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
- Nutze zuerst "prepared_summaries". Diese Werte sind bereits korrekt voraggregiert und sollen bevorzugt für Charts/KPIs verwendet werden.
- Für Stromverbrauch pro Standort nutze "prepared_summaries.electricity_consumption_by_location".
- Für Stromverbrauch pro Zähler nutze "prepared_summaries.electricity_consumption_by_meter".
- Für Wallbox-/Ladepunkt-Auslastung nutze "prepared_summaries.charging_by_charge_point".
- Für Lastspitzen nutze "prepared_summaries.peak_power_by_day".
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
