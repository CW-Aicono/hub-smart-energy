import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log("shelly-periodic-sync: Starting sync for all active Shelly integrations...");

  try {
    // 1. Find all enabled Shelly integrations
    const { data: locationIntegrations, error } = await supabase
      .from("location_integrations")
      .select("id, location_id, integration:integrations(type)")
      .eq("is_enabled", true);

    if (error) {
      console.error("Error fetching location integrations:", error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const shellyIntegrations = (locationIntegrations || []).filter(
      (li: any) => li.integration?.type === "shelly_cloud",
    );

    console.log(`Found ${shellyIntegrations.length} active Shelly integrations`);

    if (shellyIntegrations.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active Shelly integrations found", synced: 0, readings: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let totalReadingsWritten = 0;
    const results: Array<{ id: string; success: boolean; readings?: number; error?: string }> = [];

    for (const li of shellyIntegrations) {
      const integrationId = li.id;
      const locationId = (li as any).location_id;

      try {
        // 2. Call shelly-api getSensors
        const response = await fetch(`${supabaseUrl}/functions/v1/shelly-api`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ locationIntegrationId: integrationId, action: "getSensors" }),
        });

        const data = await response.json();

        if (!data.success || !Array.isArray(data.sensors)) {
          console.error(`Shelly sync failed for ${integrationId}:`, data.error);
          results.push({ id: integrationId, success: false, error: data.error || "No sensors" });

          // Log connection error
          if (locationId) {
            const { data: locData } = await supabase.from("locations").select("tenant_id").eq("id", locationId).single();
            if (locData?.tenant_id) {
              const { data: existing } = await supabase
                .from("integration_errors")
                .select("id")
                .eq("location_integration_id", integrationId)
                .eq("error_type", "connection")
                .eq("is_resolved", false)
                .maybeSingle();
              if (!existing) {
                await supabase.from("integration_errors").insert({
                  tenant_id: locData.tenant_id,
                  location_id: locationId,
                  location_integration_id: integrationId,
                  integration_type: "shelly_cloud",
                  error_type: "connection",
                  error_message: data.error || "Sync fehlgeschlagen",
                  severity: "error",
                });
              }
            }
          }
          continue;
        }

        const sensors = data.sensors;
        console.log(`Integration ${integrationId}: ${sensors.length} sensors fetched`);

        // Auto-resolve connection errors on success
        await supabase
          .from("integration_errors")
          .update({ is_resolved: true, resolved_at: new Date().toISOString() })
          .eq("location_integration_id", integrationId)
          .eq("error_type", "connection")
          .eq("is_resolved", false);

        // 3. Find meters linked to this integration
        const { data: linkedMeters } = await supabase
          .from("meters")
          .select("id, sensor_uuid, energy_type, tenant_id")
          .eq("location_integration_id", integrationId)
          .eq("capture_type", "automatic")
          .eq("is_archived", false);

        if (!linkedMeters || linkedMeters.length === 0) {
          results.push({ id: integrationId, success: true, readings: 0 });
          continue;
        }

        // Build sensor lookup
        const sensorMap = new Map<string, any>();
        sensors.forEach((s: any) => sensorMap.set(s.id, s));

        const now = new Date().toISOString();
        const readingsToInsert: any[] = [];

        for (const meter of linkedMeters) {
          if (!meter.sensor_uuid) continue;
          const sensor = sensorMap.get(meter.sensor_uuid);
          if (!sensor) continue;

          // Extract power value in W (or kW converted to kW)
          let powerValue: number | null = null;
          const unit = sensor.unit || "";

          // Primary value
          const rawVal = sensor.rawValue ?? null;
          if (rawVal != null && typeof rawVal === "number" && isFinite(rawVal)) {
            if (unit === "W") {
              powerValue = rawVal / 1000; // Convert W → kW for meter_power_readings
            } else if (unit === "kW") {
              powerValue = rawVal;
            } else if (unit === "MW") {
              powerValue = rawVal * 1000;
            } else {
              // For non-power sensors (e.g. energy counters), skip power recording
              // but still check secondary value
              powerValue = null;
            }
          }

          // If primary is not power, check secondary (e.g. switch with apower)
          if (powerValue === null && sensor.secondaryValue) {
            const secVal = typeof sensor.secondaryValue === "string"
              ? parseFloat(sensor.secondaryValue)
              : sensor.secondaryValue;
            const secUnit = sensor.secondaryUnit || "";
            if (isFinite(secVal)) {
              if (secUnit === "W") {
                powerValue = secVal / 1000;
              } else if (secUnit === "kW") {
                powerValue = secVal;
              }
            }
          }

          if (powerValue != null && isFinite(powerValue)) {
            readingsToInsert.push({
              meter_id: meter.id,
              tenant_id: meter.tenant_id,
              energy_type: meter.energy_type || "strom",
              power_value: powerValue,
              recorded_at: now,
            });
          }
        }

        // 4. Batch insert into meter_power_readings
        if (readingsToInsert.length > 0) {
          const { error: insertError } = await supabase
            .from("meter_power_readings")
            .insert(readingsToInsert);

          if (insertError) {
            console.error(`Failed to insert readings for ${integrationId}:`, insertError.message);
            results.push({ id: integrationId, success: false, error: insertError.message });
            continue;
          }

          totalReadingsWritten += readingsToInsert.length;
          console.log(`Wrote ${readingsToInsert.length} power readings for integration ${integrationId}`);
        }

        results.push({ id: integrationId, success: true, readings: readingsToInsert.length });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`Error syncing Shelly integration ${integrationId}:`, errMsg);
        results.push({ id: integrationId, success: false, error: errMsg });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    console.log(`shelly-periodic-sync: Completed. ${successCount}/${results.length} integrations, ${totalReadingsWritten} readings written.`);

    return new Response(
      JSON.stringify({ success: true, synced: successCount, total: results.length, readings: totalReadingsWritten, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("shelly-periodic-sync fatal error:", errMsg);
    return new Response(
      JSON.stringify({ success: false, error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
