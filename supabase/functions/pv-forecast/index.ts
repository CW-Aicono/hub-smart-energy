import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const WEATHER_MODEL = "icon_seamless";
const WEATHER_VARIABLES = [
  "global_tilted_irradiance",
  "diffuse_radiation",
  "temperature_2m",
  "wind_speed_10m",
  "cloud_cover",
];
const FORECAST_TIMEZONE = "Europe/Berlin";
const FORECAST_DAYS = 2;
const DWD_REFERENCE_TIMEZONE = "GMT";
const DWD_REFERENCE_DAYS = 1;
const NOCT = 45;
const TEMP_COEFF = -0.004;
const SYSTEM_LOSSES = 0.14;
const INVERTER_EFFICIENCY = 0.97;
const RAW_READING_PAGE_SIZE = 1000;

const round2 = (value: number) => Math.round(value * 100) / 100;
const round1 = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toLocalDateKey = (timestamp: string, timeZone = FORECAST_TIMEZONE) => new Date(timestamp)
  .toLocaleString("sv-SE", { timeZone: timeZone === "GMT" ? "UTC" : timeZone })
  .slice(0, 10);

const addDaysToDateKey = (dateKey: string, days: number) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const buildWeatherUrl = ({
  latitude,
  longitude,
  hourly,
  forecastDays,
  timezone,
  tilt,
  azimuth,
}: {
  latitude: number;
  longitude: number;
  hourly: string[];
  forecastDays: number;
  timezone: string;
  tilt?: number;
  azimuth?: number;
}) => {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: hourly.join(","),
    models: WEATHER_MODEL,
    forecast_days: String(forecastDays),
    timezone,
  });

  if (typeof tilt === "number") params.set("tilt", String(tilt));
  if (typeof azimuth === "number") params.set("azimuth", String(azimuth));

  return `${FORECAST_ENDPOINT}?${params.toString()}`;
};

const integrateDailyEnergyFromRawRows = (rows: Array<{ power_value: number; recorded_at: string }>) => {
  const sorted = [...rows].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  const totals = new Map<string, number>();

  for (let index = 0; index < sorted.length; index += 1) {
    const row = sorted[index];
    let intervalMin = 5;

    if (index < sorted.length - 1) {
      const gap = (new Date(sorted[index + 1].recorded_at).getTime() - new Date(row.recorded_at).getTime()) / 60000;
      if (gap > 0 && gap <= 15) intervalMin = gap;
    }

    const dayKey = toLocalDateKey(row.recorded_at);
    const energyKwh = row.power_value * (intervalMin / 60);
    totals.set(dayKey, (totals.get(dayKey) ?? 0) + energyKwh);
  }

  return Array.from(totals.entries())
    .map(([day, total]) => ({ day, total_value: round2(total) }))
    .sort((a, b) => a.day.localeCompare(b.day));
};

const fetchRawMeterDailyHistory = async (
  supabase: ReturnType<typeof createClient>,
  meterId: string,
  days = 30,
) => {
  const fromIso = new Date(Date.now() - (days + 1) * 24 * 60 * 60 * 1000).toISOString();
  const toIso = new Date().toISOString();
  const rows: Array<{ power_value: number; recorded_at: string }> = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("meter_power_readings")
      .select("power_value, recorded_at")
      .eq("meter_id", meterId)
      .gte("recorded_at", fromIso)
      .lt("recorded_at", toIso)
      .order("recorded_at", { ascending: true })
      .range(offset, offset + RAW_READING_PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < RAW_READING_PAGE_SIZE) break;
    offset += RAW_READING_PAGE_SIZE;
  }

  const todayKey = toLocalDateKey(new Date().toISOString());
  return integrateDailyEnergyFromRawRows(rows).filter((entry) => entry.day < todayKey);
};

const getDisplayValue = (entry: { ai_adjusted_kwh: number | null; estimated_kwh: number }) => (
  entry.ai_adjusted_kwh != null && entry.ai_adjusted_kwh > 0 ? entry.ai_adjusted_kwh : entry.estimated_kwh
);

interface HourlyEntry {
  timestamp: string;
  radiation_w_m2: number;
  cloud_cover_pct: number;
  estimated_kwh: number;
  ai_adjusted_kwh: number | null;
  poa_w_m2: number;
  dni_w_m2: number | null;
  dhi_w_m2: number;
  cell_temp_c: number;
  temperature_2m: number;
}

