import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function createSupabase() {
  return createClient(supabaseUrl, serviceKey);
}

// Logging is handled by ocpp-ws-proxy – no duplicate logging here.

// OCPP 1.6 JSON message types
const CALL = 2;
const CALLRESULT = 3;
const CALLERROR = 4;

interface OcppMessage {
  messageTypeId: number;
  uniqueId: string;
  action?: string;
  payload?: Record<string, unknown>;
}

function parseOcppMessage(raw: unknown[]): OcppMessage {
  return {
    messageTypeId: raw[0] as number,
    uniqueId: raw[1] as string,
    action: raw[2] as string | undefined,
    payload: (raw[3] ?? raw[2]) as Record<string, unknown> | undefined,
  };
}

async function handleBootNotification(
  supabase: ReturnType<typeof createSupabase>,
  chargePointId: string,
  payload: Record<string, unknown>
) {
  // Check if charge point already exists
  const { data: existing } = await supabase
    .from("charge_points")
    .select("id")
    .eq("ocpp_id", chargePointId)
    .maybeSingle();

  if (existing) {
    // Known charge point – update as before
    await supabase
      .from("charge_points")
      .update({
        status: "available",
        vendor: payload.chargePointVendor as string,
        model: payload.chargePointModel as string,
        firmware_version: payload.firmwareVersion as string || null,
        last_heartbeat: new Date().toISOString(),
      })
      .eq("ocpp_id", chargePointId);

    // Seed connector rows if missing
    await seedConnectors(supabase, existing.id, chargePointId);
  } else {
    // Auto-registration: unknown OCPP-ID → check if it exists in ANY tenant first
    const { data: anyExisting } = await supabase
      .from("charge_points")
      .select("id, tenant_id")
      .eq("ocpp_id", chargePointId)
      .limit(1);

    if (anyExisting && anyExisting.length > 0) {
      // ocpp_id already exists in another tenant – skip auto-registration to prevent duplicates
      console.log(`[ocpp-central] Skipping auto-registration: ocpp_id ${chargePointId} already exists in tenant ${anyExisting[0].tenant_id}`);
    } else {
      // Find the first tenant (single-tenant or pick the first available)
      const { data: tenants } = await supabase
        .from("tenants")
        .select("id")
        .limit(1);

      const tenantId = tenants?.[0]?.id;
      if (tenantId) {
        const vendor = (payload.chargePointVendor as string) || "Unknown";
        const model = (payload.chargePointModel as string) || "Unknown";
        await supabase.from("charge_points").insert({
          ocpp_id: chargePointId,
          tenant_id: tenantId,
          name: `${vendor} ${model} (${chargePointId})`,
          status: "unconfigured",
          vendor,
          model,
          firmware_version: (payload.firmwareVersion as string) || null,
          last_heartbeat: new Date().toISOString(),
          connector_count: 1,
          connector_type: "Type2",
          max_power_kw: 0,
        });
        console.log(`[ocpp-central] Auto-registered new charge point: ${chargePointId} for tenant ${tenantId}`);
      } else {
        console.error(`[ocpp-central] Cannot auto-register ${chargePointId}: no tenant found`);
      }
    }
  }

  return {
    status: "Accepted",
    currentTime: new Date().toISOString(),
    interval: 30,
  };
}

async function handleHeartbeat(
  supabase: ReturnType<typeof createSupabase>,
  chargePointId: string
) {
  await supabase
    .from("charge_points")
    .update({ last_heartbeat: new Date().toISOString() })
    .eq("ocpp_id", chargePointId);

  return { currentTime: new Date().toISOString() };
}

/**
 * Seed connector rows for a charge point if they don't exist yet.
 */
async function seedConnectors(
  supabase: ReturnType<typeof createSupabase>,
  cpUuid: string,
  ocppId: string
) {
  const { data: existing } = await supabase
    .from("charge_point_connectors")
    .select("connector_id")
    .eq("charge_point_id", cpUuid);

  if (existing && existing.length > 0) return; // already seeded

  // Read connector_count from the charge point
  const { data: cpData } = await supabase
    .from("charge_points")
    .select("connector_count, connector_type, max_power_kw")
    .eq("id", cpUuid)
    .single();

  const count = cpData?.connector_count || 1;
  const connType = cpData?.connector_type || "Type2";
  const maxPower = cpData?.max_power_kw || 22;

  const rows = [];
  for (let i = 1; i <= count; i++) {
    rows.push({
      charge_point_id: cpUuid,
      connector_id: i,
      status: "available",
      connector_type: connType.split(",")[0] || "Type2",
      max_power_kw: maxPower,
    });
  }

  await supabase.from("charge_point_connectors").insert(rows);
  console.log(`[ocpp-central] Seeded ${count} connector(s) for ${ocppId}`);
}

