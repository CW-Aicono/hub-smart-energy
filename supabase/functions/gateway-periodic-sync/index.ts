import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const GATEWAY_EDGE_FUNCTIONS: Record<string, string> = {
  shelly_cloud: "shelly-api",
  abb_free_at_home: "abb-api",
  siemens_building_x: "siemens-api",
  tuya_cloud: "tuya-api",
  homematic_ip: "homematic-api",
  omada_cloud: "omada-api",
  home_assistant: "home-assistant-api",
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log("gateway-periodic-sync: Starting sync for all active gateway integrations...");

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

    const gatewayIntegrations = (locationIntegrations || []).filter(
      (li: any) => li.integration?.type && GATEWAY_EDGE_FUNCTIONS[li.integration.type]
    );

    console.log(`Found ${gatewayIntegrations.length} active gateway integrations`);

    if (gatewayIntegrations.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active gateway integrations found", synced: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{ id: string; type: string; success: boolean; error?: string }> = [];

    for (const li of gatewayIntegrations) {
      const integrationId = li.id;
      const locationId = (li as any).location_id;
      const integrationType = (li.integration as any).type;
      const edgeFunction = GATEWAY_EDGE_FUNCTIONS[integrationType];

      console.log(`Syncing ${integrationType} integration: ${integrationId} via ${edgeFunction}`);

      try {
        const response = await fetch(
          `${supabaseUrl}/functions/v1/${edgeFunction}`,
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
          console.log(`Successfully synced ${integrationType} ${integrationId}: ${data.sensors?.length ?? 0} sensors`);
          results.push({ id: integrationId, type: integrationType, success: true });

          // Auto-resolve active errors
          await supabase
            .from("integration_errors")
            .update({ is_resolved: true, resolved_at: new Date().toISOString() })
            .eq("location_integration_id", integrationId)
            .eq("is_resolved", false);
        } else {
          console.error(`Sync failed for ${integrationType} ${integrationId}:`, data.error);
          results.push({ id: integrationId, type: integrationType, success: false, error: data.error });

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
                error_message: data.error || "Sync fehlgeschlagen",
                severity: "error",
              });
            }
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`Error syncing ${integrationType} ${integrationId}:`, errMsg);
        results.push({ id: integrationId, type: integrationType, success: false, error: errMsg });

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
    console.log(`gateway-periodic-sync: Completed. ${successCount}/${results.length} integrations synced successfully.`);

    return new Response(
      JSON.stringify({ success: true, synced: successCount, total: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("gateway-periodic-sync fatal error:", errMsg);
    return new Response(
      JSON.stringify({ success: false, error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
