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
        // Self-healing: stellt ws_connected=true sicher, falls der initiale
        // Connect-Update fehlgeschlagen ist.
        await updateChargePoint(chargePointPk, {
          vendor: payload.chargePointVendor as string ?? null,
          model: payload.chargePointModel as string ?? null,
          firmware_version: payload.firmwareVersion as string ?? null,
          last_heartbeat: new Date().toISOString(),
          ws_connected: true,
          ws_connected_since: new Date().toISOString(),
        });
        return callResult(messageId, {
          currentTime: new Date().toISOString(),
          interval: 30,
          status: "Accepted",
        });
      }

      case "Heartbeat": {
        // Self-healing: jeder Heartbeat bestätigt ws_connected=true.
        // So korrigiert sich der Status spätestens nach 30 s, falls der
        // initiale Connect-Update einen Backend-Fehler hatte.
        await updateChargePoint(chargePointPk, {
          last_heartbeat: new Date().toISOString(),
          ws_connected: true,
        });
        return callResult(messageId, { currentTime: new Date().toISOString() });
      }

      case "StatusNotification": {
        const connectorId = (payload.connectorId as number) ?? 0;
        const status = (payload.status as string) ?? "Unknown";
        if (connectorId > 0) {
          await updateConnectorStatus(chargePointPk, connectorId, status);
        }
        if (connectorId === 0) {
          await updateChargePoint(chargePointPk, { status });
        }
        return callResult(messageId, {});
      }

      case "Authorize": {
        const idTag = payload.idTag as string;
        const status = await authorizeIdTag(tenantId, idTag);
        return callResult(messageId, { idTagInfo: { status } });
      }

      case "StartTransaction": {
        const idTag = payload.idTag as string;
        const connectorId = payload.connectorId as number;
        const meterStart = payload.meterStart as number;
        const ts = (payload.timestamp as string) ?? new Date().toISOString();
        const transactionId = Math.floor(Date.now() / 1000) & 0x7fffffff;

        await createChargingSession({
          tenantId,
          chargePointId: chargePointPk,
          connectorId,
          idTag,
          meterStart,
          startTime: ts,
          transactionId,
        });

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
        const row = await getChargingSessionByTransaction(chargePointPk, transactionId);
        if (row) {
          const energyKwh = Math.max(0, (meterStop - (row.meter_start ?? 0)) / 1000);
          await updateChargingSession(row.id, {
            meter_stop: meterStop,
            stop_time: ts,
            stop_reason: reason,
            status: "completed",
            energy_kwh: energyKwh,
          });
        }
        return callResult(messageId, { idTagInfo: { status: "Accepted" } });
      }

      case "MeterValues": {
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