async function handleStatusNotification(
  supabase: ReturnType<typeof createSupabase>,
  chargePointId: string,
  payload: Record<string, unknown>
) {
  const statusMap: Record<string, string> = {
    Available: "available",
    Preparing: "unavailable",
    Charging: "charging",
    SuspendedEVSE: "charging",
    SuspendedEV: "charging",
    Finishing: "charging",
    Reserved: "unavailable",
    Unavailable: "unavailable",
    Faulted: "faulted",
  };

  const connectorId = (payload.connectorId as number) || 0;
  const mappedStatus = statusMap[payload.status as string] || "offline";

  // Update per-connector status if connectorId > 0
  if (connectorId > 0) {
    // Resolve CP UUID
    const { data: cpRow } = await supabase
      .from("charge_points")
      .select("id")
      .eq("ocpp_id", chargePointId)
      .maybeSingle();

    if (cpRow) {
      await supabase
        .from("charge_point_connectors")
        .upsert(
          {
            charge_point_id: cpRow.id,
            connector_id: connectorId,
            status: mappedStatus,
            last_status_at: new Date().toISOString(),
          },
          { onConflict: "charge_point_id,connector_id" }
        );
    }
  }

  // Update aggregate charge point status
  // If any connector is available → available; if any charging → charging; else worst status
  const { data: cpRow } = await supabase
    .from("charge_points")
    .select("id")
    .eq("ocpp_id", chargePointId)
    .maybeSingle();

  if (cpRow) {
    const { data: allConnectors } = await supabase
      .from("charge_point_connectors")
      .select("status")
      .eq("charge_point_id", cpRow.id);

    let aggregateStatus = mappedStatus;
    if (allConnectors && allConnectors.length > 0) {
      const statuses = allConnectors.map((c: any) => c.status);
      if (statuses.includes("available")) aggregateStatus = "available";
      else if (statuses.includes("charging")) aggregateStatus = "charging";
      else if (statuses.includes("faulted")) aggregateStatus = "faulted";
      else aggregateStatus = statuses[0] || mappedStatus;
    }

    await supabase
      .from("charge_points")
      .update({ status: aggregateStatus })
      .eq("ocpp_id", chargePointId);
  } else {
    // Fallback: no connector rows yet
    await supabase
      .from("charge_points")
      .update({ status: mappedStatus })
      .eq("ocpp_id", chargePointId);
  }

  return {};
}

async function handleAuthorize(
  supabase: ReturnType<typeof createSupabase>,
  chargePointId: string,
  payload: Record<string, unknown>
) {
  const idTag = payload.idTag as string;
  const status = await validateIdTag(supabase, chargePointId, idTag);
  return { idTagInfo: { status } };
}

/**
 * Resolves the effective access settings for a charge point,
 * considering group membership (group settings override individual).
 */
async function getEffectiveAccessSettings(
  supabase: ReturnType<typeof createSupabase>,
  cpId: string,
  groupId: string | null
) {
  const defaults = { free_charging: false, user_group_restriction: false, max_charging_duration_min: 480 };

  if (groupId) {
    const { data: group } = await supabase
      .from("charge_point_groups")
      .select("access_settings")
      .eq("id", groupId)
      .single();
    if (group?.access_settings) {
      const settings = group.access_settings as Record<string, unknown>;
      return {
        free_charging: settings.free_charging as boolean ?? defaults.free_charging,
        user_group_restriction: settings.user_group_restriction as boolean ?? defaults.user_group_restriction,
        max_charging_duration_min: settings.max_charging_duration_min as number ?? defaults.max_charging_duration_min,
        source: "group" as const,
        sourceId: groupId,
      };
    }
  }

  // Individual charge point settings
  const { data: cp } = await supabase
    .from("charge_points")
    .select("access_settings")
    .eq("id", cpId)
    .single();

  if (cp?.access_settings) {
    const settings = cp.access_settings as Record<string, unknown>;
    return {
      free_charging: settings.free_charging as boolean ?? defaults.free_charging,
      user_group_restriction: settings.user_group_restriction as boolean ?? defaults.user_group_restriction,
      max_charging_duration_min: settings.max_charging_duration_min as number ?? defaults.max_charging_duration_min,
      source: "chargepoint" as const,
      sourceId: cpId,
    };
  }

  return { ...defaults, source: "default" as const, sourceId: cpId };
}

