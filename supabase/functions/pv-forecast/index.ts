import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { calculateCorrectedPvOutput, calculateLegacyPvOutput } from "../_shared/pv-forecast.ts";

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
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
    const WEATHER_MODEL = "icon_seamless";
    const WEATHER_VARIABLES = [
      "shortwave_radiation",
      "direct_normal_irradiance",
      "diffuse_radiation",
      "cloud_cover",
      "temperature_2m",
    ];
    const FORECAST_TIMEZONE = "Europe/Berlin";
    const FORECAST_DAYS = 2;
    const DWD_REFERENCE_TIMEZONE = "GMT";
    const DWD_REFERENCE_DAYS = 1;

    const buildWeatherUrl = ({
      latitude,
      longitude,
      hourly,
      forecastDays,
      timezone,
    }: {
      latitude: number;
      longitude: number;
      hourly: string[];
      forecastDays: number;
      timezone: string;
    }) => {
      const params = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        hourly: hourly.join(","),
        models: WEATHER_MODEL,
        forecast_days: String(forecastDays),
        timezone,
      });

      return `${FORECAST_ENDPOINT}?${params.toString()}`;
    };

    const getTodayKeyForTimezone = (timeZone: string) => {
      const normalizedTimeZone = timeZone === "GMT" ? "UTC" : timeZone;
      return new Date().toLocaleString("sv-SE", { timeZone: normalizedTimeZone }).slice(0, 10);
    };

    const sumDailyForecastValue = (rows: Array<{
      corrected_ai_adjusted_kwh?: number | null;
      corrected_estimated_kwh?: number | null;
      ai_adjusted_kwh?: number | null;
      estimated_kwh?: number | null;
      legacy_ai_adjusted_kwh?: number | null;
      legacy_estimated_kwh?: number | null;
    }>) => rows.reduce((sum, row) => sum + (
      row.corrected_ai_adjusted_kwh
      ?? row.corrected_estimated_kwh
      ?? row.ai_adjusted_kwh
      ?? row.estimated_kwh
      ?? 0
    ), 0);

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

    const { data: settings } = await supabase
      .from("pv_forecast_settings")
      .select("*")
      .eq("location_id", location_id)
      .eq("is_active", true)
      .maybeSingle();

    const meteoUrl = buildWeatherUrl({
      latitude: location.latitude,
      longitude: location.longitude,
      hourly: WEATHER_VARIABLES,
      forecastDays: FORECAST_DAYS,
      timezone: FORECAST_TIMEZONE,
    });

    const dwdReferenceUrl = buildWeatherUrl({
      latitude: location.latitude,
      longitude: location.longitude,
      hourly: ["cloud_cover"],
      forecastDays: DWD_REFERENCE_DAYS,
      timezone: DWD_REFERENCE_TIMEZONE,
    });

    const [meteoRes, dwdReferenceRes] = await Promise.all([fetch(meteoUrl), fetch(dwdReferenceUrl)]);
    if (!meteoRes.ok) throw new Error("Open-Meteo API error");

    const meteo = await meteoRes.json();
    let dwdReference: any = null;

    if (dwdReferenceRes.ok) {
      dwdReference = await dwdReferenceRes.json();
    } else {
      console.error("DWD reference fetch failed:", dwdReferenceRes.status, await dwdReferenceRes.text());
    }

    const weatherSource = {
      provider: "Open-Meteo",
      profile: "PV-Erzeugungsprognose",
      model: WEATHER_MODEL,
      endpoint: FORECAST_ENDPOINT,
      request_timezone: FORECAST_TIMEZONE,
      response_timezone: meteo.timezone ?? FORECAST_TIMEZONE,
      forecast_days: FORECAST_DAYS,
      hourly_variables: WEATHER_VARIABLES,
      requested_url: meteoUrl,
      requested_coordinates: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
      resolved_coordinates: {
        latitude: meteo.latitude ?? location.latitude,
        longitude: meteo.longitude ?? location.longitude,
      },
    };

    const dwdReferenceProfile = dwdReference
      ? {
          provider: "Open-Meteo",
          profile: "DWD-Cloud-Cover-Referenz",
          model: WEATHER_MODEL,
          endpoint: FORECAST_ENDPOINT,
          request_timezone: DWD_REFERENCE_TIMEZONE,
          response_timezone: dwdReference.timezone ?? DWD_REFERENCE_TIMEZONE,
          forecast_days: DWD_REFERENCE_DAYS,
          hourly_variables: ["cloud_cover"],
          requested_url: dwdReferenceUrl,
          requested_coordinates: {
            latitude: location.latitude,
            longitude: location.longitude,
          },
          resolved_coordinates: {
            latitude: dwdReference.latitude ?? location.latitude,
            longitude: dwdReference.longitude ?? location.longitude,
          },
          hourly_cloud_cover_today: (dwdReference.hourly?.time ?? [])
            .map((timestamp: string, index: number) => ({
              timestamp,
              cloud_cover_pct: dwdReference.hourly?.cloud_cover?.[index] ?? 0,
            }))
            .filter((entry: { timestamp: string }) => entry.timestamp.startsWith(getTodayKeyForTimezone(dwdReference.timezone ?? DWD_REFERENCE_TIMEZONE))),
        }
      : null;

    if (!settings) {
      return new Response(JSON.stringify({
        location: { name: location.name, city: location.city ?? "" },
        settings: { peak_power_kwp: 0, tilt_deg: 0, azimuth_deg: 0 },
        hourly: [],
        summary: {
          today_total_kwh: 0,
          tomorrow_total_kwh: 0,
          legacy_today_total_kwh: 0,
          corrected_today_total_kwh: 0,
          legacy_tomorrow_total_kwh: 0,
          corrected_tomorrow_total_kwh: 0,
          peak_hour: null,
          peak_kwh: 0,
          ai_confidence: "",
          ai_notes: "",
          performance_ratio: 0,
          pr_auto_updated: false,
          ai_correction_factor: 1,
        },
        weather_source: weatherSource,
        validation: { dwd_reference: dwdReferenceProfile },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const peakKwp = settings.peak_power_kwp;
    const tiltDeg = settings.tilt_deg;
    const azimuthDeg = settings.azimuth_deg;

    const times: string[] = meteo.hourly.time;
    const ghi: number[] = meteo.hourly.shortwave_radiation;
    const dniRaw: number[] | undefined = meteo.hourly.direct_normal_irradiance;
    const dhi: number[] = meteo.hourly.diffuse_radiation;
    const clouds: number[] = meteo.hourly.cloud_cover;
    const temps: number[] = meteo.hourly.temperature_2m;

    let performanceRatio = settings.performance_ratio ?? 0.85;
    let prAutoUpdated = false;

    if (settings?.pv_meter_id) {
      try {
        const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: history } = await supabase
          .from("meter_period_totals")
          .select("period_start, total_value")
          .eq("meter_id", settings.pv_meter_id)
          .eq("period_type", "day")
          .gte("period_start", since30d)
          .order("period_start", { ascending: true });

        if (history && history.length >= 7) {
          const firstDay = history[0].period_start.slice(0, 10);
          const lastDay = history[history.length - 1].period_start.slice(0, 10);

          const { data: forecastHistory } = await supabase
            .from("pv_forecast_hourly")
            .select("forecast_date, estimated_kwh, ai_adjusted_kwh, corrected_estimated_kwh, corrected_ai_adjusted_kwh")
            .eq("location_id", location_id)
            .gte("forecast_date", firstDay)
            .lte("forecast_date", lastDay);

          if (forecastHistory && forecastHistory.length > 0) {
            const forecastByDay = new Map<string, number>();
            for (const row of forecastHistory) {
              const day = row.forecast_date;
              const value = row.corrected_ai_adjusted_kwh
                ?? row.corrected_estimated_kwh
                ?? row.ai_adjusted_kwh
                ?? row.estimated_kwh
                ?? 0;
              forecastByDay.set(day, (forecastByDay.get(day) ?? 0) + value);
            }

            let sumActual = 0;
            let sumForecast = 0;
            let matchedDays = 0;
            for (const h of history) {
              const day = h.period_start.slice(0, 10);
              const fc = forecastByDay.get(day);
              if (fc && fc > 0 && h.total_value > 0) {
                sumActual += h.total_value;
                sumForecast += fc;
                matchedDays++;
              }
            }

            if (matchedDays >= 5 && sumForecast > 0) {
              const ratio = sumActual / sumForecast;
              const newPR = performanceRatio * ratio;
              performanceRatio = Math.max(0.5, Math.min(0.95, Math.round(newPR * 1000) / 1000));
              prAutoUpdated = true;
              console.log(`Auto-PR: ratio=${ratio.toFixed(3)}, newPR=${performanceRatio} (${matchedDays} days matched)`);

              supabase
                .from("pv_forecast_settings")
                .update({ performance_ratio: performanceRatio })
                .eq("id", settings.id)
                .then(({ error: prErr }) => {
                  if (prErr) console.error("Failed to persist auto-PR:", prErr.message);
                });
            }
          }
        }
      } catch (prError) {
        console.error("Auto-PR calculation error:", prError);
      }
    }

    const hourly = times.map((timestamp: string, index: number) => {
      const input = {
        timestamp,
        latitude: location.latitude,
        longitude: location.longitude,
        tiltDeg,
        azimuthDeg,
        peakKwp,
        performanceRatio,
        ghi: ghi[index] ?? 0,
        dni: dniRaw?.[index] ?? null,
        dhi: dhi[index] ?? 0,
        ambientTemp: temps[index] ?? 25,
      };

      const legacy = calculateLegacyPvOutput(input);
      const corrected = calculateCorrectedPvOutput(input);

      return {
        timestamp,
        radiation_w_m2: ghi[index] ?? 0,
        cloud_cover_pct: clouds[index] ?? 0,
        estimated_kwh: corrected.estimatedKwh,
        ai_adjusted_kwh: null as number | null,
        legacy_estimated_kwh: legacy.estimatedKwh,
        corrected_estimated_kwh: corrected.estimatedKwh,
        legacy_ai_adjusted_kwh: null as number | null,
        corrected_ai_adjusted_kwh: null as number | null,
        poa_w_m2: corrected.poaWm2,
        legacy_poa_w_m2: legacy.poaWm2,
        dni_w_m2: corrected.dniWm2,
        dhi_w_m2: input.dhi,
        cell_temp_c: corrected.cellTempC,
      };
    });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let aiNotes = "";
    let aiConfidence = "";
    let aiCorrectionFactor = 1;

    if (settings?.pv_meter_id && LOVABLE_API_KEY) {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: history } = await supabase
        .from("meter_period_totals")
        .select("period_start, total_value")
        .eq("meter_id", settings.pv_meter_id)
        .eq("period_type", "day")
        .gte("period_start", since)
        .order("period_start", { ascending: true });

      if (history && history.length >= 5) {
        const histSummary = history.map((h: any) => `${h.period_start}: ${h.total_value} kWh`).join("\n");
        const forecastSummary = hourly
          .filter((h) => h.corrected_estimated_kwh > 0)
          .slice(0, 24)
          .map((h) => `${h.timestamp}: ${h.corrected_estimated_kwh} kWh (POA ${h.poa_w_m2} W/m², GHI ${h.radiation_w_m2} W/m², DNI ${h.dni_w_m2} W/m², Zelle ${h.cell_temp_c}°C)`)
          .join("\n");

        try {
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
                  content: `Du bist ein PV-Prognose-Experte. Du erhältst historische Tageserzeugung einer PV-Anlage (${peakKwp} kWp, Neigung ${tiltDeg}°, Kompass-Azimut ${azimuthDeg}°, PR=${performanceRatio}) und eine physikalische Prognose. Berechne einen Korrekturfaktor. WICHTIG: Der Faktor muss zwischen 0.5 und 1.5 liegen.`,
                },
                {
                  role: "user",
                  content: `Historische Tageserzeugung (letzte 30 Tage):\n${histSummary}\n\nKorrigierte physikalische Prognose (nächste 24h):\n${forecastSummary}\n\nBitte antworte NUR mit einem JSON-Objekt: { "correction_factor": <number zwischen 0.5 und 1.5>, "confidence": "<hoch|mittel|niedrig>", "notes": "<kurzer Satz>" }`,
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
              let factor = Number(args.correction_factor) || 1;
              const rawFactor = factor;
              factor = Math.max(0.5, Math.min(1.5, factor));
              if (rawFactor !== factor) {
                console.log(`AI correction factor clamped: ${rawFactor} → ${factor}`);
              }

              aiCorrectionFactor = factor;
              aiConfidence = args.confidence || "";
              aiNotes = args.notes || "";

              for (const entry of hourly) {
                entry.ai_adjusted_kwh = Math.round(entry.corrected_estimated_kwh * factor * 100) / 100;
                entry.corrected_ai_adjusted_kwh = entry.ai_adjusted_kwh;
                entry.legacy_ai_adjusted_kwh = Math.round(entry.legacy_estimated_kwh * factor * 100) / 100;
              }
            }
          } else {
            const errText = await aiRes.text();
            console.error("AI calibration failed:", aiRes.status, errText);
          }
        } catch (aiErr) {
          console.error("AI calibration error:", aiErr);
        }
      }
    }

    try {
      const rows = hourly.map((entry: any) => ({
        tenant_id: location.tenant_id,
        location_id,
        forecast_date: entry.timestamp.slice(0, 10),
        hour_timestamp: entry.timestamp,
        radiation_w_m2: entry.radiation_w_m2,
        cloud_cover_pct: entry.cloud_cover_pct,
        estimated_kwh: entry.corrected_estimated_kwh,
        ai_adjusted_kwh: entry.corrected_ai_adjusted_kwh,
        legacy_estimated_kwh: entry.legacy_estimated_kwh,
        corrected_estimated_kwh: entry.corrected_estimated_kwh,
        legacy_ai_adjusted_kwh: entry.legacy_ai_adjusted_kwh,
        corrected_ai_adjusted_kwh: entry.corrected_ai_adjusted_kwh,
        peak_power_kwp: peakKwp,
        poa_w_m2: entry.poa_w_m2,
        legacy_poa_w_m2: entry.legacy_poa_w_m2,
        dni_w_m2: entry.dni_w_m2,
        dhi_w_m2: entry.dhi_w_m2,
      }));
      const { error: upsertErr } = await supabase
        .from("pv_forecast_hourly")
        .upsert(rows, { onConflict: "location_id,hour_timestamp" });
      if (upsertErr) console.error("Failed to persist forecast:", upsertErr.message);
    } catch (persistErr) {
      console.error("Persist forecast error:", persistErr);
    }

    const getCorrectedValue = (entry: typeof hourly[number]) => entry.corrected_ai_adjusted_kwh ?? entry.corrected_estimated_kwh;
    const getLegacyValue = (entry: typeof hourly[number]) => entry.legacy_ai_adjusted_kwh ?? entry.legacy_estimated_kwh;

    const berlinNow = new Date().toLocaleString("sv-SE", { timeZone: FORECAST_TIMEZONE });
    const todayStr = berlinNow.slice(0, 10);
    const [tY, tM, tD] = todayStr.split("-").map(Number);
    const tomorrowDt = new Date(tY, tM - 1, tD + 1);
    const tomorrowStrBerlin = `${tomorrowDt.getFullYear()}-${String(tomorrowDt.getMonth() + 1).padStart(2, "0")}-${String(tomorrowDt.getDate()).padStart(2, "0")}`;

    const todayRows = hourly.filter((entry) => entry.timestamp.startsWith(todayStr));
    const tomorrowRows = hourly.filter((entry) => entry.timestamp.startsWith(tomorrowStrBerlin));
    const todayTotal = todayRows.reduce((sum, entry) => sum + getCorrectedValue(entry), 0);
    const tomorrowTotal = tomorrowRows.reduce((sum, entry) => sum + getCorrectedValue(entry), 0);
    const legacyTodayTotal = todayRows.reduce((sum, entry) => sum + getLegacyValue(entry), 0);
    const legacyTomorrowTotal = tomorrowRows.reduce((sum, entry) => sum + getLegacyValue(entry), 0);
    const peakEntry = hourly.reduce((best, entry) => (getCorrectedValue(entry) > getCorrectedValue(best) ? entry : best), hourly[0]);

    const result = {
      location: { name: location.name, city: location.city },
      settings: { peak_power_kwp: peakKwp, tilt_deg: tiltDeg, azimuth_deg: azimuthDeg },
      hourly: hourly.map(({ cell_temp_c, ...rest }) => rest),
      summary: {
        today_total_kwh: Math.round(todayTotal * 10) / 10,
        tomorrow_total_kwh: Math.round(tomorrowTotal * 10) / 10,
        legacy_today_total_kwh: Math.round(legacyTodayTotal * 10) / 10,
        corrected_today_total_kwh: Math.round(todayTotal * 10) / 10,
        legacy_tomorrow_total_kwh: Math.round(legacyTomorrowTotal * 10) / 10,
        corrected_tomorrow_total_kwh: Math.round(tomorrowTotal * 10) / 10,
        peak_hour: peakEntry?.timestamp || null,
        peak_kwh: peakEntry ? Math.round(getCorrectedValue(peakEntry) * 100) / 100 : 0,
        ai_confidence: aiConfidence,
        ai_notes: aiNotes,
        performance_ratio: performanceRatio,
        pr_auto_updated: prAutoUpdated,
        ai_correction_factor: aiCorrectionFactor,
      },
      weather_source: weatherSource,
      validation: {
        dwd_reference: dwdReferenceProfile,
      },
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("pv-forecast error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
