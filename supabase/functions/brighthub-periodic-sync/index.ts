import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function computeSignature(body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all enabled BrightHub settings with auto_sync
    const { data: allSettings, error: settingsErr } = await supabase
      .from("brighthub_settings")
      .select("*")
      .eq("is_enabled", true)
      .eq("auto_sync_readings", true);

    if (settingsErr) {
      console.error("Error fetching brighthub_settings:", settingsErr);
      return new Response(
        JSON.stringify({ success: false, error: settingsErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!allSettings || allSettings.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No enabled BrightHub locations found", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalSent = 0;
    const errors: string[] = [];

    for (const settings of allSettings) {
      if (!settings.api_key || !settings.webhook_secret || !settings.location_id) {
        continue;
      }

      try {
        // Get all meters for this location
        const { data: meters } = await supabase
          .from("meters")
          .select("id, name, energy_type, unit, meter_number")
          .eq("location_id", settings.location_id)
          .eq("is_archived", false);

        if (!meters || meters.length === 0) continue;

        const readingsPayload: unknown[] = [];

        for (const meter of meters) {
          // Try meter_power_readings first (live/automatic meters)
          const { data: powerReading } = await supabase
            .from("meter_power_readings")
            .select("power_value, recorded_at, energy_type")
            .eq("meter_id", meter.id)
            .order("recorded_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (powerReading) {
            readingsPayload.push({
              meter_id: meter.id,
              meter_name: meter.name,
              meter_number: meter.meter_number,
              energy_type: meter.energy_type,
              unit: meter.unit,
              value: powerReading.power_value,
              reading_date: powerReading.recorded_at,
              source: "power_reading",
            });
            continue;
          }

          // Fallback to meter_readings (manual)
          const { data: reading } = await supabase
            .from("meter_readings")
            .select("value, reading_date")
            .eq("meter_id", meter.id)
            .order("reading_date", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (reading) {
            readingsPayload.push({
              meter_id: meter.id,
              meter_name: meter.name,
              meter_number: meter.meter_number,
              energy_type: meter.energy_type,
              unit: meter.unit,
              value: reading.value,
              reading_date: reading.reading_date,
              source: "manual_reading",
            });
          }
        }

        if (readingsPayload.length === 0) continue;

        // Send each reading as individual webhook
        const webhookUrl = settings.webhook_url || undefined;
        const FALLBACK_URL = "https://jcewrsouppdsvaipdpsy.supabase.co/functions/v1/energy-api?action=webhook";
        const url = webhookUrl || FALLBACK_URL;

        for (const reading of readingsPayload) {
          const body = JSON.stringify({
            event: "reading.created",
            data: reading,
          });

          const signature = await computeSignature(body, settings.webhook_secret);

          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-energy-api-key": settings.api_key,
              "x-energy-webhook-signature": signature,
            },
            body,
          });

          if (!response.ok) {
            const errText = await response.text();
            errors.push(`Location ${settings.location_id}, meter ${(reading as any).meter_id}: HTTP ${response.status} - ${errText}`);
          } else {
            totalSent++;
          }
        }
        console.log(`Sent ${readingsPayload.length} readings for location ${settings.location_id}`);
      } catch (locErr) {
        const msg = locErr instanceof Error ? locErr.message : String(locErr);
        errors.push(`Location ${settings.location_id}: ${msg}`);
        console.error(`Error syncing location ${settings.location_id}:`, msg);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: totalSent,
        locations: allSettings.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
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