/**
 * Checks if a charging user (identified by idTag) is in one of the allowed user groups.
 */
async function isUserInAllowedGroups(
  supabase: ReturnType<typeof createSupabase>,
  tenantId: string,
  idTag: string,
  source: "group" | "chargepoint" | "default",
  sourceId: string
): Promise<boolean> {
  // Get allowed user group IDs
  const table = source === "group" ? "charge_point_group_allowed_user_groups" : "charge_point_allowed_user_groups";
  const fkCol = source === "group" ? "group_id" : "charge_point_id";

  const { data: allowedRows } = await supabase
    .from(table)
    .select("user_group_id")
    .eq(fkCol, sourceId);

  if (!allowedRows || allowedRows.length === 0) {
    // No groups configured = no restriction (all allowed)
    return true;
  }

  const allowedGroupIds = allowedRows.map((r: any) => r.user_group_id);

  // Find the charging user by idTag
  let userGroupId: string | null = null;

  if (idTag.startsWith("APP")) {
    const isLegacy = idTag.startsWith("APP:");
    const query = isLegacy
      ? supabase.from("charging_users").select("group_id").eq("tenant_id", tenantId).eq("auth_user_id", idTag.substring(4)).single()
      : supabase.from("charging_users").select("group_id").eq("tenant_id", tenantId).eq("app_tag", idTag).single();
    const { data } = await query;
    userGroupId = data?.group_id ?? null;
  } else {
    const { data } = await supabase
      .from("charging_users")
      .select("group_id")
      .eq("tenant_id", tenantId)
      .ilike("rfid_tag", idTag)
      .single();
    userGroupId = data?.group_id ?? null;
  }

  if (!userGroupId) return false;
  return allowedGroupIds.includes(userGroupId);
}

async function logAccessAttempt(
  supabase: ReturnType<typeof createSupabase>,
  tenantId: string | null,
  chargePointId: string | null,
  chargePointOcppId: string,
  idTag: string | null | undefined,
  result: string,
  reason: string,
  metadata?: Record<string, unknown>
) {
  if (!tenantId) return;
  try {
    await supabase.from("charging_access_log").insert({
      tenant_id: tenantId,
      charge_point_id: chargePointId,
      charge_point_ocpp_id: chargePointOcppId,
      id_tag: idTag ?? null,
      result,
      reason,
      metadata: metadata ?? null,
    });
  } catch (e) {
    console.error("[ocpp-central] failed to log access attempt:", (e as Error).message);
  }
}

