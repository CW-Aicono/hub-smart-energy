import { log } from "./logger";
import type { Session } from "./chargePointRegistry";
import {
  authorizeIdTag,
  createChargingSession,
  getChargingSessionByTransaction,
  insertMeterSamples,
  updateChargePoint,
  updateChargingSession,
  updateConnectorStatus,
  type MeterSampleInput,
} from "./backendApi";
import { probeChargePointConfiguration } from "./configurationProbe";


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
          // Reset stale "offline"-Status nach (Re-)Boot. Der reale Status
          // wird gleich darauf per StatusNotification gesetzt.
          status: "available",
        });
        // Capability-Probe und Aktivierung der gewünschten Measurands —
        // wird fire-and-forget asynchron 2s nach BootNotification gestartet,
        // damit der Charger erst seine StatusNotification senden kann.
        setTimeout(() => {
          probeChargePointConfiguration(session, {
            vendor: (payload.chargePointVendor as string) ?? null,
            model: (payload.chargePointModel as string) ?? null,
          }).catch((e) => log.warn("config probe failed", { chargePointId, error: (e as Error).message }));
        }, 2_000);
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
        const status = await authorizeIdTag(tenantId, idTag, chargePointPk);
        return callResult(messageId, { idTagInfo: { status } });
      }

      case "StartTransaction": {
        const idTag = payload.idTag as string;
        const connectorId = payload.connectorId as number;
        const meterStart = payload.meterStart as number;
        const ts = (payload.timestamp as string) ?? new Date().toISOString();
        const proposedTransactionId = Math.floor(Date.now() / 1000) & 0x7fffffff;

        const result = await createChargingSession({
          tenantId,
          chargePointId: chargePointPk,
          connectorId,
          idTag,
          meterStart,
          startTime: ts,
          transactionId: proposedTransactionId,
        });

        if (result.duplicate) {
          log.warn("Duplicate StartTransaction reused existing session", {
            chargePointId,
            connectorId,
            transactionId: result.transactionId,
          });
        }

        return callResult(messageId, {
          transactionId: result.transactionId,
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
        const connectorId = (payload.connectorId as number) ?? 0;
        const transactionId = (payload.transactionId as number) ?? null;
        const meterValue = (payload.meterValue as Array<{
          timestamp: string;
          sampledValue: Array<{
            value: string;
            context?: string;
            measurand?: string;
            phase?: string;
            unit?: string;
          }>;
        }>) ?? [];
        const samples: MeterSampleInput[] = [];
        for (const mv of meterValue) {
          const ts = mv.timestamp ?? new Date().toISOString();
          for (const sv of mv.sampledValue ?? []) {
            const numeric = Number(sv.value);
            if (!Number.isFinite(numeric)) continue;
            samples.push({
              connector_id: connectorId,
              measurand: sv.measurand ?? "Energy.Active.Import.Register",
              phase: sv.phase ?? null,
              unit: sv.unit ?? null,
              value: numeric,
              sampled_at: ts,
              context: sv.context ?? null,
              transaction_id: transactionId,
            });
          }
        }
        if (samples.length > 0) {
          insertMeterSamples(chargePointPk, samples).catch((e) =>
            log.warn("insert meter samples failed", { chargePointId, error: (e as Error).message }),
          );
        }
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
