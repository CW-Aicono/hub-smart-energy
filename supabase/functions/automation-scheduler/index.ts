import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

/**
 * automation-scheduler – evaluates time/weekday/sensor conditions for active automations
 * and executes actions via the appropriate gateway edge functions.
 * Called periodically via pg_cron (every 2 minutes).
 */

const DEBOUNCE_MINUTES = 5;

const GATEWAY_EDGE_FUNCTIONS: Record<string, string> = {
  loxone_miniserver: "loxone-api",
  shelly_cloud: "shelly-api",
  abb_free_at_home: "abb-api",
  siemens_building_x: "siemens-api",
  tuya_cloud: "tuya-api",
  homematic_ip: "homematic-api",
  omada_cloud: "omada-api",
  home_assistant: "home-assistant-api",
  schneider_panel_server: "gateway-ingest",
  schneider_cloud: "schneider-api",
  sentron_powercenter_3000: "sentron-poc3000-api",
};

function getEdgeFunction(integrationType: string): string {
  return GATEWAY_EDGE_FUNCTIONS[integrationType] || "loxone-api";
}

/** Get current time parts in a given IANA timezone */
function getLocalTimeParts(timezone: string): { hours: number; minutes: number; weekday: number; timeStr: string } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("de-DE", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hours = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const minutes = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
  const timeStr = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

  // Get weekday in local timezone (0=Sunday, 1=Monday ... 6=Saturday)
  const dayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" });
  const dayStr = dayFormatter.format(now);
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = dayMap[dayStr] ?? 0;

  return { hours, minutes, weekday, timeStr };
}

/** Check if current time is within a time window (handles overnight ranges like 22:00-06:00) */
function isTimeInRange(currentTime: string, timeFrom: string, timeTo: string): boolean {
  if (timeFrom <= timeTo) {
    // Same-day range: e.g. 08:00 - 18:00
    return currentTime >= timeFrom && currentTime <= timeTo;
  } else {
    // Overnight range: e.g. 22:00 - 06:00
    return currentTime >= timeFrom || currentTime <= timeTo;
  }
}

interface AutomationCondition {
  id: string;
  type: "sensor_value" | "time" | "weekday" | "status";
  sensor_uuid?: string;
  operator?: string;
  value?: number;
  time_from?: string;
  time_to?: string;
  weekdays?: number[];
  actuator_uuid?: string;
  expected_status?: string;
  gateway_id?: string;
}

interface AutomationAction {
  actuator_uuid: string;
  action_type: string;
  action_value?: string;
  gateway_id?: string;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log("automation-scheduler: Starting evaluation...");