async function validateIdTag(
  supabase: ReturnType<typeof createSupabase>,
  chargePointId: string,
  idTag: string | null | undefined
): Promise<string> {
  console.log(`[ocpp-central] validateIdTag called: cp=${chargePointId}, idTag=${idTag}`);
  // Find the charge point
  const { data: cp } = await supabase
    .from("charge_points")
    .select("id, tenant_id, group_id")
    .eq("ocpp_id", chargePointId)
    .single();

  if (!cp) {
    await logAccessAttempt(supabase, null, null, chargePointId, idTag, "Invalid", "Unknown charge point");
    return "Invalid";
  }

  // Get effective access settings
  const accessSettings = await getEffectiveAccessSettings(supabase, cp.id, cp.group_id);

  // Free charging = accept anyone
  if (accessSettings.free_charging) {
    await logAccessAttempt(supabase, cp.tenant_id, cp.id, chargePointId, idTag, "Accepted", "Free charging enabled");
    return "Accepted";
  }

  // No tag and not free charging = reject
  if (!idTag) {
    await logAccessAttempt(supabase, cp.tenant_id, cp.id, chargePointId, idTag, "Invalid", "Missing idTag, free charging disabled");
    return "Invalid";
  }

  // Basic tag validation (user exists and is active)
  let userId: string | null = null;
  if (idTag.startsWith("APP")) {
    const isLegacy = idTag.startsWith("APP:");
    const query = isLegacy
      ? supabase.from("charging_users").select("id, status, group_id").eq("tenant_id", cp.tenant_id).eq("auth_user_id", idTag.substring(4)).single()
      : supabase.from("charging_users").select("id, status, group_id").eq("tenant_id", cp.tenant_id).eq("app_tag", idTag).single();
    const { data: appUser } = await query;
    if (!appUser) {
      await logAccessAttempt(supabase, cp.tenant_id, cp.id, chargePointId, idTag, "Invalid", "App tag not found");
      return "Invalid";
    }
    if (appUser.status !== "active") {
      await logAccessAttempt(supabase, cp.tenant_id, cp.id, chargePointId, idTag, "Blocked", `User status: ${appUser.status}`);
      return "Blocked";
    }
    userId = appUser.id;
  } else {
    const { data: user } = await supabase
      .from("charging_users")
      .select("id, status, group_id")
      .eq("tenant_id", cp.tenant_id)
      .ilike("rfid_tag", idTag)
      .single();
    if (!user) {
      console.log(`[ocpp-central] RFID tag not found: "${idTag}" in tenant ${cp.tenant_id}`);
      await logAccessAttempt(supabase, cp.tenant_id, cp.id, chargePointId, idTag, "Invalid", "RFID tag not found");
      return "Invalid";
    }
    if (user.status !== "active") {
      await logAccessAttempt(supabase, cp.tenant_id, cp.id, chargePointId, idTag, "Blocked", `User status: ${user.status}`);
      return "Blocked";
    }
    userId = user.id;
  }

  // User group restriction check
  if (accessSettings.user_group_restriction) {
    const allowed = await isUserInAllowedGroups(
      supabase, cp.tenant_id, idTag, accessSettings.source, accessSettings.sourceId
    );
    if (!allowed) {
      await logAccessAttempt(supabase, cp.tenant_id, cp.id, chargePointId, idTag, "Blocked", "User group not in allowed list", { source: accessSettings.source });
      return "Blocked";
    }
  }

  await logAccessAttempt(supabase, cp.tenant_id, cp.id, chargePointId, idTag, "Accepted", "All checks passed");
  return "Accepted";
}

async function handleStartTransaction(
  supabase: ReturnType<typeof createSupabase>,
  chargePointId: string,
  payload: Record<string, unknown>
) {
  // Get charge point
  const { data: cp } = await supabase
    .from("charge_points")
    .select("id, tenant_id, group_id")
    .eq("ocpp_id", chargePointId)
    .single();

  if (!cp) {
    return { idTagInfo: { status: "Invalid" } };
  }

  // Validate RFID tag (includes access control checks)
  const idTag = payload.idTag as string | undefined;
  const authStatus = await validateIdTag(supabase, chargePointId, idTag);
  if (authStatus !== "Accepted") {
    return { idTagInfo: { status: authStatus } };
  }

  // Generate transaction id
  const transactionId = Math.floor(Math.random() * 2147483647);

  await supabase.from("charging_sessions").insert({
    tenant_id: cp.tenant_id,
    charge_point_id: cp.id,
    connector_id: (payload.connectorId as number) || 1,
    transaction_id: transactionId,
    id_tag: idTag || null,
    start_time: (payload.timestamp as string) || new Date().toISOString(),
    meter_start: (payload.meterStart as number) || 0,
    status: "active",
  });

  await supabase
    .from("charge_points")
    .update({ status: "charging" })
    .eq("ocpp_id", chargePointId);

  // Schedule auto-stop based on max charging duration
  const accessSettings = await getEffectiveAccessSettings(supabase, cp.id, cp.group_id);
  if (accessSettings.max_charging_duration_min > 0 && accessSettings.max_charging_duration_min < 1440) {
    const stopAt = new Date(Date.now() + accessSettings.max_charging_duration_min * 60 * 1000).toISOString();
    await supabase.from("pending_ocpp_commands").insert({
      charge_point_ocpp_id: chargePointId,
      command: "RemoteStopTransaction",
      payload: { transactionId },
      status: "scheduled",
      scheduled_at: stopAt,
    });
  }

  return {
    transactionId,
    idTagInfo: { status: "Accepted" },
  };
}

