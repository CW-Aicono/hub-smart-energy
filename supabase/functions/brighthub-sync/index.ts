import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BRIGHTHUB_API_URL =
  "https://jcewrsouppdsvaipdpsy.supabase.co/functions/v1/energy-api";

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
    kwh: "kWh", mwh: "MWh", "m3": "m³", liter: "Liter", l: "Liter", gj: "GJ",
  };
  return map[unit?.toLowerCase()] || "kWh";
}

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, tenantId, locationId } = await req.json();

    // Get BrightHub settings for the tenant + location
    const { data: settings, error: settingsErr } = await supabase
      .from("brighthub_settings")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("location_id", locationId)
      .maybeSingle();

    if (settingsErr || !settings) {
      return new Response(
        JSON.stringify({ success: false, error: "BrightHub nicht konfiguriert" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!settings.api_key) {
      return new Response(
        JSON.stringify({ success: false, error: "BrightHub API-Key fehlt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result: unknown;

    if (action === "sync_meters") {
      // Fetch all active meters for the location
      const { data: meters } = await supabase
        .from("meters")
        .select("id, name, energy_type, unit, meter_number, notes")
        .eq("location_id", locationId)
        .eq("is_archived", false);

      if (!meters || meters.length === 0) {
        return new Response(
          JSON.stringify({ success: true, data: { sent: 0, message: "Keine Zähler gefunden" } }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const metersPayload = meters.map((m) => ({
        external_id: m.id,
        name: m.name,
        type: mapEnergyType(m.energy_type),
        unit: mapUnit(m.unit),
        location_description: m.notes || undefined,
      }));

      const apiResult = await callBrightHub("sync_meters", { meters: metersPayload }, settings.api_key);

      // Update last_meter_sync_at
      await supabase
        .from("brighthub_settings")
        .update({ last_meter_sync_at: new Date().toISOString() } as any)
        .eq("id", settings.id);

      result = { sent: metersPayload.length, summary: apiResult.summary || apiResult.data };

    } else if (action === "sync_readings") {
      // Fetch readings since last sync
      const sinceDate = settings.last_reading_sync_at || "2000-01-01T00:00:00Z";

      const { data: meters } = await supabase
        .from("meters")
        .select("id")
        .eq("location_id", locationId)
        .eq("is_archived", false);

      if (!meters || meters.length === 0) {
        return new Response(
          JSON.stringify({ success: true, data: { sent: 0, message: "Keine Zähler gefunden" } }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const readings: { meter_id: string; reading_date: string; value: number }[] = [];

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
          .select("value, reading_date")
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
        const apiResult = await callBrightHub("bulk_readings", { readings }, settings.api_key);
        result = { sent: readings.length, data: apiResult.data, count: apiResult.count };
      } else {
        result = { sent: 0, message: "Keine neuen Messwerte" };
      }

      // Update last_reading_sync_at
      await supabase
        .from("brighthub_settings")
        .update({ last_reading_sync_at: new Date().toISOString() } as any)
        .eq("id", settings.id);

    } else if (action === "sync_intraday") {
      // Fetch all power readings since last intraday sync
      const sinceDate = settings.last_intraday_sync_at || "2000-01-01T00:00:00Z";

      const { data: meters } = await supabase
        .from("meters")
        .select("id")
        .eq("location_id", locationId)
        .eq("is_archived", false);

      if (!meters || meters.length === 0) {
        return new Response(
          JSON.stringify({ success: true, data: { sent: 0, message: "Keine Zähler gefunden" } }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

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
        result = { sent: intradayReadings.length };
      } else {
        result = { sent: 0, message: "Keine neuen Leistungswerte" };
      }

      // Update last_intraday_sync_at
      await supabase
        .from("brighthub_settings")
        .update({ last_intraday_sync_at: new Date().toISOString() } as any)
        .eq("id", settings.id);

    } else {
      return new Response(
        JSON.stringify({ success: false, error: `Unbekannte Aktion: ${action}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    console.error("brighthub-sync error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
