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
      "apikey": config.supabaseAnonKey,
      "Authorization": `Bearer ${config.supabaseAnonKey}`,
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

export async function authorizeIdTag(
  tenantId: string,
  idTag: string,
  chargePointId?: string,
): Promise<"Accepted" | "Invalid"> {
  const result = await callBackend<{ status: "Accepted" | "Invalid" }>("authorize-id-tag", {
    tenantId,
    idTag,
    chargePointId,
  });
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
}): Promise<{ id: string; transactionId: number; duplicate?: boolean }> {
  return callBackend<{ id: string; transactionId: number; duplicate?: boolean }>(
    "create-charging-session",
    payload as unknown as Record<string, unknown>,
  );
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

export interface MeterSampleInput {
  connector_id: number;
  measurand: string;
  phase: string | null;
  unit: string | null;
  value: number;
  sampled_at: string;
  context: string | null;
  transaction_id?: number | null;
}

export async function insertMeterSamples(chargePointId: string, samples: MeterSampleInput[]): Promise<void> {
  if (samples.length === 0) return;
  await callBackend("insert-meter-samples", { chargePointId, samples });
}

export interface OcmfRecordInput {
  sessionId: string;
  chargePointId: string | null;
  sampled_at: string;
  context: string;
  meter_format: "OCMF" | "ALFEN" | "NONE";
  raw_payload: string;
  signed_value?: string | null;
  reading_wh?: number | null;
}

export async function insertOcmfRecord(input: OcmfRecordInput): Promise<void> {
  await callBackend("insert-ocmf-record", input as unknown as Record<string, unknown>);
}

export interface CapabilityInput {
  supported_measurands: string[];
  unsupported_keys: string[];
  configuration: Record<string, { value: string | null; readonly: boolean }>;
  vendor?: string | null;
  model?: string | null;
}

export async function upsertCapabilities(chargePointId: string, capabilities: CapabilityInput): Promise<void> {
  await callBackend("upsert-capabilities", { chargePointId, capabilities });
}

/**
 * Liefert das Alter (in Millisekunden) des letzten erfolgreichen Probe-Laufs
 * für diesen Ladepunkt zurück. `null` bedeutet: noch nie geprobt.
 */
export async function getCapabilitiesAgeMs(chargePointId: string): Promise<number | null> {
  const res = await callBackend<{ lastProbedAt: string | null }>("get-capabilities-age", { chargePointId });
  if (!res?.lastProbedAt) return null;
  const t = Date.parse(res.lastProbedAt);
  if (!Number.isFinite(t)) return null;
  return Date.now() - t;
}

export async function recordFirmwareStatus(
  chargePointId: string,
  status: string,
  rawPayload: Record<string, unknown>,
): Promise<void> {
  await callBackend("record-firmware-status", { chargePointId, status, rawPayload });
}



