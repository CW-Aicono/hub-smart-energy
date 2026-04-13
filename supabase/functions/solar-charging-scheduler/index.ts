import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // Validate auth: service role or valid JWT
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

    // Get all active solar charging configs
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
          results.push({ location_id: config.location_id, status: "no_data" });
          continue;
        }

        // Negative value = feed-in = surplus
        const powerW = latestReading.power_value * 1000; // Assuming kW stored
        const surplusW = powerW < 0 ? Math.abs(powerW) - config.safety_buffer_w : 0;
        const availableSurplus = Math.max(0, surplusW);

        // Get active charging connectors in PV mode at this location
        const { data: chargePoints } = await admin
          .from("charge_points")
          .select("id")
          .eq("location_id", config.location_id)
          .eq("tenant_id", config.tenant_id);

        if (!chargePoints || chargePoints.length === 0) {
          await logExecution(admin, config, availableSurplus, 0, 0, "success", null);
          results.push({ location_id: config.location_id, status: "no_chargepoints" });
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
          results.push({ location_id: config.location_id, status: "no_active_pv_sessions" });
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
          // first_come or manual: allocate sequentially
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

        // TODO: Send OCPP SetChargingProfile commands via gateway
        // For now, log the intended actions

        await logExecution(admin, config, availableSurplus, allocatedW, activeConnectors.length, "success", null, actions);
        results.push({ location_id: config.location_id, surplus_w: availableSurplus, allocated_w: allocatedW, connectors: activeConnectors.length });
      } catch (err) {
        await logExecution(admin, config, 0, 0, 0, "error", (err as Error).message);
        results.push({ location_id: config.location_id, status: "error", error: (err as Error).message });
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
    location_id: config.location_id,
    surplus_w: surplusW,
    allocated_w: allocatedW,
    active_connectors: activeConnectors,
    status,
    error_message: errorMessage,
    actions_taken: actions || null,
  });
}