function computeHourlyForArray(
  meteo: any,
  peakKwp: number,
): HourlyEntry[] {
  const times: string[] = meteo.hourly?.time ?? [];
  const globalTiltedIrradiance: number[] = meteo.hourly?.global_tilted_irradiance ?? [];
  const diffuseRadiation: number[] = meteo.hourly?.diffuse_radiation ?? [];
  const clouds: number[] = meteo.hourly?.cloud_cover ?? [];
  const temps: number[] = meteo.hourly?.temperature_2m ?? [];

  return times.map((timestamp: string, index: number) => {
    const poaWm2 = globalTiltedIrradiance[index] ?? 0;
    const ambientTemp = temps[index] ?? 25;
    const moduleTemp = ambientTemp + ((NOCT - 20) / 800) * poaWm2;
    const tempFactor = Math.max(0.7, 1 + TEMP_COEFF * (moduleTemp - 25));
    const pDcKw = (poaWm2 / 1000) * peakKwp * tempFactor * (1 - SYSTEM_LOSSES);
    const pAcKw = Math.max(0, pDcKw * INVERTER_EFFICIENCY);

    return {
      timestamp,
      radiation_w_m2: round2(poaWm2),
      cloud_cover_pct: clouds[index] ?? 0,
      estimated_kwh: round2(pAcKw),
      ai_adjusted_kwh: null,
      poa_w_m2: round2(poaWm2),
      dni_w_m2: null,
      dhi_w_m2: round2(diffuseRadiation[index] ?? 0),
      cell_temp_c: round1(moduleTemp),
      temperature_2m: round1(ambientTemp),
    };
  });
}