  try {
    // 1. Load all active automations with location timezone
    const { data: automations, error } = await supabase
      .from("location_automations")
      .select("*, locations!location_automations_location_id_fkey(timezone, tenant_id)")
      .eq("is_active", true);

    if (error) {
      console.error("Error fetching automations:", error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!automations || automations.length === 0) {
      console.log("No active automations found.");
      return new Response(
        JSON.stringify({ success: true, evaluated: 0, executed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Evaluating ${automations.length} active automations...`);

    let executedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const auto of automations) {
      const automationId = auto.id;
      const tenantId = auto.tenant_id;
      const timezone = (auto as any).locations?.timezone || "Europe/Berlin";
      const conditions: AutomationCondition[] = Array.isArray(auto.conditions) ? auto.conditions : [];
      const logicOperator: string = auto.logic_operator || "AND";

      // Skip if no conditions defined (nothing to evaluate)
      if (conditions.length === 0) {
        continue;
      }

      // Debounce: skip if executed recently
      if (auto.last_executed_at) {
        const lastExec = new Date(auto.last_executed_at);
        const diffMs = Date.now() - lastExec.getTime();
        if (diffMs < DEBOUNCE_MINUTES * 60 * 1000) {
          skippedCount++;
          continue;
        }
      }

      // 2. Evaluate conditions
      const timeParts = getLocalTimeParts(timezone);
      const conditionResults: boolean[] = [];

      for (const condition of conditions) {
        let result = false;

        switch (condition.type) {
          case "time": {
            if (condition.time_from && condition.time_to) {
              result = isTimeInRange(timeParts.timeStr, condition.time_from, condition.time_to);
            }
            break;
          }
          case "weekday": {
            if (condition.weekdays && condition.weekdays.length > 0) {
              result = condition.weekdays.includes(timeParts.weekday);
            }
            break;
          }
          case "sensor_value": {
            // Fetch current sensor value from the gateway
            if (condition.sensor_uuid) {
              try {
                const gatewayId = condition.gateway_id || auto.location_integration_id;
                const { data: liData } = await supabase
                  .from("location_integrations")
                  .select("*, integration:integrations(type)")
                  .eq("id", gatewayId)
                  .maybeSingle();
                const intType = (liData as any)?.integration?.type || "";
                const edgeFn = getEdgeFunction(intType);

                const resp = await fetch(`${supabaseUrl}/functions/v1/${edgeFn}`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${supabaseKey}`,
                  },
                  body: JSON.stringify({
                    locationIntegrationId: gatewayId,
                    action: "getSensors",
                  }),
                });
                const sensorData = await resp.json();
                if (sensorData.success && sensorData.sensors) {
                  const sensor = sensorData.sensors.find((s: any) => s.uuid === condition.sensor_uuid);
                  if (sensor && sensor.value !== undefined) {
                    const sensorVal = parseFloat(sensor.value);
                    const threshold = condition.value ?? 0;
                    switch (condition.operator) {
                      case ">": result = sensorVal > threshold; break;
                      case "<": result = sensorVal < threshold; break;
                      case "=": result = Math.abs(sensorVal - threshold) < 0.001; break;
                      case ">=": result = sensorVal >= threshold; break;
                      case "<=": result = sensorVal <= threshold; break;
                      default: result = false;
                    }
                  }
                }
              } catch (e) {
                console.error(`Sensor fetch error for ${condition.sensor_uuid}:`, e);
              }
            }
            break;
          }
          case "status": {
            // Fetch actuator status
            if (condition.actuator_uuid) {
              try {
                const gatewayId = condition.gateway_id || auto.location_integration_id;
                const { data: liData } = await supabase
                  .from("location_integrations")
                  .select("*, integration:integrations(type)")
                  .eq("id", gatewayId)
                  .maybeSingle();
                const intType = (liData as any)?.integration?.type || "";
                const edgeFn = getEdgeFunction(intType);

                const resp = await fetch(`${supabaseUrl}/functions/v1/${edgeFn}`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${supabaseKey}`,
                  },
                  body: JSON.stringify({
                    locationIntegrationId: gatewayId,
                    action: "getSensors",
                  }),
                });
                const data = await resp.json();
                if (data.success && data.sensors) {
                  const actuator = data.sensors.find((s: any) => s.uuid === condition.actuator_uuid);
                  if (actuator) {
                    result = String(actuator.value) === String(condition.expected_status);
                  }
                }
              } catch (e) {
                console.error(`Status fetch error for ${condition.actuator_uuid}:`, e);
              }
            }
            break;
          }
        }

        conditionResults.push(result);
      }

      // 3. Apply logic operator
      const allMet = logicOperator === "AND"
        ? conditionResults.every(Boolean)
        : conditionResults.some(Boolean);

      if (!allMet) {
        continue;
      }

      // 4. Execute actions
      console.log(`Automation "${auto.name}" (${automationId}): conditions met in tz=${timezone} at ${timeParts.timeStr}. Executing...`);
      const startTime = Date.now();

      try {
        const actions: AutomationAction[] = Array.isArray(auto.actions) && auto.actions.length > 0
          ? auto.actions
          : [{ actuator_uuid: auto.actuator_uuid, action_type: auto.action_value || auto.action_type || "pulse", action_value: auto.action_value }];

        for (const action of actions) {
          const gatewayId = (action as any).gateway_id || auto.location_integration_id;
          const { data: liData } = await supabase
            .from("location_integrations")
            .select("*, integration:integrations(type)")
            .eq("id", gatewayId)
            .maybeSingle();
          const intType = (liData as any)?.integration?.type || "";
          const edgeFn = getEdgeFunction(intType);

          // Build integration-specific payload
          const payload = buildActionPayload(intType, gatewayId, action);

          const resp = await fetch(`${supabaseUrl}/functions/v1/${edgeFn}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify(payload),
          });
          const result = await resp.json();
          if (!result.success) {
            throw new Error(result.error || "Befehl fehlgeschlagen");
          }
        }

        const durationMs = Date.now() - startTime;

        // Log success
        await supabase.from("automation_execution_log").insert({
          tenant_id: tenantId,
          automation_id: automationId,
          trigger_type: "scheduled",
          status: "success",
          actions_executed: actions as any,
          duration_ms: durationMs,
        });

        // Update last_executed_at
        await supabase
          .from("location_automations")
          .update({ last_executed_at: new Date().toISOString() })
          .eq("id", automationId);

        executedCount++;
        console.log(`Automation "${auto.name}" executed successfully in ${durationMs}ms`);
      } catch (execErr) {
        const durationMs = Date.now() - startTime;
        const errMsg = execErr instanceof Error ? execErr.message : String(execErr);

        // Log error
        await supabase.from("automation_execution_log").insert({
          tenant_id: tenantId,
          automation_id: automationId,
          trigger_type: "scheduled",
          status: "error",
          error_message: errMsg,
          duration_ms: durationMs,
        });

        errorCount++;
        console.error(`Automation "${auto.name}" failed: ${errMsg}`);
      }
    }

    console.log(`automation-scheduler: Done. Evaluated=${automations.length}, Executed=${executedCount}, Skipped=${skippedCount}, Errors=${errorCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        evaluated: automations.length,
        executed: executedCount,
        skipped: skippedCount,
        errors: errorCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("automation-scheduler fatal error:", errMsg);
    return new Response(
      JSON.stringify({ success: false, error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
