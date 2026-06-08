import { log } from "./logger";
import type { Session } from "./chargePointRegistry";
import {
  authorizeIdTag,
  createChargingSession,
  getChargingSessionByTransaction,
  insertMeterSamples,
  insertOcmfRecord,
  updateChargePoint,
  updateChargingSession,
  updateConnectorStatus,
  type MeterSampleInput,
} from "./backendApi";
import { probeChargePointConfiguration } from "./configurationProbe";
import { isLegacyWallbe } from "./wallboxCompat";


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
        // Identität für Kompatibilitäts-Checks im Dispatcher cachen.
        session.vendor = (payload.chargePointVendor as string) ?? null;
        session.model = (payload.chargePointModel as string) ?? null;
        session.firmwareVersion = (payload.firmwareVersion as string) ?? null;
        // Capability-Probe und Aktivierung der gewünschten Measurands —
        // wird fire-and-forget asynchron 2s nach BootNotification gestartet,
        // damit der Charger erst seine StatusNotification senden kann.
        // Ausnahme: alte wallbe BF-01.04.x trennt nach GetConfiguration die
        // Verbindung (Code 1006) und läuft sonst in einen Disconnect-Loop.
        const cpMeta = {
          vendor: (payload.chargePointVendor as string) ?? null,
          model: (payload.chargePointModel as string) ?? null,
          firmware_version: (payload.firmwareVersion as string) ?? null,
        };
        if (isLegacyWallbe(cpMeta)) {
          log.info("Skipping config probe for legacy wallbe (BF-01.04.x compat mode)", {
            chargePointId,
            vendor: cpMeta.vendor,
            model: cpMeta.model,
            firmware: cpMeta.firmware_version,
          });
        } else {
          setTimeout(() => {
            probeChargePointConfiguration(session, {
              vendor: cpMeta.vendor,
              model: cpMeta.model,
            }).catch((e) => log.warn("config probe failed", { chargePointId, error: (e as Error).message }));
          }, 2_000);
        }
        // interval = Heartbeat-Obergrenze in Sekunden. Wallbe BF-01.04.x
        // rebootet bei kleinen Werten (z. B. 30) alle ~10 Minuten in einen
        // internen Watchdog. Monta antwortet mit 86400 (= 24 h) — exakt das
        // gleiche Verhalten übernehmen wir hier. Für andere Modelle harmlos:
        // sie senden Heartbeats nur, wenn sonst keine OCPP-Frames fließen.
        return callResult(messageId, {
          currentTime: new Date().toISOString(),
          interval: 86400,
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
            format?: string;
            signedMeterValue?: string;
          }>;
        }>) ?? [];
        const samples: MeterSampleInput[] = [];
        const ocmfPayloads: Array<{ ts: string; raw: string; context: string; signed: string; readingWh: number | null; format: "OCMF" | "ALFEN" }> = [];
        for (const mv of meterValue) {
          const ts = mv.timestamp ?? new Date().toISOString();
          for (const sv of mv.sampledValue ?? []) {
            const numeric = Number(sv.value);
            if (Number.isFinite(numeric)) {
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
            // K1 Eichrecht: signedMeterValue (OCMF) erkennen
            if (sv.signedMeterValue && sv.signedMeterValue.length > 0) {
              const raw = String(sv.signedMeterValue);
              const isOcmf = raw.startsWith("OCMF|") || /^[A-Za-z0-9+/=]+$/.test(raw);
              ocmfPayloads.push({
                ts,
                raw,
                context: sv.context ?? "Sample.Periodic",
                signed: raw,
                readingWh: Number.isFinite(numeric) ? numeric : null,
                format: isOcmf ? "OCMF" : "ALFEN",
              });
            }
          }
        }
        if (samples.length > 0) {
          insertMeterSamples(chargePointPk, samples).catch((e) =>
            log.warn("insert meter samples failed", { chargePointId, error: (e as Error).message }),
          );
        }
        if (ocmfPayloads.length > 0 && transactionId != null) {
          // Session-ID per Lookup
          getChargingSessionByTransaction(chargePointPk, transactionId)
            .then(async (sess) => {
              if (!sess) return;
              for (const p of ocmfPayloads) {
                try {
                  await insertOcmfRecord({
                    sessionId: sess.id,
                    chargePointId: chargePointPk,
                    sampled_at: p.ts,
                    context: p.context,
                    meter_format: p.format,
                    raw_payload: p.raw,
                    signed_value: p.signed,
                    reading_wh: p.readingWh,
                  });
                } catch (e) {
                  log.warn("insert OCMF record failed", { chargePointId, error: (e as Error).message });
                }
              }
            })
            .catch((e) => log.warn("OCMF session lookup failed", { chargePointId, error: (e as Error).message }));
        }
        return callResult(messageId, {});
      }


      case "DataTransfer": {
        return callResult(messageId, { status: "Accepted" });
      }

      case "FirmwareStatusNotification": {
        // Persistieren via Backend-Edge-Function (Eichrecht-Audit: 6 Mon. nach Eichfrist)
        const status = String((payload as Record<string, unknown>).status ?? "");
        try {
          const { recordFirmwareStatus } = await import("./backendApi");
          await recordFirmwareStatus(chargePointPk, status, payload as Record<string, unknown>);
        } catch (e) {
          log.warn("recordFirmwareStatus failed", { chargePointId, error: (e as Error).message });
        }
        return callResult(messageId, {});
      }

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
