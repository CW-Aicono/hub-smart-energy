import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ok(data: unknown = {}) {
  return json(200, { ok: true, data: data as Record<string, unknown> });
}

function fail(status: number, error: string) {
  return json(status, { ok: false, error });
}

function checkBasicAuth(authHeader: string | null | undefined, expectedPassword: string): boolean {
  if (!authHeader || !authHeader.startsWith("Basic ")) return false;
  try {
    const decoded = atob(authHeader.substring(6));
    const idx = decoded.indexOf(":");
    const provided = idx >= 0 ? decoded.substring(idx + 1) : "";
    return provided === expectedPassword;
  } catch {
    return false;
  }
}

function parseMessage(raw: string): { messageType: string | null; parsedJson: unknown } {
  let messageType: string | null = null;
  let parsedJson: unknown = raw;
  try {
    const parsed = JSON.parse(raw);
    parsedJson = parsed;
    if (Array.isArray(parsed)) {
      if (parsed[0] === 2) messageType = parsed[2] ?? null;
      else if (parsed[0] === 3) messageType = "CALLRESULT";
      else if (parsed[0] === 4) messageType = `CALLERROR:${parsed[2] ?? "unknown"}`;
    }
  } catch {
    // keep raw
  }
  return { messageType, parsedJson };
}

function onlyPatch(input: Record<string, unknown>, allowed: string[]) {
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(input, key)) out[key] = input[key];
  }
  return out;
}

