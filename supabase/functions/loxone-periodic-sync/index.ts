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

  console.log("loxone-periodic-sync: Starting sync for all active Loxone integrations...");

  try {
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

    const loxoneIntegrations = (locationIntegrations || []).filter(
      (li: any) => li.integration?.type === "loxone" || li.integration?.type === "loxone_miniserver"
    );

    console.log(`Found ${loxoneIntegrations.length} active Loxone integrations`);

    if (loxoneIntegrations.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active Loxone integrations found", synced: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{ id: string; success: boolean; error?: string }> = [];

    for (const li of loxoneIntegrations) {
      const integrationId = li.id;
      const locationId = (li as any).location_id;
      const integrationType = (li.integration as any)?.type || "loxone";
      console.log(`Syncing integration: ${integrationId}`);

      try {
        const response = await fetch(
          `${supabaseUrl}/functions/v1/loxone-api`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              locationIntegrationId: integrationId,
              action: "getSensors",
            }),
          }
        );

        const data = await response.json();

        if (data.success) {
          const sensors = data.sensors || [];
          const offlineSensors = sensors.filter((s: any) => s.status === "offline");
          const onlineSensors = sensors.filter((s: any) => s.status !== "offline");
          console.log(`Successfully synced integration ${integrationId}: ${sensors.length} sensors (${offlineSensors.length} offline)`);
          results.push({ id: integrationId, success: true });

          // Get tenant_id for error logging
          let tenantId: string | null = null;
          if (locationId) {
            const { data: locData } = await supabase
              .from("locations")
              .select("tenant_id")
              .eq("id", locationId)
              .single();
            tenantId = locData?.tenant_id || null;
          }

          // Auto-resolve connection-level errors (sync itself succeeded)
          await supabase
            .from("integration_errors")
            .update({ is_resolved: true, resolved_at: new Date().toISOString() })
            .eq("location_integration_id", integrationId)
            .eq("is_resolved", false)
            .eq("error_type", "connection");

          // Auto-resolve data errors for sensors that are now online again
          if (onlineSensors.length > 0) {
            const onlineNames = onlineSensors.map((s: any) => s.name);
            // Resolve errors whose sensor_name is now online
            const { data: activeDataErrors } = await supabase
              .from("integration_errors")
              .select("id, sensor_name")
              .eq("location_integration_id", integrationId)
              .eq("is_resolved", false)
              .eq("error_type", "data");

            if (activeDataErrors && activeDataErrors.length > 0) {
              const toResolve = activeDataErrors
                .filter((e: any) => e.sensor_name && onlineNames.includes(e.sensor_name))
                .map((e: any) => e.id);
              if (toResolve.length > 0) {
                await supabase
                  .from("integration_errors")
                  .update({ is_resolved: true, resolved_at: new Date().toISOString() })
                  .in("id", toResolve);
                console.log(`Auto-resolved ${toResolve.length} sensor data errors`);
              }
            }
          }

          // Log offline sensors as data errors
          if (tenantId && offlineSensors.length > 0) {
            for (const sensor of offlineSensors) {
              const sensorName = sensor.name || "Unbekannt";
              const controlType = sensor.controlType || sensor.type || "";

              // Check if an unresolved error already exists for this sensor
              const { data: existing } = await supabase
                .from("integration_errors")
                .select("id")
                .eq("location_integration_id", integrationId)
                .eq("sensor_name", sensorName)
                .eq("is_resolved", false)
                .maybeSingle();

              if (!existing) {
                await supabase.from("integration_errors").insert({
                  tenant_id: tenantId,
                  location_id: locationId,
                  location_integration_id: integrationId,
                  integration_type: integrationType,
                  error_type: "data",
                  error_message: `Liefert keine Werte`,
                  sensor_name: sensorName,
                  sensor_type: controlType,
                  severity: "error",
                });
                console.log(`Logged offline sensor error: ${sensorName} (${controlType})`);
              }
            }
          }
        } else {
          console.error(`Sync failed for integration ${integrationId}:`, data.error);
          results.push({ id: integrationId, success: false, error: data.error });

          // Log error - get tenant_id from location
          if (locationId) {
            const { data: locData } = await supabase
              .from("locations")
              .select("tenant_id")
              .eq("id", locationId)
              .single();

            if (locData?.tenant_id) {
              await supabase.from("integration_errors").insert({
                tenant_id: locData.tenant_id,
                location_id: locationId,
                location_integration_id: integrationId,
                integration_type: integrationType,
                error_type: "connection",
                error_message: data.error || "Sync fehlgeschlagen",
                severity: "error",
              });
            }
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`Error syncing integration ${integrationId}:`, errMsg);
        results.push({ id: integrationId, success: false, error: errMsg });

        // Log error
        if (locationId) {
          const { data: locData } = await supabase
            .from("locations")
            .select("tenant_id")
            .eq("id", locationId)
            .single();

          if (locData?.tenant_id) {
            await supabase.from("integration_errors").insert({
              tenant_id: locData.tenant_id,
              location_id: locationId,
              location_integration_id: integrationId,
              integration_type: integrationType,
              error_type: "connection",
              error_message: errMsg,
              severity: "error",
            });
          }
        }
      }
    }

    const successCount = results.filter((r) => r.success).length;
    console.log(`loxone-periodic-sync: Completed. ${successCount}/${results.length} integrations synced successfully.`);

    return new Response(
      JSON.stringify({ success: true, synced: successCount, total: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("loxone-periodic-sync fatal error:", errMsg);
    return new Response(
      JSON.stringify({ success: false, error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
