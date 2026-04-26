import { config } from "./config";
import { log } from "./logger";

export interface ChargePointRecord {
  id: string;
  ocpp_id: string;
  tenant_id: string;
  auth_required: boolean;
  connection_protocol: string;
}

export interface AuthResult {
  authorized: boolean;
  statusCode: number;
  message: string;
  authSkipped?: boolean;
  chargePoint?: ChargePointRecord;
}

export interface PendingCommandRow {
  id: string;
  charge_point_ocpp_id: string;
  command: string;
  payload: Record<string, unknown> | null;
  status: string;
  scheduled_at: string | null;
}

interface BackendResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

const endpoint = `${config.supabaseUrl.replace(/\/+$/, "")}/functions/v1/ocpp-persistent-api`;

async function callBackend<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ocpp-server-key": config.ocppServerApiKey,
    },
    body: JSON.stringify({ action, ...payload }),
  });

  let body: BackendResponse<T> | null = null;
  try {
    body = await response.json() as BackendResponse<T>;
  } catch {
    // handled below
  }

  if (!response.ok || !body?.ok) {
    const message = body?.error ?? `Backend request failed (${response.status})`;
    log.error("OCPP backend API failed", { action, status: response.status, error: message });
    throw new Error(message);
  }

  return body.data as T;
}

export async function authenticateChargePoint(ocppId: string, authorization?: string): Promise<AuthResult> {
  return callBackend<AuthResult>("authenticate-charge-point", { ocppId, authorization: authorization ?? null });
}

export async function updateChargePoint(id: string, patch: Record<string, unknown>): Promise<void> {
  await callBackend("update-charge-point", { id, patch });
}

export async function updateConnectorStatus(chargePointId: string, connectorId: number, status: string): Promise<void> {
  await callBackend("update-connector-status", { chargePointId, connectorId, status });
}

export async function authorizeIdTag(tenantId: string, idTag: string): Promise<"Accepted" | "Invalid"> {
  const result = await callBackend<{ status: "Accepted" | "Invalid" }>("authorize-id-tag", { tenantId, idTag });
  return result.status;
}

export async function createChargingSession(payload: {
  tenantId: string;
  chargePointId: string;
  connectorId: number;
  idTag: string;
  meterStart: number;
  startTime: string;
  transactionId: number;
}): Promise<{ id: string }> {
  return callBackend<{ id: string }>("create-charging-session", payload as unknown as Record<string, unknown>);
}

export async function getChargingSessionByTransaction(
  chargePointId: string,
  transactionId: number,
): Promise<{ id: string; meter_start: number | null } | null> {
  const result = await callBackend<{ session: { id: string; meter_start: number | null } | null }>(
    "get-charging-session",
    { chargePointId, transactionId },
  );
  return result.session;
}

export async function updateChargingSession(id: string, patch: Record<string, unknown>): Promise<void> {
  await callBackend("update-charging-session", { id, patch });
}

export async function logOcppFrame(
  chargePointId: string,
  direction: "incoming" | "outgoing",
  raw: string,
): Promise<void> {
  await callBackend("log-message", { chargePointId, direction, raw });
}

export async function fetchPendingCommands(connectedIds: string[]): Promise<PendingCommandRow[]> {
  const result = await callBackend<{ commands: PendingCommandRow[] }>("fetch-pending-commands", { connectedIds });
  return result.commands;
}

export async function updatePendingCommand(id: string, patch: Record<string, unknown>): Promise<void> {
  await callBackend("update-pending-command", { id, patch });
}
