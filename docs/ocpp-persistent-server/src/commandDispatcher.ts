import { randomUUID } from "crypto";
import { config } from "./config";
import { log } from "./logger";
import { getSession, listSessions } from "./chargePointRegistry";
import { logOcppMessage } from "./messageLog";
import { fetchPendingCommands, updatePendingCommand } from "./backendApi";

interface PendingRow {
  id: string;
  charge_point_ocpp_id: string;
  command: string;
  payload: Record<string, unknown> | null;
  status: string;
  scheduled_at: string | null;
}

function buildOcppCall(uniqueId: string, cmd: PendingRow): unknown[] | null {
  const p = cmd.payload ?? {};
  switch (cmd.command) {
    case "RemoteStartTransaction":
      return [2, uniqueId, "RemoteStartTransaction", {
        connectorId: (p.connectorId as number) ?? 1,
        idTag: (p.idTag as string) ?? "APP_USER",
      }];
    case "RemoteStopTransaction":
      return [2, uniqueId, "RemoteStopTransaction", {
        transactionId: p.transactionId as number,
      }];
    case "Reset":
      return [2, uniqueId, "Reset", { type: (p.type as string) ?? "Soft" }];
    case "UnlockConnector":
      return [2, uniqueId, "UnlockConnector", { connectorId: (p.connectorId as number) ?? 1 }];
    case "ChangeConfiguration":
      return [2, uniqueId, "ChangeConfiguration", {
        key: p.key as string,
        value: String(p.value ?? ""),
      }];
    case "ChangeAvailability":
      return [2, uniqueId, "ChangeAvailability", {
        connectorId: (p.connectorId as number) ?? 0,
        type: (p.type as string) ?? "Operative",
      }];
    case "SetChargingProfile":
      return [2, uniqueId, "SetChargingProfile", {
        connectorId: (p.connectorId as number) ?? 0,
        csChargingProfiles: p.csChargingProfiles as Record<string, unknown>,
      }];
    case "ClearChargingProfile":
      return [2, uniqueId, "ClearChargingProfile", {
        ...(p.id !== undefined ? { id: p.id as number } : {}),
        connectorId: (p.connectorId as number) ?? 0,
        chargingProfilePurpose: (p.chargingProfilePurpose as string) ?? "TxDefaultProfile",
        ...(p.stackLevel !== undefined ? { stackLevel: p.stackLevel as number } : {}),
      }];
    case "GetCompositeSchedule":
      return [2, uniqueId, "GetCompositeSchedule", {
        connectorId: (p.connectorId as number) ?? 0,
        duration: (p.duration as number) ?? 3600,
      }];
    default:
      return null;
  }
}

async function dispatchOne(cmd: PendingRow): Promise<void> {
  const session = getSession(cmd.charge_point_ocpp_id);
  if (!session || session.socket.readyState !== session.socket.OPEN) {
    return; // Wallbox nicht verbunden — beim nächsten Tick erneut versuchen
  }

  const uniqueId = randomUUID();
  const ocppCall = buildOcppCall(uniqueId, cmd);
  if (!ocppCall) {
    await updatePendingCommand(cmd.id, {
      status: "rejected",
      processed_at: new Date().toISOString(),
      result: { error: `Unknown command ${cmd.command}` },
    });
    return;
  }

  const callStr = JSON.stringify(ocppCall);
  await logOcppMessage(cmd.charge_point_ocpp_id, "outgoing", callStr);
  await updatePendingCommand(cmd.id, {
    status: "sent",
    processed_at: new Date().toISOString(),
  });
  session.pendingCalls.set(uniqueId, {
    commandId: cmd.id,
    createdAt: Date.now(),
    command: cmd.command,
    chargePointPk: session.chargePointPk,
  });
  session.socket.send(callStr);
  session.lastOutgoingAt = Date.now();
  log.info("Command dispatched", { cmd: cmd.command, chargePointId: cmd.charge_point_ocpp_id, uniqueId });
}

async function fetchAndDispatch() {
  // Hole offene Befehle nur für aktuell verbundene Wallboxen
  const connectedIds = listSessions().map(s => s.chargePointId);
  if (connectedIds.length === 0) return;

  let data: PendingRow[] = [];
  try {
    data = await fetchPendingCommands(connectedIds);
  } catch (error) {
    log.error("fetch pending commands failed", { error: (error as Error).message });
    return;
  }
  for (const cmd of data) {
    await dispatchOne(cmd);
  }
}

export function startCommandDispatcher() {
  // Polling
  let pollTimer: NodeJS.Timeout | null = null;
  if (config.commandPollIntervalMs > 0) {
    pollTimer = setInterval(fetchAndDispatch, config.commandPollIntervalMs);
    log.info("Command polling enabled", { intervalMs: config.commandPollIntervalMs });
  }

  // Echtzeit ist mit der begrenzten Backend-Funktion nicht verfügbar.
  // Polling alle 2 Sekunden reicht für Remote-Commands aus.
  return () => { if (pollTimer) clearInterval(pollTimer); };
}

/** Antwort vom Charger einem ausstehenden Command zuordnen und in DB schreiben. */
export async function resolvePendingCall(
  chargePointId: string,
  uniqueId: string,
  result: { status: "Accepted" | "Rejected"; payload?: unknown; errorCode?: string; errorDescription?: string },
): Promise<boolean> {
  const session = getSession(chargePointId);
  if (!session) return false;
  const pending = session.pendingCalls.get(uniqueId);
  if (!pending) return false;
  session.pendingCalls.delete(uniqueId);

  // Capability auto-detection: when a SetChargingProfile call comes back as
  // CALLERROR with NotSupported / NotImplemented, flip the wallbox flag so the
  // power-limit-scheduler uses ChangeConfiguration on the next tick.
  const errorCode = (result.errorCode ?? "").toString();
  const isNotSupported = ["NotSupported", "NotImplemented"].includes(errorCode);
  if (pending.command === "SetChargingProfile" && pending.chargePointPk && isNotSupported) {
    try {
      const { updateChargePoint } = await import("./backendApi");
      await updateChargePoint(pending.chargePointPk, { supports_charging_profile: false });
      log.warn("Wallbox flagged as not supporting SetChargingProfile — will use ChangeConfiguration next tick", {
        chargePointId,
        errorCode,
      });
    } catch (e) {
      log.error("failed to flag SetChargingProfile capability", { error: (e as Error).message });
    }
  }

  // First-time success of SetChargingProfile -> record capability as supported
  if (pending.command === "SetChargingProfile" && pending.chargePointPk && result.status === "Accepted") {
    try {
      const { updateChargePoint } = await import("./backendApi");
      await updateChargePoint(pending.chargePointPk, { supports_charging_profile: true });
    } catch {
      /* ignore */
    }
  }

  await updatePendingCommand(pending.commandId, {
    status: errorCode ? "failed" : "completed",
    result: result as unknown as Record<string, unknown>,
  });
  log.info("Command response received", { chargePointId, uniqueId, status: result.status, errorCode });
  return true;
}
