import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (token !== serviceRoleKey) {
      const sb = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error } = await sb.auth.getUser(token);
      if (error || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
      }
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Get all active solar charging configs (now group-based)
    const { data: configs, error: cfgErr } = await admin
      .from("solar_charging_config")
      .select("*")
      .eq("is_active", true)
      .not("reference_meter_id", "is", null);

    if (cfgErr) throw cfgErr;
    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ message: "No active configs", processed: 0 }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const config of configs) {
      try {
        // Get latest power reading from the reference meter
        const { data: readings } = await admin
          .from("meter_power_readings")
          .select("power_value, recorded_at")
          .eq("meter_id", config.reference_meter_id)
          .order("recorded_at", { ascending: false })
          .limit(1);

        const latestReading = readings?.[0];
        if (!latestReading) {
          await logExecution(admin, config, 0, 0, 0, "no_data", "Keine aktuellen Messwerte");
          results.push({ group_id: config.group_id, status: "no_data" });
          continue;
        }

        // Negative value = feed-in = surplus
        const powerW = latestReading.power_value * 1000;
        const surplusW = powerW < 0 ? Math.abs(powerW) - config.safety_buffer_w : 0;
        const availableSurplus = Math.max(0, surplusW);

        // Get charge points: either by group_id or single charge_point_id
        let chargePoints: { id: string }[] | null = null;
        if (config.group_id) {
          const { data } = await admin
            .from("charge_points")
            .select("id")
            .eq("group_id", config.group_id)
            .eq("tenant_id", config.tenant_id);
          chargePoints = data;
        } else if (config.charge_point_id) {
          const { data } = await admin
            .from("charge_points")
            .select("id")
            .eq("id", config.charge_point_id)
            .eq("tenant_id", config.tenant_id);
          chargePoints = data;
        }

        const scopeKey = config.group_id
          ? { group_id: config.group_id }
          : { charge_point_id: config.charge_point_id };

        if (!chargePoints || chargePoints.length === 0) {
          await logExecution(admin, config, availableSurplus, 0, 0, "success", null);
          results.push({ ...scopeKey, status: "no_chargepoints" });
          continue;
        }

        const cpIds = chargePoints.map((cp: any) => cp.id);

        // Get connectors in PV modes
        const { data: pvConnectors } = await admin
          .from("charge_point_connectors")
          .select("*")
          .in("charge_point_id", cpIds)
          .in("charging_mode", ["pv_surplus_only", "pv_priority"]);

        const activeConnectors = pvConnectors?.filter(
          (c: any) => c.status === "charging"
        ) || [];

        if (activeConnectors.length === 0) {
          await logExecution(admin, config, availableSurplus, 0, 0, "success", null);
          results.push({ group_id: config.group_id, status: "no_active_pv_sessions" });
          continue;
        }

        // Distribute surplus
        let allocatedW = 0;
        const actions: any[] = [];

        if (config.priority_mode === "equal_split") {
          const perConnector = Math.floor(availableSurplus / activeConnectors.length);
          for (const conn of activeConnectors) {
            const assignedW = Math.max(perConnector, conn.charging_mode === "pv_priority" ? config.min_charge_power_w : 0);
            allocatedW += assignedW;
            actions.push({
              connector_id: conn.id,
              charge_point_id: conn.charge_point_id,
              assigned_w: assignedW,
              action: assignedW >= config.min_charge_power_w ? "charge" : "pause",
            });
          }
        } else {
          let remaining = availableSurplus;
          for (const conn of activeConnectors) {
            const minW = conn.charging_mode === "pv_priority" ? config.min_charge_power_w : config.min_charge_power_w;
            if (remaining >= minW) {
              const assignedW = remaining;
              allocatedW += assignedW;
              remaining = 0;
              actions.push({
                connector_id: conn.id,
                charge_point_id: conn.charge_point_id,
                assigned_w: assignedW,
                action: "charge",
              });
            } else if (conn.charging_mode === "pv_priority") {
              allocatedW += config.min_charge_power_w;
              actions.push({
                connector_id: conn.id,
                charge_point_id: conn.charge_point_id,
                assigned_w: config.min_charge_power_w,
                action: "charge_min",
              });
            } else {
              actions.push({
                connector_id: conn.id,
                charge_point_id: conn.charge_point_id,
                assigned_w: 0,
                action: "pause",
              });
            }
          }
        }

        // Queue OCPP SetChargingProfile commands per active connector with
        // stackLevel=1 so it sits below DLM (stackLevel=2) but above
        // power_limit (stackLevel=0) inside the wallbox.
        await dispatchPvSurplus(admin, actions, cpIds);

        await logExecution(admin, config, availableSurplus, allocatedW, activeConnectors.length, "success", null, actions);
        results.push({ ...scopeKey, surplus_w: availableSurplus, allocated_w: allocatedW, connectors: activeConnectors.length });
      } catch (err) {
        await logExecution(admin, config, 0, 0, 0, "error", (err as Error).message);
        results.push({ group_id: config.group_id, charge_point_id: config.charge_point_id, status: "error", error: (err as Error).message });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

async function logExecution(
  admin: any,
  config: any,
  surplusW: number,
  allocatedW: number,
  activeConnectors: number,
  status: string,
  errorMessage: string | null,
  actions?: any[]
) {
  await admin.from("solar_charging_log").insert({
    tenant_id: config.tenant_id,
    group_id: config.group_id,
    surplus_w: surplusW,
    allocated_w: allocatedW,
    active_connectors: activeConnectors,
    status,
    error_message: errorMessage,
    actions_taken: actions || null,
  });
}

const STACK_LEVEL_PV = 1;
const PROFILE_ID_PV = 50;

function kwToAmps(kw: number): number {
  // 3-phase 400 V (matches power-limit/dlm schedulers)
  return Math.max(6, Math.round((kw * 1000) / (400 * Math.sqrt(3))));
}

async function dispatchPvSurplus(
  admin: any,
  actions: Array<{ connector_id: string; charge_point_id: string; assigned_w: number; action: string }>,
  cpIds: string[],
) {
  // Aggregate per charge point: if any of its connectors gets >0 W, the CP-level
  // profile uses the maximum of those (TxDefaultProfile is per CP, not connector).
  const perCp = new Map<string, number>();
  for (const a of actions) {
    const w = a.action === "pause" ? 0 : a.assigned_w;
    perCp.set(a.charge_point_id, Math.max(perCp.get(a.charge_point_id) ?? 0, w));
  }

  // Load CP metadata for capability + connection state
  const { data: cps } = await admin
    .from("charge_points")
    .select("id, ocpp_id, ws_connected, supports_charging_profile, max_power_kw")
    .in("id", cpIds);

  for (const cp of cps ?? []) {
    const targetW = perCp.get(cp.id) ?? null;
    const targetAmps = targetW && targetW > 0 ? kwToAmps(targetW / 1000) : null;

    // Idempotency
    const { data: active } = await admin
      .from("charge_point_active_profile")
      .select("current_limit_a")
      .eq("charge_point_id", cp.id)
      .eq("connector_id", 0)
      .eq("source", "pv_surplus")
      .maybeSingle();
    const activeAmps = active?.current_limit_a != null ? Number(active.current_limit_a) : null;
    if (activeAmps === targetAmps) continue;
    if (!cp.ws_connected) continue;

    const useChangeConfig = cp.supports_charging_profile === false;
    let command: string;
    let payload: Record<string, unknown>;

    if (targetAmps === null) {
      if (useChangeConfig) {
        const maxA = kwToAmps(Number(cp.max_power_kw ?? 22));
        command = "ChangeConfiguration";
        payload = { key: "MaxChargingCurrent", value: String(maxA) };
      } else {
        command = "ClearChargingProfile";
        payload = { id: PROFILE_ID_PV, connectorId: 0, chargingProfilePurpose: "TxDefaultProfile", stackLevel: STACK_LEVEL_PV };
      }
    } else if (useChangeConfig) {
      command = "ChangeConfiguration";
      payload = { key: "MaxChargingCurrent", value: String(targetAmps) };
    } else {
      command = "SetChargingProfile";
      payload = {
        connectorId: 0,
        csChargingProfiles: {
          chargingProfileId: PROFILE_ID_PV,
          stackLevel: STACK_LEVEL_PV,
          chargingProfilePurpose: "TxDefaultProfile",
          chargingProfileKind: "Absolute",
          chargingSchedule: {
            chargingRateUnit: "A",
            chargingSchedulePeriod: [{ startPeriod: 0, limit: targetAmps }],
          },
        },
      };
    }

    await admin.from("pending_ocpp_commands").insert({
      charge_point_ocpp_id: cp.ocpp_id, command, payload, status: "pending",
    });

    if (targetAmps === null) {
      await admin
        .from("charge_point_active_profile")
        .delete()
        .eq("charge_point_id", cp.id)
        .eq("connector_id", 0)
        .eq("source", "pv_surplus");
    } else {
      await admin.from("charge_point_active_profile").upsert({
        charge_point_id: cp.id,
        connector_id: 0,
        profile_purpose: "TxDefaultProfile",
        source: "pv_surplus",
        current_limit_a: targetAmps,
        applied_at: new Date().toISOString(),
        metadata: { command, watts: targetW },
      }, { onConflict: "charge_point_id,connector_id,profile_purpose" });
    }
  }
}