function sumHourlyArrays(arrays: HourlyEntry[][]): HourlyEntry[] {
  if (arrays.length === 1) return arrays[0];

  const map = new Map<string, HourlyEntry>();
  for (const arr of arrays) {
    for (const entry of arr) {
      const existing = map.get(entry.timestamp);
      if (existing) {
        existing.estimated_kwh = round2(existing.estimated_kwh + entry.estimated_kwh);
        existing.ai_adjusted_kwh = existing.ai_adjusted_kwh != null && entry.ai_adjusted_kwh != null
          ? round2(existing.ai_adjusted_kwh + entry.ai_adjusted_kwh)
          : existing.ai_adjusted_kwh ?? entry.ai_adjusted_kwh;
      } else {
        map.set(entry.timestamp, { ...entry });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: claimsUser }, error: claimsError } = await authClient.auth.getUser(token);
    if (claimsError || !claimsUser?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { location_id } = await req.json();
    if (!location_id) throw new Error("location_id is required");

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: location, error: locErr } = await supabase
      .from("locations")
      .select("id, name, city, latitude, longitude, tenant_id")
      .eq("id", location_id)
      .single();
    if (locErr || !location) throw new Error("Location not found");
    if (!location.latitude || !location.longitude) throw new Error("Location has no coordinates");

    // Fetch ALL active arrays for this location
    const { data: allSettings } = await supabase
      .from("pv_forecast_settings")
      .select("*")
      .eq("location_id", location_id)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    const settingsArray = allSettings ?? [];

    // DWD reference (shared across all arrays, same location)
    const dwdReferenceUrl = buildWeatherUrl({
      latitude: location.latitude,
      longitude: location.longitude,
      hourly: ["cloud_cover"],
      forecastDays: DWD_REFERENCE_DAYS,
      timezone: DWD_REFERENCE_TIMEZONE,
    });

    if (settingsArray.length === 0) {
      // No settings at all – return empty forecast with weather source
      const meteoUrl = buildWeatherUrl({
        latitude: location.latitude,
        longitude: location.longitude,
        hourly: WEATHER_VARIABLES,
        forecastDays: FORECAST_DAYS,
        timezone: FORECAST_TIMEZONE,
        tilt: 0,
        azimuth: 0,
      });

      const [meteoRes, dwdRes] = await Promise.all([fetch(meteoUrl), fetch(dwdReferenceUrl)]);
      if (!meteoRes.ok) throw new Error("Open-Meteo API error");
      const meteo = await meteoRes.json();
      let dwdReference: any = null;
      if (dwdRes.ok) dwdReference = await dwdRes.json();

      return new Response(JSON.stringify({
        location: { name: location.name, city: location.city ?? "" },
        settings: { peak_power_kwp: 0, tilt_deg: 0, azimuth_deg: 0 },
        hourly: [],
        summary: {
          today_total_kwh: 0,
          tomorrow_total_kwh: 0,
          peak_hour: null,
          peak_kwh: 0,
          ai_confidence: "",
          ai_notes: "",
          performance_ratio: 0,
          pr_auto_updated: false,
          ai_correction_factor: 1,
        },
        weather_source: {
          provider: "Open-Meteo",
          profile: "PV-Erzeugungsprognose (GTI)",
          model: WEATHER_MODEL,
          endpoint: FORECAST_ENDPOINT,
          request_timezone: FORECAST_TIMEZONE,
          response_timezone: meteo.timezone ?? FORECAST_TIMEZONE,
          forecast_days: FORECAST_DAYS,
          hourly_variables: WEATHER_VARIABLES,
          requested_url: meteoUrl,
          requested_coordinates: { latitude: location.latitude, longitude: location.longitude },
          resolved_coordinates: { latitude: meteo.latitude ?? location.latitude, longitude: meteo.longitude ?? location.longitude },
        },
        validation: { dwd_reference: dwdReference ? buildDwdProfile(dwdReference, dwdReferenceUrl, location) : null },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch weather data for each unique tilt/azimuth combination
    // Build meteo requests per array (different tilt/azimuth → different GTI)
    const meteoPromises = settingsArray.map((s: any) => {
      const azimuthOpenMeteo = (s.azimuth_deg ?? 180) - 180;
      const url = buildWeatherUrl({
        latitude: location.latitude,
        longitude: location.longitude,
        hourly: WEATHER_VARIABLES,
        forecastDays: FORECAST_DAYS,
        timezone: FORECAST_TIMEZONE,
        tilt: s.tilt_deg ?? 0,
        azimuth: azimuthOpenMeteo,
      });
      return { url, settings: s, fetch: fetch(url) };
    });

    const dwdFetch = fetch(dwdReferenceUrl);

    const meteoResults = await Promise.all(meteoPromises.map((p) => p.fetch));
    const dwdRes = await dwdFetch;

    let dwdReference: any = null;
    if (dwdRes.ok) dwdReference = await dwdRes.json();

    // Process each array
    const arrayResults: Array<{
      name: string;
      peak_power_kwp: number;
      tilt_deg: number;
      azimuth_deg: number;
      hourly: HourlyEntry[];
      settings: any;
      meteoUrl: string;
    }> = [];

    for (let i = 0; i < settingsArray.length; i++) {
      const s = settingsArray[i];
      const res = meteoResults[i];
      if (!res.ok) {
        console.error(`Open-Meteo failed for array ${s.name}:`, res.status);
        continue;
      }
      const meteo = await res.json();
      const hourly = computeHourlyForArray(meteo, s.peak_power_kwp);
      arrayResults.push({
        name: s.name ?? `Anlage ${i + 1}`,
        peak_power_kwp: s.peak_power_kwp,
        tilt_deg: s.tilt_deg,
        azimuth_deg: s.azimuth_deg,
        hourly,
        settings: s,
        meteoUrl: meteoPromises[i].url,
      });
    }

    if (arrayResults.length === 0) throw new Error("All weather requests failed");

    // Sum hourly values across all arrays
    const combinedHourly = sumHourlyArrays(arrayResults.map((a) => a.hourly));
    const totalKwp = arrayResults.reduce((sum, a) => sum + a.peak_power_kwp, 0);

    // Auto-PR calibration per array
    let prAutoUpdated = false;
    for (const arr of arrayResults) {
      const s = arr.settings;
      let performanceRatio = s.performance_ratio ?? 0.8;

      if (s.recalibration_locked && s.recalibration_locked_until && new Date(s.recalibration_locked_until).getTime() <= Date.now()) {
        await supabase.from("pv_forecast_settings").update({ recalibration_locked: false }).eq("id", s.id);
        s.recalibration_locked = false;
      }

      if (s.pv_meter_id && !s.recalibration_locked) {
        try {
          const actualHistory = await fetchRawMeterDailyHistory(supabase, s.pv_meter_id, 30);
          if (actualHistory.length >= 14) {
            const firstDay = actualHistory[0].day;
            const lastDay = actualHistory[actualHistory.length - 1].day;
            const { data: forecastHistory } = await supabase
              .from("pv_forecast_hourly")
              .select("forecast_date, estimated_kwh")
              .eq("location_id", location_id)
              .gte("forecast_date", firstDay)
              .lte("forecast_date", lastDay);

            const forecastByDay = new Map<string, number>();
            for (const row of forecastHistory ?? []) {
              forecastByDay.set(row.forecast_date, (forecastByDay.get(row.forecast_date) ?? 0) + (row.estimated_kwh ?? 0));
            }

            let sumActual = 0, sumForecast = 0, matchedDays = 0;
            for (const day of actualHistory) {
              const fv = forecastByDay.get(day.day);
              if (fv && fv > 0 && day.total_value > 0) {
                sumActual += day.total_value;
                sumForecast += fv;
                matchedDays += 1;
              }
            }

            if (matchedDays >= 14 && sumForecast > 0) {
              const ratio = sumActual / sumForecast;
              performanceRatio = Math.round(clamp(performanceRatio * ratio, 0.7, 0.95) * 1000) / 1000;
              prAutoUpdated = true;
              await supabase.from("pv_forecast_settings").update({ performance_ratio: performanceRatio }).eq("id", s.id);
            }
          }
        } catch (prError) {
          console.error(`Auto-PR error for ${arr.name}:`, prError);
        }
      }
    }

    // AI calibration (using combined data from first array with a meter)
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let aiNotes = "";
    let aiConfidence = "";
    let aiCorrectionFactor = 1;
    const firstMeterArray = arrayResults.find((a) => a.settings.pv_meter_id);

    if (firstMeterArray && LOVABLE_API_KEY) {
      try {
        const actualHistory = await fetchRawMeterDailyHistory(supabase, firstMeterArray.settings.pv_meter_id, 30);
        if (actualHistory.length >= 5) {
          const histSummary = actualHistory.map((e) => `${e.day}: ${e.total_value} kWh`).join("\n");
          const forecastSummary = combinedHourly
            .filter((e) => e.estimated_kwh > 0)
            .slice(0, 24)
            .map((e) => `${e.timestamp}: ${e.estimated_kwh} kWh (GTI/POA ${e.poa_w_m2} W/m², DHI ${e.dhi_w_m2} W/m², Tmod ${e.cell_temp_c}°C, Tamb ${e.temperature_2m}°C)`)
            .join("\n");

          const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [
                {
                  role: "system",
                  content: `Du bist ein PV-Prognose-Experte. Du erhältst historische Tageserzeugung einer PV-Anlage (${totalKwp} kWp, ${arrayResults.length} Teilanlagen) und eine GTI-basierte AC-Prognose. Berechne einen Korrekturfaktor zwischen 0.5 und 1.5.`,
                },
                {
                  role: "user",
                  content: `Historische Tageserzeugung (letzte 30 Tage):\n${histSummary}\n\nGTI-basierte Prognose (nächste 24h, summiert über ${arrayResults.length} Teilanlagen):\n${forecastSummary}\n\nBitte antworte NUR mit einem JSON-Objekt: { "correction_factor": <number zwischen 0.5 und 1.5>, "confidence": "<hoch|mittel|niedrig>", "notes": "<kurzer Satz>" }`,
                },
              ],
              tools: [
                {
                  type: "function",
                  function: {
                    name: "pv_calibration",
                    description: "Return calibration factor for PV forecast (must be between 0.5 and 1.5)",
                    parameters: {
                      type: "object",
                      properties: {
                        correction_factor: { type: "number" },
                        confidence: { type: "string", enum: ["hoch", "mittel", "niedrig"] },
                        notes: { type: "string" },
                      },
                      required: ["correction_factor", "confidence", "notes"],
                      additionalProperties: false,
                    },
                  },
                },
              ],
              tool_choice: { type: "function", function: { name: "pv_calibration" } },
            }),
          });

          if (aiRes.ok) {
            const aiData = await aiRes.json();
            const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
            if (toolCall) {
              const args = JSON.parse(toolCall.function.arguments);
              aiCorrectionFactor = clamp(Number(args.correction_factor) || 1, 0.5, 1.5);
              aiConfidence = args.confidence || "";
              aiNotes = args.notes || "";

              for (const entry of combinedHourly) {
                entry.ai_adjusted_kwh = round2(entry.estimated_kwh * aiCorrectionFactor);
              }
            }
          }
        }
      } catch (aiErr) {
        console.error("AI calibration error:", aiErr);
      }
    }

    // Persist forecast
    try {
      const rows = combinedHourly.map((entry) => ({
        tenant_id: location.tenant_id,
        location_id,
        forecast_date: entry.timestamp.slice(0, 10),
        hour_timestamp: entry.timestamp,
        radiation_w_m2: entry.radiation_w_m2,
        cloud_cover_pct: entry.cloud_cover_pct,
        estimated_kwh: entry.estimated_kwh,
        ai_adjusted_kwh: entry.ai_adjusted_kwh,
        peak_power_kwp: totalKwp,
        poa_w_m2: entry.poa_w_m2,
        dni_w_m2: null,
        dhi_w_m2: entry.dhi_w_m2,
        cell_temp_c: entry.cell_temp_c,
        temperature_2m: entry.temperature_2m,
        legacy_estimated_kwh: null,
        corrected_estimated_kwh: null,
        legacy_ai_adjusted_kwh: null,
        corrected_ai_adjusted_kwh: null,
        legacy_poa_w_m2: null,
      }));

      const { error: upsertErr } = await supabase
        .from("pv_forecast_hourly")
        .upsert(rows, { onConflict: "location_id,hour_timestamp" });
      if (upsertErr) console.error("Failed to persist forecast:", upsertErr.message);
    } catch (persistErr) {
      console.error("Persist forecast error:", persistErr);
    }

    // Build response
    const todayKey = toLocalDateKey(new Date().toISOString());
    const tomorrowKey = addDaysToDateKey(todayKey, 1);
    const todayTotal = combinedHourly.filter((e) => e.timestamp.startsWith(todayKey)).reduce((sum, e) => sum + getDisplayValue(e), 0);
    const tomorrowTotal = combinedHourly.filter((e) => e.timestamp.startsWith(tomorrowKey)).reduce((sum, e) => sum + getDisplayValue(e), 0);
    const peakEntry = combinedHourly.reduce((best, e) => (!best || getDisplayValue(e) > getDisplayValue(best) ? e : best), combinedHourly[0] ?? null);

    const firstUrl = meteoPromises[0]?.url ?? "";
    const weatherSource = {
      provider: "Open-Meteo",
      profile: `PV-Erzeugungsprognose (GTI, ${arrayResults.length} ${arrayResults.length === 1 ? "Anlage" : "Teilanlagen"})`,
      model: WEATHER_MODEL,
      endpoint: FORECAST_ENDPOINT,
      request_timezone: FORECAST_TIMEZONE,
      response_timezone: FORECAST_TIMEZONE,
      forecast_days: FORECAST_DAYS,
      hourly_variables: WEATHER_VARIABLES,
      requested_url: firstUrl,
      requested_coordinates: { latitude: location.latitude, longitude: location.longitude },
      resolved_coordinates: { latitude: location.latitude, longitude: location.longitude },
    };

    const result = {
      location: { name: location.name, city: location.city },
      settings: {
        peak_power_kwp: totalKwp,
        tilt_deg: arrayResults[0].tilt_deg,
        azimuth_deg: arrayResults[0].azimuth_deg,
      },
      hourly: combinedHourly,
      arrays: arrayResults.map((a) => ({
        name: a.name,
        peak_power_kwp: a.peak_power_kwp,
        tilt_deg: a.tilt_deg,
        azimuth_deg: a.azimuth_deg,
        hourly: a.hourly,
      })),
      summary: {
        today_total_kwh: round1(todayTotal),
        tomorrow_total_kwh: round1(tomorrowTotal),
        peak_hour: peakEntry?.timestamp || null,
        peak_kwh: peakEntry ? round2(getDisplayValue(peakEntry)) : 0,
        ai_confidence: aiConfidence,
        ai_notes: aiNotes,
        performance_ratio: arrayResults[0]?.settings?.performance_ratio ?? 0.8,
        pr_auto_updated: prAutoUpdated,
        ai_correction_factor: aiCorrectionFactor,
      },
      weather_source: weatherSource,
      validation: {
        dwd_reference: dwdReference ? buildDwdProfile(dwdReference, dwdReferenceUrl, location) : null,
      },
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("pv-forecast error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

function buildDwdProfile(dwdReference: any, dwdReferenceUrl: string, location: any) {
  return {
    provider: "Open-Meteo",
    profile: "DWD-Cloud-Cover-Referenz",
    model: WEATHER_MODEL,
    endpoint: FORECAST_ENDPOINT,
    request_timezone: DWD_REFERENCE_TIMEZONE,
    response_timezone: dwdReference.timezone ?? DWD_REFERENCE_TIMEZONE,
    forecast_days: DWD_REFERENCE_DAYS,
    hourly_variables: ["cloud_cover"],
    requested_url: dwdReferenceUrl,
    requested_coordinates: { latitude: location.latitude, longitude: location.longitude },
    resolved_coordinates: { latitude: dwdReference.latitude ?? location.latitude, longitude: dwdReference.longitude ?? location.longitude },
    hourly_cloud_cover_today: (dwdReference.hourly?.time ?? [])
      .map((timestamp: string, index: number) => ({
        timestamp,
        cloud_cover_pct: dwdReference.hourly?.cloud_cover?.[index] ?? 0,
      }))
      .filter((entry: { timestamp: string }) => entry.timestamp.startsWith(toLocalDateKey(new Date().toISOString(), dwdReference.timezone ?? DWD_REFERENCE_TIMEZONE))),
  };
}
