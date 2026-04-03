import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

/**
 * automation-scheduler – Cloud-based automation evaluator
 * ========================================================
 * Refactored to use shared automation-core package.
 * Called periodically via pg_cron (every 2 minutes).
 */

// ── Inline shared types & logic (from packages/automation-core) ──────────────
// These are inlined because Deno Edge Functions cannot import from packages/

interface AutomationCondition {
  id: string;
  type: "sensor_value" | "time" | "weekday" | "status" | "time_point" | "time_switch";
  sensor_uuid?: string;
  operator?: string;
  value?: number;
  time_from?: string;
  time_to?: string;
  time_point?: string;
  time_points?: string[];
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

interface TimeParts {
  hours: number;
  minutes: number;
  weekday: number;
  timeStr: string;
}

interface SensorValue {
  uuid: string;
  value: number | string;
}

interface SensorProvider {
  getSensorValue(sensorUuid: string, gatewayId?: string): Promise<SensorValue | null>;
}

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

// ── Shared evaluator logic (1:1 from automation-core/evaluator.ts) ───────────

function getLocalTimeParts(timezone: string): TimeParts {
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

  const dayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" });
  const dayStr = dayFormatter.format(now);
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = dayMap[dayStr] ?? 0;

  return { hours, minutes, weekday, timeStr };
}

function isTimeInRange(currentTime: string, timeFrom: string, timeTo: string): boolean {
  if (timeFrom <= timeTo) {
    return currentTime >= timeFrom && currentTime <= timeTo;
  } else {
    return currentTime >= timeFrom || currentTime <= timeTo;
  }
}

function isNearTimePoint(currentTimeStr: string, targetTime: string): boolean {
  const [tH, tM] = targetTime.split(":").map(Number);
  const targetMin = tH * 60 + tM;
  const [cH, cM] = currentTimeStr.split(":").map(Number);
  const currentMin = cH * 60 + cM;
  const diff = Math.abs(currentMin - targetMin);
  return diff <= 2 || diff >= (24 * 60 - 2);
}

function isDebounceExpired(lastExecutedAt: string | null | undefined): boolean {
  if (!lastExecutedAt) return true;
  const lastExec = new Date(lastExecutedAt);
  const diffMs = Date.now() - lastExec.getTime();
  return diffMs >= DEBOUNCE_MINUTES * 60 * 1000;
}

async function evaluateCondition(
  condition: AutomationCondition,
  timeParts: TimeParts,
  sensorProvider: SensorProvider,
): Promise<boolean> {
  switch (condition.type) {
    case "time": {
      if (condition.time_from && condition.time_to) {
        return isTimeInRange(timeParts.timeStr, condition.time_from, condition.time_to);
      }
      return false;
    }
    case "time_point": {
      if (condition.time_point) {
        return isNearTimePoint(timeParts.timeStr, condition.time_point);
      }
      return false;
    }
    case "time_switch": {
      if (condition.time_points && condition.time_points.length > 0) {
        return condition.time_points.some((tp) => isNearTimePoint(timeParts.timeStr, tp));
      }
      return false;
    }
    case "weekday": {
      if (condition.weekdays && condition.weekdays.length > 0) {
        return condition.weekdays.includes(timeParts.weekday);
      }
      return false;
    }
    case "sensor_value": {
      if (!condition.sensor_uuid) return false;
      try {
        const sensor = await sensorProvider.getSensorValue(condition.sensor_uuid, condition.gateway_id);
        if (!sensor || sensor.value === undefined) return false;
        const sensorVal = typeof sensor.value === "number" ? sensor.value : parseFloat(String(sensor.value));
        if (!isFinite(sensorVal)) return false;
        const threshold = condition.value ?? 0;
        switch (condition.operator) {
          case ">": return sensorVal > threshold;
          case "<": return sensorVal < threshold;
          case "=": return Math.abs(sensorVal - threshold) < 0.001;
          case ">=": return sensorVal >= threshold;
          case "<=": return sensorVal <= threshold;
          default: return false;
        }
      } catch (e) {
        console.error(`[evaluator] Sensor fetch error for ${condition.sensor_uuid}:`, e);
        return false;
      }
    }
    case "status": {
      if (!condition.actuator_uuid) return false;
      try {
        const sensor = await sensorProvider.getSensorValue(condition.actuator_uuid, condition.gateway_id);
        if (!sensor) return false;
        return String(sensor.value) === String(condition.expected_status);
      } catch (e) {
        console.error(`[evaluator] Status fetch error for ${condition.actuator_uuid}:`, e);
        return false;
      }
    }
    default:
      return false;
  }
}

function resolveActions(auto: Record<string, unknown>): AutomationAction[] {
  const actions = auto.actions as AutomationAction[] | undefined;
  if (Array.isArray(actions) && actions.length > 0) {
    return actions;
  }
  return [{
    actuator_uuid: (auto.actuator_uuid as string) || "",
    action_type: (auto.action_value as string) || (auto.action_type as string) || "pulse",
    action_value: auto.action_value as string | undefined,
  }];
}

// ── Shared payload builder (from automation-core/executor.ts) ────────────────

function buildActionPayload(
  integrationType: string,
  locationIntegrationId: string,
  action: AutomationAction,
): Record<string, unknown> {
  const commandValue = action.action_value || action.action_type || "pulse";

  if (integrationType === "home_assistant") {
    const entityId = action.actuator_uuid;
    const domain = entityId.split(".")[0];

    let service = "toggle";
    const cmd = commandValue.toLowerCase();
    if (cmd === "on") service = "turn_on";
    else if (cmd === "off") service = "turn_off";
    else if (cmd === "toggle") service = "toggle";
    else if (cmd === "pulse") service = "toggle";
    else if (domain === "cover") {
      if (cmd === "open") service = "open_cover";
      else if (cmd === "close") service = "close_cover";
      else if (cmd === "stop") service = "stop_cover";
      else service = "toggle";
    }

    return {
      locationIntegrationId,
      action: "executeCommand",
      domain,
      service,
      entity_id: entityId,
    };
  }

  return {
    locationIntegrationId,
    action: "executeCommand",
    controlUuid: action.actuator_uuid,
    commandValue,
  };
}

// ── Cloud-specific SensorProvider implementation ─────────────────────────────

class CloudSensorProvider implements SensorProvider {
  constructor(
    private supabase: ReturnType<typeof createClient>,
    private supabaseUrl: string,
    private supabaseKey: string,
    private defaultGatewayId?: string,
  ) {}