async function handle(action: string, body: Record<string, unknown>) {
  switch (action) {
    case "authenticate-charge-point": {
      const rawOcppId = String(body.ocppId ?? "");
      const ocppId = rawOcppId.trim();
      const authorization = typeof body.authorization === "string" ? body.authorization : null;
      if (!ocppId) return fail(400, "Missing ocppId");

      console.log(`[ocpp-persistent-api] authenticate-charge-point raw="${rawOcppId}" trimmed="${ocppId}"`);

      const { data: cp, error } = await admin
        .from("charge_points")
        .select("id, ocpp_id, tenant_id, ocpp_password, auth_required, connection_protocol")
        .ilike("ocpp_id", ocppId)
        .maybeSingle();

      if (error) return fail(500, error.message);
      if (!cp) {
        console.warn(`[ocpp-persistent-api] unknown charge point raw="${rawOcppId}" trimmed="${ocppId}"`);
        return ok({ authorized: false, statusCode: 404, message: `Unknown charge point: ${ocppId}` });
      }

      const needsPassword = Boolean(cp.auth_required ?? true) && Boolean(cp.ocpp_password);
      if (needsPassword && !checkBasicAuth(authorization, cp.ocpp_password)) {
        return ok({ authorized: false, statusCode: 401, message: "Unauthorized" });
      }

      return ok({
        authorized: true,
        statusCode: 200,
        message: "Accepted",
        authSkipped: !needsPassword,
        chargePoint: {
          id: cp.id,
          ocpp_id: cp.ocpp_id,
          tenant_id: cp.tenant_id,
          auth_required: cp.auth_required ?? true,
          connection_protocol: cp.connection_protocol ?? "wss",
        },
      });
    }

    case "update-charge-point": {
      const id = String(body.id ?? "");
      const patch = typeof body.patch === "object" && body.patch ? body.patch as Record<string, unknown> : {};
      if (!id) return fail(400, "Missing id");
      const safePatch = onlyPatch(patch, [
        "vendor",
        "model",
        "firmware_version",
        "last_heartbeat",
        "ws_connected",
        "ws_connected_since",
        "status",
      ]);
      const { error } = await admin.from("charge_points").update(safePatch).eq("id", id);
      if (error) return fail(500, error.message);
      return ok();
    }

    case "update-connector-status": {
      const chargePointId = String(body.chargePointId ?? "");
      const connectorId = Number(body.connectorId ?? 0);
      const status = String(body.status ?? "Unknown");
      if (!chargePointId || !Number.isFinite(connectorId) || connectorId <= 0) return fail(400, "Invalid connector");
      const { error } = await admin
        .from("charge_point_connectors")
        .update({ status, last_status_at: new Date().toISOString() })
        .eq("charge_point_id", chargePointId)
        .eq("connector_id", connectorId);
      if (error) return fail(500, error.message);
      return ok();
    }

    case "authorize-id-tag": {
      const tenantId = String(body.tenantId ?? "");
      const idTag = String(body.idTag ?? "");
      if (!tenantId || !idTag) return fail(400, "Missing tenantId/idTag");

      let { data: user, error } = await admin
        .from("charging_users")
        .select("id, status")
        .eq("tenant_id", tenantId)
        .eq("rfid_tag", idTag)
        .maybeSingle();

      if (!user && !error) {
        const result = await admin
          .from("charging_users")
          .select("id, status")
          .eq("tenant_id", tenantId)
          .eq("app_tag", idTag)
          .maybeSingle();
        user = result.data;
        error = result.error;
      }

      if (error) return fail(500, error.message);
      return ok({ status: user && user.status === "active" ? "Accepted" : "Invalid" });
    }

    case "create-charging-session": {
      const { data, error } = await admin
        .from("charging_sessions")
        .insert({
          tenant_id: String(body.tenantId ?? ""),
          charge_point_id: String(body.chargePointId ?? ""),
          connector_id: Number(body.connectorId ?? 1),
          id_tag: String(body.idTag ?? ""),
          meter_start: Number(body.meterStart ?? 0),
          start_time: String(body.startTime ?? new Date().toISOString()),
          transaction_id: Number(body.transactionId ?? 0),
          status: "active",
        })
        .select("id")
        .single();
      if (error) return fail(500, error.message);
      return ok({ id: data.id });
    }

    case "get-charging-session": {
      const chargePointId = String(body.chargePointId ?? "");
      const transactionId = Number(body.transactionId ?? 0);
      const { data, error } = await admin
        .from("charging_sessions")
        .select("id, meter_start")
        .eq("charge_point_id", chargePointId)
        .eq("transaction_id", transactionId)
        .maybeSingle();
      if (error) return fail(500, error.message);
      return ok({ session: data ?? null });
    }

    case "update-charging-session": {
      const id = String(body.id ?? "");
      const patch = typeof body.patch === "object" && body.patch ? body.patch as Record<string, unknown> : {};
      if (!id) return fail(400, "Missing id");
      const safePatch = onlyPatch(patch, ["meter_stop", "stop_time", "stop_reason", "status", "energy_kwh"]);
      const { error } = await admin.from("charging_sessions").update(safePatch).eq("id", id);
      if (error) return fail(500, error.message);
      return ok();
    }

    case "log-message": {
      const chargePointId = String(body.chargePointId ?? "");
      const direction = body.direction === "outgoing" ? "outgoing" : "incoming";
      const raw = String(body.raw ?? "");
      if (!chargePointId || !raw) return fail(400, "Missing message data");
      const { messageType, parsedJson } = parseMessage(raw);
      const { error } = await admin.from("ocpp_message_log").insert({
        charge_point_id: chargePointId,
        direction,
        message_type: messageType,
        raw_message: parsedJson,
      });
      if (error) return fail(500, error.message);
      return ok();
    }

    case "fetch-pending-commands": {
      const connectedIds = Array.isArray(body.connectedIds) ? body.connectedIds.map(String).filter(Boolean) : [];
      if (connectedIds.length === 0) return ok({ commands: [] });
      const { data, error } = await admin
        .from("pending_ocpp_commands")
        .select("*")
        .in("charge_point_ocpp_id", connectedIds)
        .in("status", ["pending", "scheduled"])
        .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`)
        .order("created_at", { ascending: true })
        .limit(50);
      if (error) return fail(500, error.message);
      return ok({ commands: data ?? [] });
    }

    case "update-pending-command": {
      const id = String(body.id ?? "");
      const patch = typeof body.patch === "object" && body.patch ? body.patch as Record<string, unknown> : {};
      if (!id) return fail(400, "Missing id");
      const safePatch = onlyPatch(patch, ["status", "processed_at", "result"]);
      const { error } = await admin.from("pending_ocpp_commands").update(safePatch).eq("id", id);
      if (error) return fail(500, error.message);
      return ok();
    }

    default:
      return fail(400, `Unknown action: ${action}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return fail(405, "Method not allowed");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, "Invalid JSON");
  }

  const action = String(body.action ?? "");
  try {
    return await handle(action, body);
  } catch (error) {
    console.error("[ocpp-persistent-api]", error);
    return fail(500, error instanceof Error ? error.message : String(error));
  }
});
