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

  // Helper: create a task linked to an integration error
  async function createLinkedTask(
    sb: any, tenantId: string, errorTitle: string, errorId: string
  ) {
    const { data: task } = await sb.from("tasks").insert({
      tenant_id: tenantId,
      title: errorTitle,
      status: "open",
      priority: "high",
      source_type: "automation",
      source_label: "Integrationsfehler",
    }).select("id").single();
    if (task) {
      await sb.from("integration_errors").update({ task_id: task.id }).eq("id", errorId);
    }
    return task;
  }

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
          const systemMessages = data.systemMessages || [];
          const offlineSensors = sensors.filter((s: any) => s.status === "offline");
          const onlineSensors = sensors.filter((s: any) => s.status !== "offline");
          console.log(`Successfully synced integration ${integrationId}: ${sensors.length} sensors (${offlineSensors.length} offline), ${systemMessages.length} system messages`);
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
          const { data: resolvedConnErrors } = await supabase
            .from("integration_errors")
            .select("id, task_id, created_at")
            .eq("location_integration_id", integrationId)
            .eq("is_resolved", false)
            .eq("error_type", "connection");

          if (resolvedConnErrors && resolvedConnErrors.length > 0) {
            const ids = resolvedConnErrors.map((e: any) => e.id);
            await supabase
              .from("integration_errors")
              .update({ is_resolved: true, resolved_at: new Date().toISOString() })
              .in("id", ids);
            // Auto-complete linked tasks
            const taskIds = resolvedConnErrors.map((e: any) => e.task_id).filter(Boolean);
            if (taskIds.length > 0) {
              await supabase
                .from("tasks")
                .update({ status: "done", completed_at: new Date().toISOString() })
                .in("id", taskIds)
                .neq("status", "done");
            }

            // ── Auto-backfill: Fetch missing data from Miniserver statistics ──
            // Determine the gap period from the earliest unresolved connection error
            try {
              const earliestError = resolvedConnErrors.reduce((earliest: any, e: any) =>
                !earliest || e.created_at < earliest.created_at ? e : earliest, null);
              
              if (earliestError?.created_at) {
                const gapStart = new Date(earliestError.created_at);
                const gapEnd = new Date();
                // Format as YYYY-MM-DD
                const fromDate = gapStart.toISOString().slice(0, 10);
                const toDate = gapEnd.toISOString().slice(0, 10);

                console.log(`[Backfill] Connection restored for ${integrationId}. Gap: ${fromDate} to ${toDate}. Triggering backfill...`);

                const backfillResponse = await fetch(
                  `${supabaseUrl}/functions/v1/loxone-api`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "Authorization": `Bearer ${supabaseKey}`,
                    },
                    body: JSON.stringify({
                      locationIntegrationId: integrationId,
                      action: "backfillStatistics",
                      fromDate,
                      toDate,
                    }),
                  }
                );

                const backfillResult = await backfillResponse.json();
                if (backfillResult.success) {
                  console.log(`[Backfill] Success: ${backfillResult.message}`);
                } else {
                  console.error(`[Backfill] Failed:`, backfillResult.error);
                }
              }
            } catch (backfillErr) {
              console.error(`[Backfill] Error triggering backfill for ${integrationId}:`, backfillErr);
            }
          }

          // Auto-resolve data errors for sensors that are now online again
          if (onlineSensors.length > 0) {
            const onlineNames = onlineSensors.map((s: any) => s.name);
            const { data: activeDataErrors } = await supabase
              .from("integration_errors")
              .select("id, sensor_name, task_id")
              .eq("location_integration_id", integrationId)
              .eq("is_resolved", false)
              .eq("error_type", "data");

            if (activeDataErrors && activeDataErrors.length > 0) {
              const toResolveEntries = activeDataErrors
                .filter((e: any) => e.sensor_name && onlineNames.includes(e.sensor_name));
              const toResolveIds = toResolveEntries.map((e: any) => e.id);
              if (toResolveIds.length > 0) {
                await supabase
                  .from("integration_errors")
                  .update({ is_resolved: true, resolved_at: new Date().toISOString() })
                  .in("id", toResolveIds);
                // Auto-complete linked tasks
                const taskIds = toResolveEntries.map((e: any) => e.task_id).filter(Boolean);
                if (taskIds.length > 0) {
                  await supabase
                    .from("tasks")
                    .update({ status: "done", completed_at: new Date().toISOString() })
                    .in("id", taskIds)
                    .neq("status", "done");
                }
                console.log(`Auto-resolved ${toResolveIds.length} sensor data errors`);
              }
            }
          }

          // Log offline sensors as data errors
          if (tenantId && offlineSensors.length > 0) {
            for (const sensor of offlineSensors) {
              const sensorName = sensor.name || "Unbekannt";
              const controlType = sensor.controlType || sensor.type || "";

              // Check if an unresolved error already exists for this sensor
              // Check if an unresolved OR ignored error already exists for this sensor
              const { data: existing } = await supabase
                .from("integration_errors")
                .select("id")
                .eq("location_integration_id", integrationId)
                .eq("sensor_name", sensorName)
                .or("is_resolved.eq.false,is_ignored.eq.true")
                .maybeSingle();

              if (!existing) {
                const { data: errRow } = await supabase.from("integration_errors").insert({
                  tenant_id: tenantId,
                  location_id: locationId,
                  location_integration_id: integrationId,
                  integration_type: integrationType,
                  error_type: "data",
                  error_message: `Liefert keine Werte`,
                  sensor_name: sensorName,
                  sensor_type: controlType,
                  severity: "error",
                }).select("id").single();
                if (errRow) {
                  await createLinkedTask(supabase, tenantId, `${sensorName}: Liefert keine Werte`, errRow.id);
                }
                console.log(`Logged offline sensor error: ${sensorName} (${controlType})`);
              }
            }
          }

          // ── Process Loxone messageCenter system status messages ──
          if (tenantId && systemMessages.length > 0) {
            for (const msg of systemMessages) {
              const msgUid = msg.uid || "";
              const errorMessage = msg.title || msg.message || "Systemfehler";

              // Check if an unresolved error already exists for this message uid
              // Check if an unresolved OR ignored error already exists for this message uid
              const { data: existing } = await supabase
                .from("integration_errors")
                .select("id")
                .eq("location_integration_id", integrationId)
                .eq("sensor_name", msgUid)
                .eq("error_type", "system_status")
                .or("is_resolved.eq.false,is_ignored.eq.true")
                .maybeSingle();

              if (!existing) {
                await supabase.from("integration_errors").insert({
                  tenant_id: tenantId,
                  location_id: locationId,
                  location_integration_id: integrationId,
                  integration_type: integrationType,
                  error_type: "system_status",
                  error_message: errorMessage,
                  sensor_name: msgUid,
                  sensor_type: msg.message || "",
                  severity: msg.level >= 3 ? "error" : "warning",
                });
                console.log(`Logged system status error: ${errorMessage} (uid: ${msgUid})`);
              }
            }
          }

          // Auto-resolve system_status errors that are no longer in messageCenter
          if (tenantId) {
            const { data: activeSystemErrors } = await supabase
              .from("integration_errors")
              .select("id, sensor_name, task_id")
              .eq("location_integration_id", integrationId)
              .eq("error_type", "system_status")
              .eq("is_resolved", false);

            if (activeSystemErrors && activeSystemErrors.length > 0) {
              const currentUids = new Set(systemMessages.map((m: any) => m.uid));
              const toResolve = activeSystemErrors.filter((e: any) => !currentUids.has(e.sensor_name));
              if (toResolve.length > 0) {
                const resolveIds = toResolve.map((e: any) => e.id);
                await supabase
                  .from("integration_errors")
                  .update({ is_resolved: true, resolved_at: new Date().toISOString() })
                  .in("id", resolveIds);
                // Auto-complete linked tasks
                const taskIds = toResolve.map((e: any) => e.task_id).filter(Boolean);
                if (taskIds.length > 0) {
                  await supabase
                    .from("tasks")
                    .update({ status: "done", completed_at: new Date().toISOString() })
                    .in("id", taskIds)
                    .neq("status", "done");
                }
                console.log(`Auto-resolved ${toResolve.length} system status errors no longer in messageCenter`);
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
              // Check if an unresolved or ignored connection error already exists
              const { data: existingConnErr } = await supabase
                .from("integration_errors")
                .select("id")
                .eq("location_integration_id", integrationId)
                .eq("error_type", "connection")
                .or("is_resolved.eq.false,is_ignored.eq.true")
                .maybeSingle();

              if (!existingConnErr) {
                const { data: errRow } = await supabase.from("integration_errors").insert({
                  tenant_id: locData.tenant_id,
                  location_id: locationId,
                  location_integration_id: integrationId,
                  integration_type: integrationType,
                  error_type: "connection",
                  error_message: data.error || "Sync fehlgeschlagen",
                  severity: "error",
                }).select("id").single();
                if (errRow) {
                  await createLinkedTask(supabase, locData.tenant_id, data.error || "Sync fehlgeschlagen", errRow.id);
                }
              }
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
              // Check if an unresolved or ignored connection error already exists
              const { data: existingConnErr } = await supabase
                .from("integration_errors")
                .select("id")
                .eq("location_integration_id", integrationId)
                .eq("error_type", "connection")
                .or("is_resolved.eq.false,is_ignored.eq.true")
                .maybeSingle();

              if (!existingConnErr) {
                const { data: errRow } = await supabase.from("integration_errors").insert({
                  tenant_id: locData.tenant_id,
                  location_id: locationId,
                  location_integration_id: integrationId,
                  integration_type: integrationType,
                  error_type: "connection",
                  error_message: errMsg,
                  severity: "error",
                }).select("id").single();
                if (errRow) {
                  await createLinkedTask(supabase, locData.tenant_id, errMsg, errRow.id);
                }
              }
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
