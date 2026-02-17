import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BRIGHTHUB_API_URL =
  "https://jcewrsouppdsvaipdpsy.supabase.co/functions/v1/energy-api";

async function callBrightHub(
  action: string,
  body: Record<string, unknown>,
  apiKey: string,
  maxRetries = 3
) {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(`${BRIGHTHUB_API_URL}?action=${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-energy-api-key": apiKey,
        },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || "BrightHub API error");
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

function mapEnergyType(energyType: string): string {
  const map: Record<string, string> = {
    electricity: "electricity",
    strom: "electricity",
    gas: "gas",
    water: "water",
    wasser: "water",
    district_heating: "district_heating",
    fernwaerme: "district_heating",
    fernwärme: "district_heating",
  };
  return map[energyType?.toLowerCase()] || "other";
}

function mapUnit(unit: string): string {
  const allowed = ["kWh", "MWh", "m³", "Liter", "GJ"];
  if (allowed.includes(unit)) return unit;
  const map: Record<string, string> = {
    kwh: "kWh",
    mwh: "MWh",
    "m3": "m³",
    liter: "Liter",
    l: "Liter",
    gj: "GJ",
  };
  return map[unit?.toLowerCase()] || "kWh";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Accept optional action + locationId for manual triggers
    let action = "all";
    let targetLocationId: string | null = null;
    try {
      const body = await req.json();
      if (body.action) action = body.action;
      if (body.locationId) targetLocationId = body.locationId;
    } catch {
      // No body = cron call, run all
    }

    // Get all enabled BrightHub settings
    let settingsQuery = supabase
      .from("brighthub_settings")
      .select("*")
      .eq("is_enabled", true);

    if (targetLocationId) {
      settingsQuery = settingsQuery.eq("location_id", targetLocationId);
    }

    const { data: allSettings, error: settingsErr } = await settingsQuery;

    if (settingsErr) {
      console.error("Error fetching brighthub_settings:", settingsErr);
      return new Response(
        JSON.stringify({ success: false, error: settingsErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!allSettings || allSettings.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No enabled BrightHub locations found", results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: unknown[] = [];

    for (const settings of allSettings) {
      if (!settings.api_key || !settings.location_id) continue;

      const locationResult: Record<string, unknown> = {
        location_id: settings.location_id,
      };

      try {
        // ── SYNC METERS ──
        if (action === "all" || action === "sync_meters") {
          const { data: meters } = await supabase
            .from("meters")
            .select("id, name, energy_type, unit, meter_number, notes, is_archived")
            .eq("location_id", settings.location_id)
            .eq("is_archived", false);

          if (meters && meters.length > 0) {
            const metersPayload = meters.map((m) => ({
              external_id: m.id,
              name: m.name,
              type: mapEnergyType(m.energy_type),
              unit: mapUnit(m.unit),
              location_description: m.notes || undefined,
            }));

            const meterResult = await callBrightHub(
              "sync_meters",
              { meters: metersPayload },
              settings.api_key
            );

            locationResult.meters = {
              sent: metersPayload.length,
              summary: meterResult.summary || meterResult.data,
            };

            await supabase
              .from("brighthub_settings")
              .update({ last_meter_sync_at: new Date().toISOString() } as any)
              .eq("id", settings.id);
          } else {
            locationResult.meters = { sent: 0, message: "No meters found" };
          }
        }

        // ── SYNC READINGS (daily consumption) ──
        if (action === "all" || action === "sync_readings") {
          const { data: meters } = await supabase
            .from("meters")
            .select("id, name, energy_type, unit")
            .eq("location_id", settings.location_id)
            .eq("is_archived", false);

          if (!meters || meters.length === 0) {
            locationResult.readings = { sent: 0, message: "No meters found" };
          } else {
            const readings: { meter_id: string; reading_date: string; value: number }[] = [];
            const sinceDate = settings.last_reading_sync_at || "2000-01-01T00:00:00Z";

            for (const meter of meters) {
              const { data: powerReadings } = await supabase
                .from("meter_power_readings")
                .select("power_value, recorded_at")
                .eq("meter_id", meter.id)
                .gt("recorded_at", sinceDate)
                .order("recorded_at", { ascending: false })
                .limit(1);

              if (powerReadings && powerReadings.length > 0) {
                for (const pr of powerReadings) {
                  readings.push({
                    meter_id: meter.id,
                    reading_date: pr.recorded_at.substring(0, 10),
                    value: pr.power_value,
                  });
                }
                continue;
              }

              const { data: manualReadings } = await supabase
                .from("meter_readings")
                .select("value, reading_date, notes")
                .eq("meter_id", meter.id)
                .gt("reading_date", sinceDate)
                .order("reading_date", { ascending: false })
                .limit(1);

              if (manualReadings && manualReadings.length > 0) {
                for (const mr of manualReadings) {
                  readings.push({
                    meter_id: meter.id,
                    reading_date: mr.reading_date.substring(0, 10),
                    value: mr.value,
                  });
                }
              }
            }

            if (readings.length > 0) {
              for (let i = 0; i < readings.length; i += 1000) {
                const chunk = readings.slice(i, i + 1000);
                await callBrightHub("bulk_readings", { readings: chunk }, settings.api_key);
              }
              locationResult.readings = { sent: readings.length };
              await supabase
                .from("brighthub_settings")
                .update({ last_reading_sync_at: new Date().toISOString() } as any)
                .eq("id", settings.id);
            } else {
              locationResult.readings = { sent: 0, message: "No new readings" };
            }
          }
        }

        // ── SYNC INTRADAY (power readings in kW) ──
        if (action === "all" || action === "sync_intraday") {
          const { data: meters } = await supabase
            .from("meters")
            .select("id")
            .eq("location_id", settings.location_id)
            .eq("is_archived", false);

          if (!meters || meters.length === 0) {
            locationResult.intraday = { sent: 0, message: "No meters found" };
          } else {
            const sinceDate = settings.last_intraday_sync_at || "2000-01-01T00:00:00Z";
            const intradayReadings: { meter_id: string; timestamp: string; power_value: number }[] = [];

            for (const meter of meters) {
              const { data: pwr } = await supabase
                .from("meter_power_readings")
                .select("power_value, recorded_at")
                .eq("meter_id", meter.id)
                .gt("recorded_at", sinceDate)
                .order("recorded_at", { ascending: true })
                .limit(5000);

              if (pwr && pwr.length > 0) {
                for (const r of pwr) {
                  intradayReadings.push({
                    meter_id: meter.id,
                    timestamp: r.recorded_at,
                    power_value: r.power_value,
                  });
                }
              }
            }

            if (intradayReadings.length > 0) {
              for (let i = 0; i < intradayReadings.length; i += 5000) {
                const chunk = intradayReadings.slice(i, i + 5000);
                await callBrightHub("bulk_intraday", { readings: chunk }, settings.api_key);
              }
              locationResult.intraday = { sent: intradayReadings.length };
              await supabase
                .from("brighthub_settings")
                .update({ last_intraday_sync_at: new Date().toISOString() } as any)
                .eq("id", settings.id);
            } else {
              locationResult.intraday = { sent: 0, message: "No new power readings" };
            }
          }
        }
      } catch (locErr) {
        const msg = locErr instanceof Error ? locErr.message : String(locErr);
        locationResult.error = msg;
        console.error(`Error syncing location ${settings.location_id}:`, msg);
      }

      results.push(locationResult);
    }

    console.log("brighthub-periodic-sync results:", JSON.stringify(results));

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    console.error("brighthub-periodic-sync error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