async function handleStopTransaction(
  supabase: ReturnType<typeof createSupabase>,
  chargePointId: string,
  payload: Record<string, unknown>
) {
  const transactionId = payload.transactionId as number;
  const meterStop = (payload.meterStop as number) || 0;
  const stopTime = (payload.timestamp as string) || new Date().toISOString();
  const reason = (payload.reason as string) || "Local";

  // Find session
  const { data: session } = await supabase
    .from("charging_sessions")
    .select("*")
    .eq("transaction_id", transactionId)
    .eq("status", "active")
    .single();

  if (session) {
    const energyKwh = (meterStop - (session.meter_start || 0)) / 1000;

    await supabase
      .from("charging_sessions")
      .update({
        stop_time: stopTime,
        meter_stop: meterStop,
        energy_kwh: Math.max(0, energyKwh),
        stop_reason: reason,
        status: "completed",
      })
      .eq("id", session.id);
  }

  await supabase
    .from("charge_points")
    .update({ status: "available" })
    .eq("ocpp_id", chargePointId);

  return { idTagInfo: { status: "Accepted" } };
}

async function handleMeterValues(
  supabase: ReturnType<typeof createSupabase>,
  chargePointId: string,
  payload: Record<string, unknown>
) {
  const transactionId = payload.transactionId as number | undefined;

  if (transactionId) {
    const meterValues = payload.meterValue as Array<Record<string, unknown>>;
    if (meterValues && meterValues.length > 0) {
      const lastValue = meterValues[meterValues.length - 1];
      const sampledValues = lastValue.sampledValue as Array<Record<string, unknown>>;
      if (sampledValues && sampledValues.length > 0) {
        const energyValue = sampledValues.find(
          (sv) => (sv.measurand as string) === "Energy.Active.Import.Register"
        ) || sampledValues[0];

        if (energyValue) {
          const currentMeter = parseFloat(energyValue.value as string);
          const { data: session } = await supabase
            .from("charging_sessions")
            .select("meter_start")
            .eq("transaction_id", transactionId)
            .eq("status", "active")
            .single();

          if (session) {
            const energyKwh = (currentMeter - (session.meter_start || 0)) / 1000;
            await supabase
              .from("charging_sessions")
              .update({ energy_kwh: Math.max(0, energyKwh) })
              .eq("transaction_id", transactionId)
              .eq("status", "active");
          }
        }
      }
    }
  }

  return {};
}

