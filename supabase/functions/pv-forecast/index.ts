import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { location_id } = await req.json();
    if (!location_id) throw new Error("location_id is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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

    // 3. Fetch Open-Meteo solar radiation forecast (48h)
    const meteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&hourly=shortwave_radiation,direct_radiation,diffuse_radiation,cloud_cover&timezone=Europe/Berlin&forecast_days=2`;
    const meteoRes = await fetch(meteoUrl);
    if (!meteoRes.ok) throw new Error("Open-Meteo API error");
    const meteo = await meteoRes.json();

    const times: string[] = meteo.hourly.time;
    const ghi: number[] = meteo.hourly.shortwave_radiation;
    const dhi: number[] = meteo.hourly.diffuse_radiation;
    const clouds: number[] = meteo.hourly.cloud_cover;

    // 4. Physical model with tilt & azimuth correction
    // Uses a simplified transposition model: POA = DNI * cos(AOI) + DHI * (1+cos(tilt))/2
    // where DNI ≈ GHI - DHI, and AOI depends on solar position + panel orientation.
    const PR = settings.performance_ratio ?? 0.85;
    const ALBEDO = 0.2;
    const deg2rad = (d: number) => (d * Math.PI) / 180;
    const tiltRad = deg2rad(tiltDeg);
    const latRad = deg2rad(location.latitude);

    // Day of year helper
    const dayOfYear = (dateStr: string) => {
      const d = new Date(dateStr);
      const start = new Date(d.getFullYear(), 0, 0);
      return Math.floor((d.getTime() - start.getTime()) / 86400000);
    };

    const hourly = times.map((ts: string, i: number) => {
      const radiationWm2 = ghi[i] ?? 0;
      const diffuseWm2 = dhi[i] ?? 0;
      const directWm2 = Math.max(0, radiationWm2 - diffuseWm2);

      // Solar declination (Cooper's equation)
      const doy = dayOfYear(ts);
      const declination = deg2rad(23.45 * Math.sin(deg2rad(360 * (284 + doy) / 365)));

      // True Solar Time correction
      // 1. Parse hour from timestamp (Open-Meteo returns CET strings like "2026-03-03T12:00")
      const tsParts = ts.match(/T(\d{2}):(\d{2})/);
      const clockHour = tsParts ? parseInt(tsParts[1]) + parseInt(tsParts[2]) / 60 : 12;

      // 2. Equation of Time (Spencer, 1971) in minutes
      const B = deg2rad(360 * (doy - 81) / 365);
      const EoT = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);

      // 3. Longitude correction: CET reference meridian = 15°E, 4 min per degree
      const longCorrection = 4 * (location.longitude - 15);

      // 4. Solar hour = clock hour + corrections (in hours)
      const solarHour = clockHour + (longCorrection + EoT) / 60;
      const hourAngle = deg2rad((solarHour - 12) * 15);

      // Solar altitude angle
      const sinAlt = Math.sin(latRad) * Math.sin(declination)
                    + Math.cos(latRad) * Math.cos(declination) * Math.cos(hourAngle);
      const solarAlt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

      // Solar azimuth angle (measured from south, positive west)
      let solarAz = 0;
      if (solarAlt > 0.01) {
        const cosAz = (Math.sin(declination) - Math.sin(solarAlt) * Math.sin(latRad))
                      / (Math.cos(solarAlt) * Math.cos(latRad));
        solarAz = Math.acos(Math.max(-1, Math.min(1, cosAz)));
        if (hourAngle < 0) solarAz = -solarAz; // morning = east = negative
      }

      // Panel azimuth: convert compass bearing (0°=N, 180°=S) to south-reference (0°=S)
      const panelAzRad = deg2rad(azimuthDeg - 180);

      // Angle of incidence on tilted surface
      const cosAOI = Math.sin(solarAlt) * Math.cos(tiltRad)
                    + Math.cos(solarAlt) * Math.sin(tiltRad) * Math.cos(solarAz - panelAzRad);

      // Plane-of-array irradiance (beam + diffuse + ground-reflected)
      const beam = directWm2 * Math.max(0, cosAOI);
      const diffuse = diffuseWm2 * (1 + Math.cos(tiltRad)) / 2;
      const ground = radiationWm2 * ALBEDO * (1 - Math.cos(tiltRad)) / 2;
      const poaWm2 = beam + diffuse + ground;

      const estimatedKwh = (poaWm2 * peakKwp * PR) / 1000;

      return {
        timestamp: ts,
        radiation_w_m2: radiationWm2,
        cloud_cover_pct: clouds[i] ?? 0,
        estimated_kwh: Math.round(estimatedKwh * 100) / 100,
        ai_adjusted_kwh: null as number | null,
      };
    });

    // 5. AI calibration (optional) — only if historical data exists AND LOVABLE_API_KEY is set
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let aiNotes = "";
    let aiConfidence = "";

    if (settings?.pv_meter_id && LOVABLE_API_KEY) {
      // Fetch last 30 days of daily PV generation
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: history } = await supabase
        .from("meter_period_totals")
        .select("period_start, total_value")
        .eq("meter_id", settings.pv_meter_id)
        .eq("period_type", "day")
        .gte("period_start", since)
        .order("period_start", { ascending: true });

      if (history && history.length >= 5) {
        // Summarize for AI
        const histSummary = history.map((h: any) => `${h.period_start}: ${h.total_value} kWh`).join("\n");
        const forecastSummary = hourly
          .filter((h) => h.estimated_kwh > 0)
          .slice(0, 24)
          .map((h) => `${h.timestamp}: ${h.estimated_kwh} kWh (GHI ${h.radiation_w_m2} W/m²)`)
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
                  content: `Du bist ein PV-Prognose-Experte. Du erhältst historische Tageserzeugung einer PV-Anlage (${peakKwp} kWp, Neigung ${tiltDeg}°, Azimut ${azimuthDeg}°) und eine physikalische Prognose basierend auf Strahlungsdaten. Berechne einen Korrekturfaktor und gib eine kalibrierte Prognose zurück.`,
                },
                {
                  role: "user",
                  content: `Historische Tageserzeugung (letzte 30 Tage):\n${histSummary}\n\nPhysikalische Prognose (nächste 24h):\n${forecastSummary}\n\nBitte antworte NUR mit einem JSON-Objekt: { "correction_factor": <number>, "confidence": "<hoch|mittel|niedrig>", "notes": "<kurzer Satz>" }`,
                },
              ],
              tools: [
                {
                  type: "function",
                  function: {
                    name: "pv_calibration",
                    description: "Return calibration factor for PV forecast",
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
              const factor = Number(args.correction_factor) || 1;
              aiConfidence = args.confidence || "";
              aiNotes = args.notes || "";

              // Apply correction factor
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

    // 6. Persist forecast hourly data (upsert, fire-and-forget)
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

    // 7. Build summary – use Europe/Berlin date to match Open-Meteo timestamps
    const getValue = (h: typeof hourly[0]) => h.ai_adjusted_kwh ?? h.estimated_kwh;

    // Open-Meteo returns timestamps in Europe/Berlin timezone, so we must
    // derive "today" and "tomorrow" in that same timezone for correct filtering.
    const berlinNow = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Berlin" });
    const todayStr = berlinNow.slice(0, 10); // "YYYY-MM-DD"
    const tomorrowDate = new Date(berlinNow);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = tomorrowDate.toISOString().slice(0, 10);
    // Safer: compute tomorrow from the Berlin date string
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
      hourly,
      summary: {
        today_total_kwh: Math.round(todayTotal * 10) / 10,
        tomorrow_total_kwh: Math.round(tomorrowTotal * 10) / 10,
        peak_hour: peakEntry?.timestamp || null,
        peak_kwh: peakEntry ? Math.round(getValue(peakEntry) * 100) / 100 : 0,
        ai_confidence: aiConfidence,
        ai_notes: aiNotes,
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