  async getSensorValue(sensorUuid: string, gatewayId?: string): Promise<SensorValue | null> {
    const gid = gatewayId || this.defaultGatewayId;
    if (!gid) return null;

    const { data: liData } = await this.supabase
      .from("location_integrations")
      .select("*, integration:integrations(type)")
      .eq("id", gid)
      .maybeSingle();

    const intType = (liData as any)?.integration?.type || "";
    const edgeFn = getEdgeFunction(intType);

    const resp = await fetch(`${this.supabaseUrl}/functions/v1/${edgeFn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.supabaseKey}`,
      },
      body: JSON.stringify({
        locationIntegrationId: gid,
        action: "getSensors",
      }),
    });

    const data = await resp.json();
    if (data.success && data.sensors) {
      const sensor = data.sensors.find((s: any) => s.uuid === sensorUuid);
      if (sensor && sensor.value !== undefined) {
        return { uuid: sensorUuid, value: sensor.value };
      }
    }
    return null;
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
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

      if (conditions.length === 0) continue;

      // Debounce check using shared logic
      if (!isDebounceExpired(auto.last_executed_at)) {
        skippedCount++;
        continue;
      }

      // 2. Evaluate conditions using shared evaluator
      const timeParts = getLocalTimeParts(timezone);
      const sensorProvider = new CloudSensorProvider(supabase, supabaseUrl, supabaseKey, auto.location_integration_id);

      const conditionResults: boolean[] = [];
      for (const condition of conditions) {
        const result = await evaluateCondition(condition, timeParts, sensorProvider);
        conditionResults.push(result);
      }

      // 3. Apply logic operator
      const allMet = logicOperator === "AND"
        ? conditionResults.every(Boolean)
        : conditionResults.some(Boolean);

      if (!allMet) continue;

      // 4. Execute actions using shared payload builder
      console.log(`Automation "${auto.name}" (${automationId}): conditions met in tz=${timezone} at ${timeParts.timeStr}. Executing...`);
      const startTime = Date.now();

      try {
        const actions = resolveActions(auto as any);

        for (const action of actions) {
          const gatewayId = (action as any).gateway_id || auto.location_integration_id;
          const { data: liData } = await supabase
            .from("location_integrations")
            .select("*, integration:integrations(type)")
            .eq("id", gatewayId)
            .maybeSingle();
          const intType = (liData as any)?.integration?.type || "";
          const edgeFn = getEdgeFunction(intType);

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

        // Log success with execution_source = 'cloud'
        await supabase.from("automation_execution_log").insert({
          tenant_id: tenantId,
          automation_id: automationId,
          trigger_type: "scheduled",
          status: "success",
          execution_source: "cloud",
          actions_executed: actions as any,
          duration_ms: durationMs,
        });

        await supabase
          .from("location_automations")
          .update({ last_executed_at: new Date().toISOString() })
          .eq("id", automationId);

        executedCount++;
        console.log(`Automation "${auto.name}" executed successfully in ${durationMs}ms`);
      } catch (execErr) {
        const durationMs = Date.now() - startTime;
        const errMsg = execErr instanceof Error ? execErr.message : String(execErr);

        await supabase.from("automation_execution_log").insert({
          tenant_id: tenantId,
          automation_id: automationId,
          trigger_type: "scheduled",
          status: "error",
          execution_source: "cloud",
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