// REST endpoint handlers for remote commands
async function handleRemoteCommand(
  supabase: ReturnType<typeof createSupabase>,
  command: string,
  body: Record<string, unknown>,
  tenantId: string
) {
  const chargePointOcppId = body.chargePointId as string;

  switch (command) {
    case "RemoteStartTransaction": {
      const { data: cp } = await supabase
        .from("charge_points")
        .select("id, tenant_id, status")
        .eq("ocpp_id", chargePointOcppId)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (!cp) return { status: "Rejected", message: "Charge point not found" };
      // Normalize status to lowercase: gateways may report "Available" or "available"
      const cpStatus = (cp.status ?? "").toLowerCase();
      if (cpStatus !== "available" && cpStatus !== "unavailable") {
        return { status: "Rejected", message: `Charge point not ready (current status: ${cp.status || "unknown"})` };
      }

      const idTag = (body.idTag as string) || "APP_USER";
      const connectorId = (body.connectorId as number) || 1;

      // Queue command for WebSocket proxy to pick up
      const { data: cmd, error } = await supabase
        .from("pending_ocpp_commands")
        .insert({
          charge_point_ocpp_id: chargePointOcppId,
          command: "RemoteStartTransaction",
          payload: { idTag, connectorId },
          status: "pending",
        })
        .select("id")
        .single();

      if (error) return { status: "Rejected", message: "Failed to queue command" };

      return { status: "Accepted", commandId: cmd.id, message: "Remote start queued" };
    }
    case "RemoteStopTransaction": {
      const transactionId = body.transactionId as number;
      if (!transactionId) return { status: "Rejected", message: "No transaction ID" };

      const { data: session } = await supabase
        .from("charging_sessions")
        .select("*, charge_points!inner(ocpp_id)")
        .eq("transaction_id", transactionId)
        .eq("status", "active")
        .single();

      if (!session) return { status: "Rejected", message: "No active session" };

      // Queue command for WebSocket proxy
      await supabase
        .from("pending_ocpp_commands")
        .insert({
          charge_point_ocpp_id: (session as any).charge_points.ocpp_id,
          command: "RemoteStopTransaction",
          payload: { transactionId },
          status: "pending",
        });

      return { status: "Accepted" };
    }
    case "Reset": {
      await supabase
        .from("charge_points")
        .update({ status: "offline" })
        .eq("ocpp_id", chargePointOcppId);

      await supabase
        .from("pending_ocpp_commands")
        .insert({
          charge_point_ocpp_id: chargePointOcppId,
          command: "Reset",
          payload: { type: (body.type as string) || "Soft" },
          status: "pending",
        });

      return { status: "Accepted" };
    }
    case "UnlockConnector": {
      const connectorId = (body.connectorId as number) || 1;

      await supabase
        .from("pending_ocpp_commands")
        .insert({
          charge_point_ocpp_id: chargePointOcppId,
          command: "UnlockConnector",
          payload: { connectorId },
          status: "pending",
        });

      return { status: "Accepted" };
    }
    case "ChangeAvailability": {
      const connectorId = (body.connectorId as number) || 0;
      const availType = (body.type as string) || "Inoperative";

      await supabase
        .from("pending_ocpp_commands")
        .insert({
          charge_point_ocpp_id: chargePointOcppId,
          command: "ChangeAvailability",
          payload: { connectorId, type: availType },
          status: "pending",
        });

      if (availType === "Inoperative") {
        await supabase
          .from("charge_points")
          .update({ status: "unavailable" })
          .eq("ocpp_id", chargePointOcppId);
      }

      return { status: "Accepted" };
    }
    default:
      return { status: "NotSupported" };
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createSupabase();
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);

// REST commands: POST /ocpp-central/command/{action}
    // These require JWT authentication + tenant ownership
    if (pathParts.length >= 2 && pathParts[pathParts.length - 2] === "command") {
      // Validate JWT
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const token = authHeader.replace("Bearer ", "");
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const authClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user: claimsUser }, error: claimsError } = await authClient.auth.getUser(token);
      if (claimsError || !claimsUser) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const userId = claimsUser.id as string;

      // Verify user's tenant
      const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", userId)
        .single();

      if (!profile?.tenant_id) {
        return new Response(
          JSON.stringify({ error: "Unauthorized - no tenant" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const command = pathParts[pathParts.length - 1];
      const body = await req.json();

      // Verify charge point belongs to user's tenant
      const cpId = body.chargePointId as string;
      if (cpId) {
        const { data: cpCheck } = await supabase
          .from("charge_points")
          .select("tenant_id")
          .eq("ocpp_id", cpId)
          .single();

        if (cpCheck && cpCheck.tenant_id !== profile.tenant_id) {
          return new Response(
            JSON.stringify({ error: "Forbidden - charge point not in your tenant" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const result = await handleRemoteCommand(supabase, command, body, profile.tenant_id);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // OCPP message: POST /ocpp-central/{chargePointId}
    const chargePointId = url.searchParams.get("cp") || pathParts[pathParts.length - 1];

    if (!chargePointId || chargePointId === "ocpp-central") {
      return new Response(
        JSON.stringify({ error: "Missing charge point ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawMessage = await req.json();
    const msg = parseOcppMessage(rawMessage);

    // Logging handled by ocpp-ws-proxy

    if (msg.messageTypeId !== CALL) {
      const errResp = [CALLERROR, msg.uniqueId, "NotSupported", "Only CALL messages supported", {}];
      // No duplicate logging
      return new Response(
        JSON.stringify(errResp),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result: Record<string, unknown>;

    switch (msg.action) {
      case "BootNotification":
        result = await handleBootNotification(supabase, chargePointId, msg.payload!);
        break;
      case "Authorize":
        result = await handleAuthorize(supabase, chargePointId, msg.payload!);
        break;
      case "Heartbeat":
        result = await handleHeartbeat(supabase, chargePointId);
        break;
      case "StatusNotification":
        result = await handleStatusNotification(supabase, chargePointId, msg.payload!);
        break;
      case "StartTransaction":
        result = await handleStartTransaction(supabase, chargePointId, msg.payload!);
        break;
      case "StopTransaction":
        result = await handleStopTransaction(supabase, chargePointId, msg.payload!);
        break;
      case "MeterValues":
        result = await handleMeterValues(supabase, chargePointId, msg.payload!);
        break;
      default: {
        const notImpl = [CALLERROR, msg.uniqueId, "NotImplemented", `Action ${msg.action} not implemented`, {}];
        // No duplicate logging
        return new Response(
          JSON.stringify(notImpl),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const responseMsg = [CALLRESULT, msg.uniqueId, result];
    // No duplicate logging

    return new Response(
      JSON.stringify(responseMsg),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
