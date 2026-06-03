import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { normalizeRfidTag, type RfidReadMode } from "../_shared/rfidNormalize.ts";

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

function normalizeOcppStatus(raw: string | null | undefined): "available" | "charging" | "faulted" | "unavailable" | "unconfigured" {
  const s = String(raw ?? "").toLowerCase().trim();
  if (!s) return "unconfigured";
  if (s.includes("fault") || s.includes("error")) return "faulted";
  if (s.includes("unavailable") || s.includes("inoperative")) return "unavailable";
  if (
    s.includes("charg") ||
    s.includes("occup") ||
    s.includes("suspendedev") ||
    s.includes("suspendedevse") ||
    s.includes("preparing") ||
    s.includes("finishing") ||
    s.includes("reserved")
  ) return "charging";
  if (s.includes("avail")) return "available";
  return "unconfigured";
}

async function syncChargePointStatusFromConnectors(chargePointId: string) {
  const { data, error } = await admin
    .from("charge_point_connectors")
    .select("status")
    .eq("charge_point_id", chargePointId);
  if (error) throw error;
  const statuses = (data ?? []).map((row) => normalizeOcppStatus(row.status as string | null));
  const priority = ["faulted", "unavailable", "charging", "unconfigured", "available"] as const;
  const status = priority.find((candidate) => statuses.includes(candidate)) ?? "available";
  await admin.from("charge_points").update({ status }).eq("id", chargePointId);
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
        "supports_charging_profile",
        "supports_change_configuration",
        "rfid_read_mode",
        "linked_meter_id",
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
      await syncChargePointStatusFromConnectors(chargePointId);
      return ok();
    }

    case "authorize-id-tag": {
      const tenantId = String(body.tenantId ?? "");
      const idTag = String(body.idTag ?? "");
      const chargePointId = String(body.chargePointId ?? ""); // PK aus charge_points.id (optional)
      if (!tenantId || !idTag) return fail(400, "Missing tenantId/idTag");

      // Lese-Modus der Wallbox ermitteln (Default: raw)
      let readMode: RfidReadMode = "raw";
      if (chargePointId) {
        const { data: cp } = await admin
          .from("charge_points")
          .select("rfid_read_mode")
          .eq("id", chargePointId)
          .maybeSingle();
        const mode = (cp as { rfid_read_mode?: string } | null)?.rfid_read_mode;
        if (
          mode === "raw" ||
          mode === "byte_reversed" ||
          mode === "nibble_swap" ||
          mode === "byte_reversed_nibble_swap"
        ) {
          readMode = mode;
        }
      }

      const normalizedIdTag = normalizeRfidTag(idTag, readMode);
      console.log(
        `[ocpp-persistent-api] authorize-id-tag raw="${idTag}" mode="${readMode}" normalized="${normalizedIdTag}"`,
      );

      // Case-insensitiver Match: in der DB können RFID-Tags in beliebiger
      // Schreibweise gespeichert sein (z.B. lowercase), normalizeRfidTag liefert
      // jedoch immer Uppercase-Hex. Daher ilike statt eq.
      let { data: user, error } = await admin
        .from("charging_users")
        .select("id, status")
        .eq("tenant_id", tenantId)
        .ilike("rfid_tag", normalizedIdTag)
        .maybeSingle();

      if (!user && !error) {
        const result = await admin
          .from("charging_users")
          .select("id, status")
          .eq("tenant_id", tenantId)
          .ilike("app_tag", normalizedIdTag)
          .maybeSingle();
        user = result.data;
        error = result.error;
      }

      if (error) return fail(500, error.message);
      return ok({ status: user && user.status === "active" ? "Accepted" : "Invalid" });
    }

    case "create-charging-session": {
      const tenantId = String(body.tenantId ?? "");
      const chargePointId = String(body.chargePointId ?? "");
      const connectorId = Number(body.connectorId ?? 1);
      const idTag = String(body.idTag ?? "");
      const meterStart = Number(body.meterStart ?? 0);
      const startTime = String(body.startTime ?? new Date().toISOString());
      const newTransactionId = Number(body.transactionId ?? 0);

      // RFID-Tag gemäß rfid_read_mode der Wallbox normalisieren, damit
      // charging_sessions.id_tag identisch zum Wert in charging_users.rfid_tag
      // ist und der Resolver den Ladevorgang dem Nutzer zuordnen kann.
      let readMode: RfidReadMode = "raw";
      if (chargePointId) {
        const { data: cp } = await admin
          .from("charge_points")
          .select("rfid_read_mode")
          .eq("id", chargePointId)
          .maybeSingle();
        const mode = (cp as { rfid_read_mode?: string } | null)?.rfid_read_mode;
        if (
          mode === "raw" ||
          mode === "byte_reversed" ||
          mode === "nibble_swap" ||
          mode === "byte_reversed_nibble_swap"
        ) {
          readMode = mode;
        }
      }
      const normalizedIdTag = idTag ? normalizeRfidTag(idTag, readMode) : idTag;
      if (normalizedIdTag !== idTag) {
        console.log(
          `[ocpp-persistent-api] create-charging-session raw="${idTag}" mode="${readMode}" normalized="${normalizedIdTag}"`,
        );
      }

      // Dedup: bestehende aktive Session auf demselben CP+Connector suchen.
      const { data: activeSessions } = await admin
        .from("charging_sessions")
        .select("id, transaction_id, meter_start, start_time, id_tag")
        .eq("charge_point_id", chargePointId)
        .eq("connector_id", connectorId)
        .is("stop_time", null)
        .order("start_time", { ascending: false });

      const active = activeSessions ?? [];
      if (active.length > 0) {
        const newest = active[0];
        const ageMs = Date.now() - new Date(newest.start_time as string).getTime();
        const sameStart = Number(newest.meter_start ?? -1) === meterStart;
        const sameTag = String(newest.id_tag ?? "") === normalizedIdTag;

        // Idempotenz: identischer meterStart + idTag innerhalb 5 Minuten -> Duplicate-Retry der Wallbox.
        if (sameStart && sameTag && ageMs < 5 * 60 * 1000) {
          console.warn(
            `[ocpp-persistent-api] duplicate StartTransaction detected, returning existing session ${newest.id} (tx=${newest.transaction_id})`,
          );
          await admin
            .from("charge_point_connectors")
            .update({ status: "Charging", last_status_at: new Date().toISOString() })
            .eq("charge_point_id", chargePointId)
            .eq("connector_id", connectorId);
          await syncChargePointStatusFromConnectors(chargePointId);
          return ok({
            id: newest.id,
            transactionId: Number(newest.transaction_id ?? newTransactionId),
            duplicate: true,
          });
        }
        // Sonst: alte verwaiste aktive Session(en) auf diesem Connector schließen,
        // damit niemals zwei aktive Rows koexistieren ("Belegt"-Phantom).
        const orphanIds = active.map((s) => s.id as string);
        await admin
          .from("charging_sessions")
          .update({
            stop_time: new Date().toISOString(),
            stop_reason: "DuplicateStart",
            status: "orphaned",
          })
          .in("id", orphanIds);
        console.warn(
          `[ocpp-persistent-api] orphaned ${orphanIds.length} stale active session(s) on cp=${chargePointId} connector=${connectorId}`,
        );
      }

      const { data, error } = await admin
        .from("charging_sessions")
        .insert({
          tenant_id: tenantId,
          charge_point_id: chargePointId,
          connector_id: connectorId,
          id_tag: normalizedIdTag,
          meter_start: meterStart,

          start_time: startTime,
          transaction_id: newTransactionId,
          status: "active",
        })
        .select("id")
        .single();
      if (error) return fail(500, error.message);
      await admin
        .from("charge_point_connectors")
        .update({ status: "Charging", last_status_at: new Date().toISOString() })
        .eq("charge_point_id", chargePointId)
        .eq("connector_id", connectorId);
      await syncChargePointStatusFromConnectors(chargePointId);
      return ok({ id: data.id, transactionId: newTransactionId, duplicate: false });
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

    case "insert-meter-samples": {
      // body: { chargePointId, samples: Array<{ connector_id, transaction_id?, measurand, phase?, unit?, value, context?, sampled_at }> }
      const chargePointId = String(body.chargePointId ?? "");
      const samples = Array.isArray(body.samples) ? body.samples as Record<string, unknown>[] : [];
      if (!chargePointId) return fail(400, "Missing charge_point_id");
      if (samples.length === 0) return ok({ inserted: 0 });

      const { data: cp, error: cpErr } = await admin
        .from("charge_points")
        .select("id, tenant_id, linked_meter_id")
        .eq("id", chargePointId)
        .maybeSingle();
      if (cpErr) return fail(500, cpErr.message);
      if (!cp) return fail(404, "Unknown charge_point_id");

      const rows = samples
        .map((s) => {
          const value = Number(s.value);
          if (!Number.isFinite(value)) return null;
          return {
            tenant_id: cp.tenant_id,
            charge_point_id: cp.id,
            connector_id: Number(s.connector_id ?? 1) || 1,
            transaction_id: s.transaction_id != null ? Number(s.transaction_id) : null,
            measurand: String(s.measurand ?? "Energy.Active.Import.Register"),
            phase: s.phase != null ? String(s.phase) : null,
            unit: s.unit != null ? String(s.unit) : null,
            value,
            context: s.context != null ? String(s.context) : null,
            sampled_at: String(s.sampled_at ?? new Date().toISOString()),
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (rows.length === 0) return ok({ inserted: 0 });
      const { error } = await admin.from("ocpp_meter_samples").insert(rows);
      if (error) return fail(500, error.message);

      // cpMap kompatibel zum bestehenden Forwarding-Block unten halten
      const cpMap = new Map([[cp.id as string, cp]]);


      // Power.Active.Import → meter_power_readings forwarden, wenn linked_meter_id gesetzt
      const powerRows: Array<Record<string, unknown>> = [];
      for (const row of rows) {
        if (row.measurand !== "Power.Active.Import") continue;
        const cp = cpMap.get(row.charge_point_id);
        if (!cp?.linked_meter_id) continue;
        // OCPP-Einheit: W oder kW. Wir speichern in kW.
        const unit = (row.unit ?? "W").toUpperCase();
        const powerKw = unit === "KW" ? row.value : row.value / 1000;
        powerRows.push({
          tenant_id: row.tenant_id,
          meter_id: cp.linked_meter_id,
          energy_type: "electricity",
          power_value: powerKw,
          recorded_at: row.sampled_at,
        });
      }
      if (powerRows.length > 0) {
        await admin.from("meter_power_readings").insert(powerRows);
      }
      return ok({ inserted: rows.length, forwarded: powerRows.length });
    }

    case "upsert-capabilities": {
      const chargePointId = String(body.chargePointId ?? "");
      if (!chargePointId) return fail(400, "Missing chargePointId");
      const supported = Array.isArray(body.supportedMeasurands)
        ? body.supportedMeasurands.map(String)
        : [];
      const rawConfig = typeof body.rawConfig === "object" && body.rawConfig ? body.rawConfig : {};
      const maxLen = body.maxSampleLength != null ? Number(body.maxSampleLength) : null;
      const minInt = body.minSampleInterval != null ? Number(body.minSampleInterval) : null;

      const { data: cp, error: cpErr } = await admin
        .from("charge_points")
        .select("tenant_id")
        .eq("id", chargePointId)
        .maybeSingle();
      if (cpErr) return fail(500, cpErr.message);
      if (!cp) return fail(404, "Charge point not found");

      const { error } = await admin
        .from("charge_point_capabilities")
        .upsert({
          charge_point_id: chargePointId,
          tenant_id: cp.tenant_id,
          supported_measurands: supported,
          max_sample_length: maxLen,
          min_sample_interval: minInt,
          raw_config: rawConfig,
          last_probed_at: new Date().toISOString(),
        }, { onConflict: "charge_point_id" });
      if (error) return fail(500, error.message);
      return ok();
    }

    case "get-capabilities-age": {
      const chargePointId = String(body.chargePointId ?? "");
      if (!chargePointId) return fail(400, "Missing chargePointId");
      const { data, error } = await admin
        .from("charge_point_capabilities")
        .select("last_probed_at")
        .eq("charge_point_id", chargePointId)
        .maybeSingle();
      if (error) return fail(500, error.message);
      return ok({ lastProbedAt: data?.last_probed_at ?? null });
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
