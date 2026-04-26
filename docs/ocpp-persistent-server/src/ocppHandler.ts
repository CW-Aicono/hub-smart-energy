import { log } from "./logger";
import type { Session } from "./chargePointRegistry";
import {
  authorizeIdTag,
  createChargingSession,
  getChargingSessionByTransaction,
  updateChargePoint,
  updateChargingSession,
  updateConnectorStatus,
} from "./backendApi";

type OcppCall = [2, string, string, Record<string, unknown>];
type OcppCallResult = [3, string, Record<string, unknown>];
type OcppCallError = [4, string, string, string, Record<string, unknown>];

function callResult(messageId: string, payload: Record<string, unknown>): OcppCallResult {
  return [3, messageId, payload];
}

function callError(messageId: string, code: string, desc: string): OcppCallError {
  return [4, messageId, code, desc, {}];
}

/**
 * Verarbeitet eine eingehende OCPP-CALL (Action vom Charger an Server).
 * Gibt CALLRESULT oder CALLERROR zurück, das an den Charger zurückgesendet wird.
 */
export async function handleCall(
  session: Session,
  call: OcppCall,
): Promise<OcppCallResult | OcppCallError> {
  const [, messageId, action, payload] = call;
  const { chargePointId, chargePointPk, tenantId } = session;

  try {
    switch (action) {
      case "BootNotification": {
        await supabase.from("charge_points").update({
          vendor: payload.chargePointVendor as string ?? null,
          model: payload.chargePointModel as string ?? null,
          firmware_version: payload.firmwareVersion as string ?? null,
          last_heartbeat: new Date().toISOString(),
        }).eq("id", chargePointPk);
        return callResult(messageId, {
          currentTime: new Date().toISOString(),
          interval: 30,
          status: "Accepted",
        });
      }

      case "Heartbeat": {
        await supabase.from("charge_points").update({
          last_heartbeat: new Date().toISOString(),
        }).eq("id", chargePointPk);
        return callResult(messageId, { currentTime: new Date().toISOString() });
      }

      case "StatusNotification": {
        const connectorId = (payload.connectorId as number) ?? 0;
        const status = (payload.status as string) ?? "Unknown";
        // Connector-Status aktualisieren (nur wenn connectorId > 0)
        if (connectorId > 0) {
          await supabase.from("charge_point_connectors")
            .update({ status, last_status_at: new Date().toISOString() })
            .eq("charge_point_id", chargePointPk)
            .eq("connector_id", connectorId);
        }
        // Charge-Point-Status (connector 0 = gesamtes Gerät)
        if (connectorId === 0) {
          await supabase.from("charge_points").update({ status }).eq("id", chargePointPk);
        }
        return callResult(messageId, {});
      }

      case "Authorize": {
        const idTag = payload.idTag as string;
        const { data: user } = await supabase
          .from("charging_users")
          .select("id, status")
          .eq("tenant_id", tenantId)
          .or(`rfid_tag.eq.${idTag},app_tag.eq.${idTag}`)
          .maybeSingle();
        const status = user && user.status === "active" ? "Accepted" : "Invalid";
        return callResult(messageId, { idTagInfo: { status } });
      }

      case "StartTransaction": {
        const idTag = payload.idTag as string;
        const connectorId = payload.connectorId as number;
        const meterStart = payload.meterStart as number;
        const ts = (payload.timestamp as string) ?? new Date().toISOString();

        const { data: session } = await supabase
          .from("charging_sessions")
          .insert({
            tenant_id: tenantId,
            charge_point_id: chargePointPk,
            connector_id: connectorId,
            id_tag: idTag,
            meter_start: meterStart,
            start_time: ts,
            status: "active",
          })
          .select("id")
          .single();
        // OCPP transactionId als 32-bit int (vereinfachend: timestamp)
        const transactionId = Math.floor(Date.now() / 1000) & 0x7fffffff;
        if (session) {
          await supabase.from("charging_sessions")
            .update({ transaction_id: transactionId })
            .eq("id", session.id);
        }
        return callResult(messageId, {
          transactionId,
          idTagInfo: { status: "Accepted" },
        });
      }

      case "StopTransaction": {
        const transactionId = payload.transactionId as number;
        const meterStop = payload.meterStop as number;
        const ts = (payload.timestamp as string) ?? new Date().toISOString();
        const reason = (payload.reason as string) ?? null;
        const { data: row } = await supabase
          .from("charging_sessions")
          .select("id, meter_start")
          .eq("charge_point_id", chargePointPk)
          .eq("transaction_id", transactionId)
          .maybeSingle();
        if (row) {
          const energyKwh = Math.max(0, (meterStop - (row.meter_start ?? 0)) / 1000);
          await supabase.from("charging_sessions").update({
            meter_stop: meterStop,
            stop_time: ts,
            stop_reason: reason,
            status: "completed",
            energy_kwh: energyKwh,
          }).eq("id", row.id);
        }
        return callResult(messageId, { idTagInfo: { status: "Accepted" } });
      }

      case "MeterValues": {
        // Persistenz der Messwerte erfolgt via ocpp_message_log; hier nur acken.
        return callResult(messageId, {});
      }

      case "DataTransfer": {
        return callResult(messageId, { status: "Accepted" });
      }

      case "FirmwareStatusNotification":
      case "DiagnosticsStatusNotification": {
        return callResult(messageId, {});
      }

      default:
        log.warn("Unsupported OCPP action", { action, chargePointId });
        return callError(messageId, "NotImplemented", `Action ${action} not implemented`);
    }
  } catch (e) {
    log.error("handleCall error", { action, chargePointId, error: (e as Error).message });
    return callError(messageId, "InternalError", (e as Error).message);
  }
}
