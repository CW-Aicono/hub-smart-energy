import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth validation
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { location_id } = await req.json();
    if (!location_id) throw new Error("location_id is required");

    const supabase = createClient(supabaseUrl, serviceKey);

    // 1. Load location coordinates
    const { data: location, error: locErr } = await supabase
      .from("locations")
      .select("id, name, city, latitude, longitude, tenant_id")
      .eq("id", location_id)
      .single();
    if (locErr || !location) throw new Error("Location not found");
    if (!location.latitude || !location.longitude) throw new Error("Location has no coordinates");

    // 2. Load PV settings
    const { data: settings } = await supabase
      .from("pv_forecast_settings")
      .select("*")
      .eq("location_id", location_id)
      .eq("is_active", true)
      .maybeSingle();

    // If no active PV settings exist for this location, return empty forecast
    if (!settings) {
      return new Response(JSON.stringify({
        location: { name: location.name, city: location.city ?? "" },
        hourly: [],
        summary: { total_kwh: 0, ai_confidence: "", ai_notes: "" },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const peakKwp = settings.peak_power_kwp;
    const tiltDeg = settings.tilt_deg;
    const azimuthDeg = settings.azimuth_deg;

    // 3. Fetch Open-Meteo solar radiation forecast (48h) – now including DNI and temperature
    const meteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&hourly=shortwave_radiation,direct_normal_irradiance,diffuse_radiation,cloud_cover,temperature_2m&timezone=Europe/Berlin&forecast_days=2`;
    const meteoRes = await fetch(meteoUrl);
    if (!meteoRes.ok) throw new Error("Open-Meteo API error");
    const meteo = await meteoRes.json();

    const times: string[] = meteo.hourly.time;
    const ghi: number[] = meteo.hourly.shortwave_radiation;
    const dniRaw: number[] | undefined = meteo.hourly.direct_normal_irradiance;
    const dhi: number[] = meteo.hourly.diffuse_radiation;
    const clouds: number[] = meteo.hourly.cloud_cover;
    const temps: number[] = meteo.hourly.temperature_2m;

    // 4. Auto-PR: Compute effective Performance Ratio from historical data
    let PR = settings.performance_ratio ?? 0.85;
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
          // Fetch stored forecast data for the same period to compare
          const firstDay = history[0].period_start.slice(0, 10);
          const lastDay = history[history.length - 1].period_start.slice(0, 10);

          const { data: forecastHistory } = await supabase
            .from("pv_forecast_hourly")
            .select("forecast_date, estimated_kwh")
            .eq("location_id", location_id)
            .gte("forecast_date", firstDay)
            .lte("forecast_date", lastDay);

          if (forecastHistory && forecastHistory.length > 0) {
            // Sum forecast by day (estimated_kwh uses the stored PR)
            const forecastByDay = new Map<string, number>();
            for (const fh of forecastHistory) {
              const day = fh.forecast_date;
              forecastByDay.set(day, (forecastByDay.get(day) ?? 0) + fh.estimated_kwh);
            }

            // Compare actual vs forecast for matching days
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
              // The stored forecasts used the current PR, so the ratio actual/forecast
              // tells us how much to scale PR
              const ratio = sumActual / sumForecast;
              const newPR = PR * ratio;
              // Clamp PR to a plausible range (0.5 – 0.95)
              PR = Math.max(0.5, Math.min(0.95, Math.round(newPR * 1000) / 1000));
              prAutoUpdated = true;
              console.log(`Auto-PR: ratio=${ratio.toFixed(3)}, newPR=${PR} (${matchedDays} days matched)`);

              // Persist updated PR (fire-and-forget)
              supabase
                .from("pv_forecast_settings")
                .update({ performance_ratio: PR })
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

    // 5. Physical model with tilt, azimuth & temperature correction
    const ALBEDO = 0.2;
    const TEMP_COEFF = -0.004; // −0.4% per °C above 25°C (crystalline silicon)
    const NOCT = 45; // Nominal Operating Cell Temperature
    const deg2rad = (d: number) => (d * Math.PI) / 180;
    const tiltRad = deg2rad(tiltDeg);
    const latRad = deg2rad(location.latitude);

    const dayOfYear = (dateStr: string) => {
      const d = new Date(dateStr);
      const start = new Date(d.getFullYear(), 0, 0);
      return Math.floor((d.getTime() - start.getTime()) / 86400000);
    };

    // Helper: detect if a date is in CEST (last Sunday of March to last Sunday of October)
    const isCEST = (dateStr: string): boolean => {
      const d = new Date(dateStr);
      const year = d.getFullYear();
      const month = d.getMonth(); // 0-indexed
      if (month < 2 || month > 9) return false; // Jan/Feb/Nov/Dec → CET
      if (month > 2 && month < 9) return true;  // Apr–Sep → CEST
      // March (2) or October (9): find last Sunday
      const lastDay = new Date(year, month + 1, 0).getDate();
      let lastSunday = lastDay;
      while (new Date(year, month, lastSunday).getDay() !== 0) lastSunday--;
      const switchDate = new Date(year, month, lastSunday, 2);
      return month === 2 ? d >= switchDate : d < switchDate;
    };

    const hourly = times.map((ts: string, i: number) => {
      const radiationWm2 = ghi[i] ?? 0;
      const diffuseWm2 = dhi[i] ?? 0;

      // Solar declination (Cooper's equation)
      const doy = dayOfYear(ts);
      const declination = deg2rad(23.45 * Math.sin(deg2rad(360 * (284 + doy) / 365)));

      // True Solar Time with DST-aware reference meridian
      const tsParts = ts.match(/T(\d{2}):(\d{2})/);
      const clockHour = tsParts ? parseInt(tsParts[1]) + parseInt(tsParts[2]) / 60 : 12;
      const B = deg2rad(360 * (doy - 81) / 365);
      const EoT = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
      const refMeridian = isCEST(ts) ? 30 : 15; // CEST → 30°E, CET → 15°E
      const longCorrection = 4 * (location.longitude - refMeridian);
      const solarHour = clockHour + (longCorrection + EoT) / 60;
      const hourAngle = deg2rad((solarHour - 12) * 15);

      // Solar altitude angle
      const sinAlt = Math.sin(latRad) * Math.sin(declination)
                    + Math.cos(latRad) * Math.cos(declination) * Math.cos(hourAngle);
      const solarAlt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

      // Solar azimuth angle
      let solarAz = 0;
      if (solarAlt > 0.01) {
        const cosAz = (Math.sin(declination) - Math.sin(solarAlt) * Math.sin(latRad))
                      / (Math.cos(solarAlt) * Math.cos(latRad));
        solarAz = Math.acos(Math.max(-1, Math.min(1, cosAz)));
        if (hourAngle < 0) solarAz = -solarAz;
      }

      const panelAzRad = deg2rad(azimuthDeg - 180);

      // Angle of incidence on tilted surface
      const cosAOI = Math.sin(solarAlt) * Math.cos(tiltRad)
                    + Math.cos(solarAlt) * Math.sin(tiltRad) * Math.cos(solarAz - panelAzRad);

      // DNI: use direct_normal_irradiance from API, or derive from GHI-DHI with correction
      let dniValue: number;
      if (dniRaw && dniRaw[i] != null) {
        dniValue = dniRaw[i];
      } else {
        // Fallback: derive DNI from direct horizontal (GHI - DHI)
        const directHoriz = Math.max(0, radiationWm2 - diffuseWm2);
        const sinAltClamped = Math.max(Math.sin(solarAlt), 0.05);
        dniValue = directHoriz / sinAltClamped;
      }

      // POA irradiance – beam uses DNI directly (not horizontal direct)
      const beam = dniValue * Math.max(0, cosAOI);
      const diffuse = diffuseWm2 * (1 + Math.cos(tiltRad)) / 2;
      const ground = radiationWm2 * ALBEDO * (1 - Math.cos(tiltRad)) / 2;
      const poaWm2 = beam + diffuse + ground;

      // Option 3: Temperature correction
      // Cell temperature estimate: T_cell = T_ambient + (NOCT - 20) / 800 * GHI
      const ambientTemp = temps[i] ?? 25;
      const cellTemp = ambientTemp + ((NOCT - 20) / 800) * radiationWm2;
      const tempFactor = 1 + TEMP_COEFF * (cellTemp - 25); // < 1 when hot, > 1 when cold

      const estimatedKwh = (poaWm2 * peakKwp * PR * Math.max(0.5, tempFactor)) / 1000;

      return {
        timestamp: ts,
        radiation_w_m2: radiationWm2,
        cloud_cover_pct: clouds[i] ?? 0,
        estimated_kwh: Math.round(estimatedKwh * 100) / 100,
        ai_adjusted_kwh: null as number | null,
        cell_temp_c: Math.round(cellTemp * 10) / 10,
      };
    });

    // 6. AI calibration (optional) — only if historical data exists AND LOVABLE_API_KEY is set
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let aiNotes = "";
    let aiConfidence = "";

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
          .filter((h) => h.estimated_kwh > 0)
          .slice(0, 24)
          .map((h) => `${h.timestamp}: ${h.estimated_kwh} kWh (GHI ${h.radiation_w_m2} W/m², Zelle ${h.cell_temp_c}°C)`)
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
                  content: `Du bist ein PV-Prognose-Experte. Du erhältst historische Tageserzeugung einer PV-Anlage (${peakKwp} kWp, Neigung ${tiltDeg}°, Azimut ${azimuthDeg}°, PR=${PR}) und eine physikalische Prognose mit Temperaturkorrektur. Berechne einen Korrekturfaktor. WICHTIG: Der Faktor muss zwischen 0.5 und 1.5 liegen.`,
                },
                {
                  role: "user",
                  content: `Historische Tageserzeugung (letzte 30 Tage):\n${histSummary}\n\nPhysikalische Prognose (nächste 24h, inkl. Temperaturkorrektur):\n${forecastSummary}\n\nBitte antworte NUR mit einem JSON-Objekt: { "correction_factor": <number zwischen 0.5 und 1.5>, "confidence": "<hoch|mittel|niedrig>", "notes": "<kurzer Satz>" }`,
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

              // Option 1: CLAMP correction factor to [0.5, 1.5]
              const rawFactor = factor;
              factor = Math.max(0.5, Math.min(1.5, factor));
              if (rawFactor !== factor) {
                console.log(`AI correction factor clamped: ${rawFactor} → ${factor}`);
              }

              aiConfidence = args.confidence || "";
              aiNotes = args.notes || "";

              // Apply clamped correction factor
              for (const h of hourly) {
                h.ai_adjusted_kwh = Math.round(h.estimated_kwh * factor * 100) / 100;
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

    // 7. Persist forecast hourly data (upsert, fire-and-forget)
    try {
      const rows = hourly.map((h: any) => ({
        tenant_id: location.tenant_id,
        location_id: location_id,
        forecast_date: h.timestamp.slice(0, 10),
        hour_timestamp: h.timestamp,
        radiation_w_m2: h.radiation_w_m2,
        cloud_cover_pct: h.cloud_cover_pct,
        estimated_kwh: h.estimated_kwh,
        ai_adjusted_kwh: h.ai_adjusted_kwh,
        peak_power_kwp: peakKwp,
      }));
      const { error: upsertErr } = await supabase
        .from("pv_forecast_hourly")
        .upsert(rows, { onConflict: "location_id,hour_timestamp" });
      if (upsertErr) console.error("Failed to persist forecast:", upsertErr.message);
    } catch (persistErr) {
      console.error("Persist forecast error:", persistErr);
    }

    // 8. Build summary – use Europe/Berlin date to match Open-Meteo timestamps
    const getValue = (h: typeof hourly[0]) => h.ai_adjusted_kwh ?? h.estimated_kwh;

    const berlinNow = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Berlin" });
    const todayStr = berlinNow.slice(0, 10);
    const [tY, tM, tD] = todayStr.split("-").map(Number);
    const tomorrowDt = new Date(tY, tM - 1, tD + 1);
    const tomorrowStrBerlin = `${tomorrowDt.getFullYear()}-${String(tomorrowDt.getMonth() + 1).padStart(2, "0")}-${String(tomorrowDt.getDate()).padStart(2, "0")}`;

    const todayTotal = hourly
      .filter((h) => h.timestamp.startsWith(todayStr))
      .reduce((s, h) => s + getValue(h), 0);
    const tomorrowTotal = hourly
      .filter((h) => h.timestamp.startsWith(tomorrowStrBerlin))
      .reduce((s, h) => s + getValue(h), 0);

    const peakEntry = hourly.reduce((best, h) => (getValue(h) > getValue(best) ? h : best), hourly[0]);

    const result = {
      location: { name: location.name, city: location.city },
      settings: { peak_power_kwp: peakKwp, tilt_deg: tiltDeg, azimuth_deg: azimuthDeg },
      hourly: hourly.map(({ cell_temp_c, ...rest }) => rest), // exclude internal field from response
      summary: {
        today_total_kwh: Math.round(todayTotal * 10) / 10,
        tomorrow_total_kwh: Math.round(tomorrowTotal * 10) / 10,
        peak_hour: peakEntry?.timestamp || null,
        peak_kwh: peakEntry ? Math.round(getValue(peakEntry) * 100) / 100 : 0,
        ai_confidence: aiConfidence,
        ai_notes: aiNotes,
        performance_ratio: PR,
        pr_auto_updated: prAutoUpdated,
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
