import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODEL = "google/gemini-2.5-pro";

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

// ─── Helper: Convert UTC timestamp to Europe/Berlin {date, hour, weekday} ──
const BERLIN_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit",
  hour12: false, weekday: "short",
});
const WEEKDAY_DE: Record<string, { name: string; idx: number }> = {
  Mon: { name: "Mo", idx: 1 }, Tue: { name: "Di", idx: 2 }, Wed: { name: "Mi", idx: 3 },
  Thu: { name: "Do", idx: 4 }, Fri: { name: "Fr", idx: 5 }, Sat: { name: "Sa", idx: 6 }, Sun: { name: "So", idx: 7 },
};
function toBerlin(iso: string) {
  const parts = BERLIN_FORMATTER.formatToParts(new Date(iso));
  const m: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") m[p.type] = p.value;
  return { date: `${m.year}-${m.month}-${m.day}`, hour: Number(m.hour), weekday: m.weekday };
}

// ─── Datenkontext für die KI sammeln ──────────────────────────────────────
async function gatherContext(db: any, tenantId: string, locationId: string | null, periodStart: string, periodEnd: string) {
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

  // Pre-aggregated daily totals
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

  // Main-meter consumption meters for Strom (incl. bidirectional main meters with PV feed-in)
  const mainStromMeterIds = new Set(
    meters.filter((m: any) =>
      m.is_main_meter &&
      m.energy_type === "strom" &&
      (m.meter_function === "consumption" || m.meter_function === "bidirectional" || !m.meter_function)
    ).map((m: any) => m.id)
  );
  const mainStromMeterIdsArr = Array.from(mainStromMeterIds) as string[];
  const safeMainMeterIds = mainStromMeterIdsArr.length ? mainStromMeterIdsArr : ["00000000-0000-0000-0000-000000000000"];

  // 5-min power readings — ONLY for main meters (peaks + base load), avoids 50k cutoff
  const { data: peakRowsData, error: peakRowsError } = await db
    .from("meter_power_readings_5min")
    .select("meter_id, bucket, power_avg, power_max, resolution_minutes, energy_type, source")
    .eq("tenant_id", tenantId)
    .in("meter_id", safeMainMeterIds)
    .gte("bucket", periodStart)
    .lte("bucket", periodEnd + "T23:59:59")
    .order("bucket", { ascending: true })
    .limit(50000);
  if (peakRowsError) throw { status: 500, message: "Leistungswerte konnten nicht gelesen werden", detail: peakRowsError.message };

  // Daily power peaks — main consumption meters

  const peakMap = new Map<string, { meter_id: string; day: string; peak_kw: number; avg_kw_sum: number; samples: number }>();
  // Base load — min power_avg in Berlin local hours [0,5) per main meter per Berlin day
  const baseLoadMap = new Map<string, { meter_id: string; day: string; min_kw: number; samples: number }>();

  for (const r of peakRowsData ?? []) {
    if (!mainStromMeterIds.has(r.meter_id)) continue;
    const berlin = toBerlin(r.bucket as string);
    const day = berlin.date;
    const key = `${r.meter_id}|${day}`;
    const pk = peakMap.get(key) ?? { meter_id: r.meter_id, day, peak_kw: 0, avg_kw_sum: 0, samples: 0 };
    pk.peak_kw = Math.max(pk.peak_kw, Number(r.power_max || r.power_avg || 0));
    pk.avg_kw_sum += Number(r.power_avg || 0);
    pk.samples += 1;
    peakMap.set(key, pk);

    if (berlin.hour < 5) {
      const bl = baseLoadMap.get(key);
      const pAvg = Number(r.power_avg || 0);
      if (!bl) {
        baseLoadMap.set(key, { meter_id: r.meter_id, day, min_kw: pAvg, samples: 1 });
      } else {
        bl.min_kw = Math.min(bl.min_kw, pAvg);
        bl.samples += 1;
      }
    }
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
      peak_kw: Number(r.peak_kw.toFixed(3)),
      avg_kw: Number((r.samples > 0 ? r.avg_kw_sum / r.samples : 0).toFixed(3)),
    };
  });

  const daily_base_load_kw = Array.from(baseLoadMap.values())
    .filter((r) => r.samples >= 6) // at least 30min of night data
    .map((r) => {
      const meter = meterById.get(r.meter_id) as any;
      const location = meter ? locationById.get(meter.location_id) as any : null;
      return {
        day: r.day,
        meter_id: r.meter_id,
        meter_name: meter?.name ?? "Unbekannter Zähler",
        location_id: meter?.location_id ?? null,
        location_name: location?.name ?? "Ohne Standort",
        base_load_kw: Number(r.min_kw.toFixed(3)),
      };
    })
    .sort((a, b) => a.day.localeCompare(b.day));

  // Weekday consumption — main strom meters only, average kWh per weekday
  const weekdayMap = new Map<number, { weekday: string; sum: number; days: number }>();
  for (const row of daily_meter_totals) {
    if (row.energy_type !== "strom" || !row.is_main_meter || row.meter_function === "generation") continue;
    const berlin = toBerlin(row.day);
    const wd = WEEKDAY_DE[berlin.weekday];
    if (!wd) continue;
    const cur = weekdayMap.get(wd.idx) ?? { weekday: wd.name, sum: 0, days: 0 };
    cur.sum += row.bezug_kwh;
    cur.days += 1;
    weekdayMap.set(wd.idx, cur);
  }
  const weekday_consumption_kwh = Array.from(weekdayMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([, v]) => ({
      weekday: v.weekday,
      total_kwh: Number(v.sum.toFixed(2)),
      avg_kwh_per_day: Number((v.days > 0 ? v.sum / v.days : 0).toFixed(2)),
      days_counted: v.days,
    }));

  // Charge points + sessions
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
    .limit(5000);
  if (chargingSessionsError) throw { status: 500, message: "Ladevorgänge konnten nicht gelesen werden", detail: chargingSessionsError.message };

  // Plausibility filter: only sessions with ≥ 0.1 kWh AND completed/finishing
  const charging_sessions = (chargingSessionsData ?? [])
    .filter((s: any) =>
      Number(s.energy_kwh || 0) >= 0.1 &&
      ["Completed", "Finishing", "completed", "finishing"].includes(s.status ?? "")
    )
    .map((s: any) => {
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

  // Electricity aggregation — main meters only (consumption)
  const electricityByLocation = new Map<string, { location_id: string | null; location_name: string; total_kwh: number; meter_count: Set<string> }>();
  const electricityByMeter = new Map<string, { meter_id: string; meter_name: string; location_name: string; total_kwh: number }>();
  for (const row of daily_meter_totals) {
    if (row.energy_type !== "strom" || !row.is_main_meter || row.meter_function === "generation") continue;
    const locationKey = row.location_id ?? "unknown";
    const loc = electricityByLocation.get(locationKey) ?? { location_id: row.location_id, location_name: row.location_name, total_kwh: 0, meter_count: new Set<string>() };
    loc.total_kwh += row.bezug_kwh;
    loc.meter_count.add(row.meter_id);
    electricityByLocation.set(locationKey, loc);

    const meter = electricityByMeter.get(row.meter_id) ?? { meter_id: row.meter_id, meter_name: row.meter_name, location_name: row.location_name, total_kwh: 0 };
    meter.total_kwh += row.bezug_kwh;
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

  // Coverage report
  const expectedDays = Math.max(1, Math.round((new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / 86400000) + 1);
  const coverageByMeter = new Map<string, { meter_id: string; meter_name: string; location_name: string; days_with_data: number; avg_coverage: number; expected_days: number }>();
  for (const row of daily_meter_totals) {
    const cur = coverageByMeter.get(row.meter_id) ?? { meter_id: row.meter_id, meter_name: row.meter_name, location_name: row.location_name, days_with_data: 0, avg_coverage: 0, expected_days: expectedDays };
    cur.days_with_data += 1;
    cur.avg_coverage += row.coverage_ratio;
    coverageByMeter.set(row.meter_id, cur);
  }
  const data_coverage = Array.from(coverageByMeter.values()).map((x) => ({
    ...x,
    avg_coverage: x.days_with_data > 0 ? Number((x.avg_coverage / x.days_with_data).toFixed(2)) : 0,
    coverage_pct: Number(((x.days_with_data / x.expected_days) * 100).toFixed(0)),
  })).sort((a, b) => a.coverage_pct - b.coverage_pct);

  // Overall coverage on main strom meters → drives hard-stop
  const mainCoverage = data_coverage.filter((c) => mainStromMeterIds.has(c.meter_id));
  const avgMainCoverage = mainCoverage.length
    ? mainCoverage.reduce((s, c) => s + c.avg_coverage, 0) / mainCoverage.length
    : (data_coverage.reduce((s, c) => s + c.avg_coverage, 0) / Math.max(1, data_coverage.length));
  const avgMainDayPct = mainCoverage.length
    ? mainCoverage.reduce((s, c) => s + c.coverage_pct, 0) / mainCoverage.length
    : 0;

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
    daily_base_load_kw,
    weekday_consumption_kwh,
    data_coverage,
    overall_main_meter_coverage: {
      avg_coverage_ratio: Number(avgMainCoverage.toFixed(2)),
      avg_days_pct: Number(avgMainDayPct.toFixed(0)),
      main_meters_count: mainStromMeterIds.size,
    },
  };

  return {
    context: {
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
        main_strom_meters: mainStromMeterIds.size,
        daily_meter_totals: daily_meter_totals.length,
        daily_power_peaks: daily_power_peaks.length,
        daily_base_load_kw: daily_base_load_kw.length,
        weekday_consumption_kwh: weekday_consumption_kwh.length,
        pv_actual_hourly: (pvActualData ?? []).length,
        charge_points: chargePoints.length,
        charging_sessions: charging_sessions.length,
      },
    },
    coverage: {
      avgCoverage: avgMainCoverage,
      avgDaysPct: avgMainDayPct,
      mainMetersCount: mainStromMeterIds.size,
    },
  };
}

// ─── AI-Call mit strukturiertem Schema ────────────────────────────────────
async function callAI(prompt: string, context: any) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw { status: 500, message: "KI nicht konfiguriert" };

  const systemPrompt = `Du bist der Analytics-Assistent eines deutschen Energie-Management-Systems (AICONO EMS).
Du erhältst aggregierte Mess- und Anlagendaten eines Mandanten und beantwortest die Frage des Nutzers mit einer strukturierten Analyse.

AUSGABE-PFLICHT:
- Knapper, sprechender Titel auf Deutsch
- 1–3 KPIs. "value" ist eine Zahl ODER ein String (z.B. Datum "16.06.2026"). Numerische KPIs IMMER in der angegebenen "unit" (siehe Einheiten-Regeln).
- Genau EIN passender Chart (bar / line / pie / table) mit Pflichtfeld "unit" je Serie.
- 3–5 Sätze "insight_markdown" mit klarer Handlungsempfehlung.
- Liste der verwendeten Datenquellen (Schlüssel aus prepared_summaries).

EINHEITEN-REGELN (verbindlich):
- Energie IMMER in kWh, nie MWh. KPI und Chart müssen die gleiche Einheit haben.
- Leistung IMMER in kW.
- Datums-KPIs ausschließlich als String "TT.MM.JJJJ".

DATEN-PRIORITÄT (NIEMALS abweichen):
- Strom-Verbrauch pro Standort/Zähler → ausschließlich prepared_summaries.electricity_consumption_by_location bzw. _by_meter (bereits auf Hauptzähler/Strom/Bezug gefiltert).
- Lastspitzen → ausschließlich prepared_summaries.peak_power_by_day (nur Hauptzähler-Strom-Bezug, bereits gefiltert).
- Grundlast → ausschließlich prepared_summaries.daily_base_load_kw (nächtliches Minimum 00–05 Uhr Europe/Berlin). NIEMALS peak_power_by_day als Grundlast verwenden.
- Wochentag-Verbrauch → ausschließlich prepared_summaries.weekday_consumption_kwh (avg_kwh_per_day verwenden, Sortierung Mo→So).
- Wallbox/Ladepunkte → ausschließlich prepared_summaries.charging_by_charge_point (Sessions sind bereits auf ≥ 0,1 kWh gefiltert).

DATEN-QUALITÄT:
- Prüfe prepared_summaries.data_coverage. Wenn coverage_pct < 80 oder avg_coverage < 0.8 für die verwendeten Zähler: Hinweis in insight_markdown ("Datenbasis lückenhaft: nur X von Y Tagen verfügbar") und KPI-Aussagekraft entsprechend einordnen.
- Erfinde keine Werte. Wenn Daten fehlen: ehrlich in insight_markdown sagen, KPI-/Chart-Arrays leer lassen.
- Zahlen liefert die KI als reine Zahlen (Punkt als Dezimalseparator); die deutsche Formatierung übernimmt das Frontend.`;

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
                value: { type: ["number", "string"] },
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
              unit: { type: "string" },
              series: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    unit: { type: "string" },
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
                  required: ["name", "data", "unit"],
                },
              },
            },
            required: ["type", "x_label", "y_label", "unit", "series"],
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
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Frage: ${prompt}\n\nDaten-Kontext (JSON):\n${JSON.stringify(context).slice(0, 180000)}` },
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

    const { context, coverage } = await gatherContext(db, tenantId, locationId, periodStart, periodEnd);

    let result: any;

    // ─── Hard-Stop: bei katastrophal dünner Datenbasis keine KI-Analyse ──
    if (coverage.mainMetersCount === 0 || coverage.avgCoverage < 0.3) {
      result = {
        title: "Datenbasis zu dünn für belastbare Analyse",
        kpis: [],
        chart: { type: "table", x_label: "Hinweis", y_label: "", unit: "", series: [] },
        insight_markdown:
          coverage.mainMetersCount === 0
            ? "Für den gewählten Zeitraum/Standort sind keine Hauptzähler-Strom-Daten vorhanden. Eine KI-Analyse ist nicht sinnvoll. Bitte Zähler-Konfiguration prüfen oder einen anderen Zeitraum/Standort wählen."
            : `Nur ${Math.round(coverage.avgCoverage * 100)}% der erwarteten Messwerte vorhanden (durchschnittliche Abdeckung der Hauptzähler). Eine KI-Analyse würde stark verzerrte Ergebnisse liefern und wurde deshalb übersprungen. Bitte Gateway/Zähler prüfen oder einen Zeitraum mit besserer Abdeckung wählen.`,
        sources: ["prepared_summaries.overall_main_meter_coverage"],
      };
    } else {
      result = await callAI(prompt, context);
    }

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
        model_used: MODEL,
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
