import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { decrypt } from "../_shared/crypto.ts";

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

/** Fetch a map of energy_type -> current price_per_unit for a location */
async function fetchEnergyPriceMap(
  supabase: any,
  locationId: string
): Promise<Map<string, number>> {
  const today = new Date().toISOString().substring(0, 10);
  const { data: prices } = await supabase
    .from("energy_prices")
    .select("energy_type, price_per_unit, valid_from, valid_until")
    .eq("location_id", locationId)
    .lte("valid_from", today)
    .or(`valid_until.is.null,valid_until.gte.${today}`);

  const priceMap = new Map<string, number>();
  if (prices) {
    for (const p of prices) {
      if (!priceMap.has(p.energy_type)) {
        priceMap.set(p.energy_type, p.price_per_unit);
      }
    }
  }
  return priceMap;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
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

    const encKey = Deno.env.get("BRIGHTHUB_ENCRYPTION_KEY");

    for (const settings of allSettings) {
      if (!settings.api_key || !settings.location_id) continue;

      // Decrypt api_key (backwards-compatible)
      const apiKey = encKey ? await decrypt(settings.api_key, encKey) : settings.api_key;

      const locationResult: Record<string, unknown> = {
        location_id: settings.location_id,
      };

      // Pre-fetch current energy prices for this location
      const priceMap = await fetchEnergyPriceMap(supabase, settings.location_id);

      try {
        // ── SYNC METERS ──
        if (action === "all" || action === "sync_meters") {
          const { data: meters } = await supabase
            .from("meters")
            .select("id, name, energy_type, unit, meter_number, notes, room_id, floor_rooms(name)")
            .eq("location_id", settings.location_id)
            .eq("is_archived", false);

          if (meters && meters.length > 0) {
            const metersPayload = (meters as any[]).map((m) => {
              const roomName = m.floor_rooms?.name || null;
              const locationDescription = roomName || m.notes || undefined;
              const entry: Record<string, unknown> = {
                external_id: m.id,
                name: m.name,
                type: mapEnergyType(m.energy_type),
                unit: mapUnit(m.unit),
              };
              if (locationDescription) entry.location_description = locationDescription;
              const costPerUnit = priceMap.get(m.energy_type);
              if (costPerUnit !== undefined) entry.cost_per_unit = costPerUnit;
              return entry;
            });

            const meterResult = await callBrightHub(
              "sync_meters",
              { meters: metersPayload },
              apiKey
            );

            locationResult.meters = {
              sent: metersPayload.length,
              count: meterResult.count,
              meters_created: meterResult.meters_created,
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
            .select("id, energy_type, notes, room_id, floor_rooms(name)")
            .eq("location_id", settings.location_id)
            .eq("is_archived", false);

          if (!meters || meters.length === 0) {
            locationResult.readings = { sent: 0, message: "No meters found" };
          } else {
            const readings: Record<string, unknown>[] = [];
            const sinceDate = settings.last_reading_sync_at || "2000-01-01T00:00:00Z";

            for (const meter of (meters as any[])) {
              const costPerUnit = priceMap.get(meter.energy_type);
              const roomName = meter.floor_rooms?.name || null;
              const locationDescription = roomName || meter.notes || undefined;

              const { data: powerReadings } = await supabase
                .from("meter_power_readings")
                .select("power_value, recorded_at")
                .eq("meter_id", meter.id)
                .gt("recorded_at", sinceDate)
                .order("recorded_at", { ascending: false })
                .limit(1);

              if (powerReadings && powerReadings.length > 0) {
                for (const pr of powerReadings) {
                  const entry: Record<string, unknown> = {
                    meter_id: meter.id,
                    reading_date: pr.recorded_at.substring(0, 10),
                    value: pr.power_value,
                  };
                  if (locationDescription) entry.location_description = locationDescription;
                  if (costPerUnit !== undefined) entry.cost_per_unit = costPerUnit;
                  readings.push(entry);
                }
                continue;
              }

              const { data: manualReadings } = await supabase
                .from("meter_readings")
                .select("value, reading_date")
                .eq("meter_id", meter.id)
                .gt("reading_date", sinceDate)
                .order("reading_date", { ascending: false })
                .limit(1);

              if (manualReadings && manualReadings.length > 0) {
                for (const mr of manualReadings) {
                  const entry: Record<string, unknown> = {
                    meter_id: meter.id,
                    reading_date: mr.reading_date.substring(0, 10),
                    value: mr.value,
                  };
                  if (locationDescription) entry.location_description = locationDescription;
                  if (costPerUnit !== undefined) entry.cost_per_unit = costPerUnit;
                  readings.push(entry);
                }
              }
            }

            if (readings.length > 0) {
              let totalCount = 0;
              // Chunk into max 1,000 per call as per API spec
              for (let i = 0; i < readings.length; i += 1000) {
                const chunk = readings.slice(i, i + 1000);
                const apiResult = await callBrightHub("bulk_readings", { readings: chunk }, apiKey);
                totalCount += apiResult.count ?? chunk.length;
              }
              locationResult.readings = { sent: readings.length, count: totalCount };
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
            .select("id, energy_type, notes, room_id, floor_rooms(name)")
            .eq("location_id", settings.location_id)
            .eq("is_archived", false);

          if (!meters || meters.length === 0) {
            locationResult.intraday = { sent: 0, message: "No meters found" };
          } else {
            const sinceDate = settings.last_intraday_sync_at || "2000-01-01T00:00:00Z";
            const intradayReadings: Record<string, unknown>[] = [];

            for (const meter of (meters as any[])) {
              const costPerUnit = priceMap.get(meter.energy_type);
              const roomName = meter.floor_rooms?.name || null;
              const locationDescription = roomName || meter.notes || undefined;

              const { data: pwr } = await supabase
                .from("meter_power_readings")
                .select("power_value, recorded_at")
                .eq("meter_id", meter.id)
                .gt("recorded_at", sinceDate)
                .order("recorded_at", { ascending: true })
                .limit(5000);

              if (pwr && pwr.length > 0) {
                for (const r of pwr) {
                  const entry: Record<string, unknown> = {
                    meter_id: meter.id,
                    timestamp: r.recorded_at,
                    power_value: r.power_value,
                  };
                  if (locationDescription) entry.location_description = locationDescription;
                  if (costPerUnit !== undefined) entry.cost_per_unit = costPerUnit;
                  intradayReadings.push(entry);
                }
              }
            }

            if (intradayReadings.length > 0) {
              let totalCount = 0;
              // Chunk into max 5,000 per call as per API spec
              for (let i = 0; i < intradayReadings.length; i += 5000) {
                const chunk = intradayReadings.slice(i, i + 5000);
                const apiResult = await callBrightHub("bulk_intraday", { readings: chunk }, apiKey);
                totalCount += apiResult.count ?? chunk.length;
              }
              locationResult.intraday = { sent: intradayReadings.length, count: totalCount };
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
