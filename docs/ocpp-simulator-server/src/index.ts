/**
 * AICONO EMS - OCPP 1.6 Wallbox-Simulator-Service (v1.1)
 * ------------------------------------------------------
 * Erweitert um:
 *  - Konfigurierbare Ladeleistung (powerKw)
 *  - Live-Steuerung: setPower, pause, resume, unplug
 *  - Echte idTags (statt fester SIM-IDTAG)
 *  - Fehlersimulation (fault / clearFault) mit OCPP-1.6-Errorcodes
 *  - Live-OCPP-Logs (Ringpuffer, GET /logs?id=...)
 */

import http, { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";

// ============================================================
// Konfiguration aus Umgebungsvariablen
// ============================================================
const API_KEY = process.env.SIMULATOR_API_KEY ?? "";
const PORT = Number(process.env.PORT ?? 8090);
const MAX_PER_TENANT = Number(process.env.MAX_INSTANCES_PER_TENANT ?? 3);
const MAX_TOTAL = Number(process.env.MAX_TOTAL_INSTANCES ?? 50);
const TICK_SECONDS = 30;
const LOG_RING_SIZE = 50;

if (!API_KEY || API_KEY.length < 16) {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      msg: "SIMULATOR_API_KEY missing or too short. Set it in .env (min. 16 chars).",
    }),
  );
  process.exit(1);
}

// ============================================================
// Logging-Helfer (strukturiertes JSON)
// ============================================================
type LogLevel = "info" | "warn" | "error";
function log(level: LogLevel, msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra }));
}

// ============================================================
// Simulator-Instanzen (in-memory)
// ============================================================
type SimStatus = "connecting" | "online" | "charging" | "stopped" | "error" | "faulted";

interface OcppLogEntry {
  ts: string;
  dir: "in" | "out";
  action: string;
  payload: unknown;
}

interface SimInstance {
  id: string;
  tenantId: string;
  ocppId: string;
  protocol: "ws" | "wss";
  serverHost: string;
  ocppPassword: string | null;
  vendor: string;
  model: string;
  ws: WebSocket | null;
  status: SimStatus;
  lastError: string | null;
  startedAt: string;
  meterWh: number;
  transactionId: number | null;
  intervals: NodeJS.Timeout[];
  pendingCalls: Map<string, (payload: unknown) => void>;
  // Neu in v1.1:
  powerKw: number;
  idTag: string;
  paused: boolean;
  logRing: OcppLogEntry[];
}

const instances = new Map<string, SimInstance>();

function instancesByTenant(tenantId: string): SimInstance[] {
  return [...instances.values()].filter((i) => i.tenantId === tenantId);
}

function pushLog(inst: SimInstance, dir: "in" | "out", action: string, payload: unknown): void {
  inst.logRing.push({ ts: new Date().toISOString(), dir, action, payload });
  if (inst.logRing.length > LOG_RING_SIZE) {
    inst.logRing.splice(0, inst.logRing.length - LOG_RING_SIZE);
  }
}

// ============================================================
// OCPP-1.6-Helpers
// ============================================================
function ocppCall(action: string, payload: Record<string, unknown>): [2, string, string, Record<string, unknown>] {
  const messageId = randomUUID();
  return [2, messageId, action, payload];
}

function sendCall(
  inst: SimInstance,
  action: string,
  payload: Record<string, unknown>,
  onResult?: (payload: unknown) => void,
): void {
  if (!inst.ws || inst.ws.readyState !== WebSocket.OPEN) return;
  const msg = ocppCall(action, payload);
  if (onResult) inst.pendingCalls.set(msg[1], onResult);
  inst.ws.send(JSON.stringify(msg));
  pushLog(inst, "out", action, payload);
  log("info", "OCPP -> server", { id: inst.id, action, messageId: msg[1] });
}

function handleIncoming(inst: SimInstance, raw: WebSocket.RawData): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString());
  } catch {
    log("warn", "Invalid JSON from server", { id: inst.id });
    return;
  }

  if (!Array.isArray(parsed)) return;
  const [messageType, messageId] = parsed as [number, string, ...unknown[]];

  if (messageType === 3) {
    const payload = parsed[2];
    pushLog(inst, "in", "CALLRESULT", payload);
    const cb = inst.pendingCalls.get(messageId);
    if (cb) {
      inst.pendingCalls.delete(messageId);
      cb(payload);
    }
    return;
  }

  if (messageType === 2) {
    const action = parsed[2] as string;
    const payload = parsed[3];
    pushLog(inst, "in", action, payload);
    log("info", "OCPP <- server CALL", { id: inst.id, action, messageId });
    const result =
      action === "RemoteStartTransaction" || action === "RemoteStopTransaction"
        ? { status: "Accepted" }
        : action === "GetConfiguration"
        ? { configurationKey: [], unknownKey: [] }
        : { status: "Accepted" };
    inst.ws?.send(JSON.stringify([3, messageId, result]));

    if (action === "RemoteStartTransaction" && inst.status === "online") {
      setTimeout(() => startTransaction(inst), 500);
    }
    if (action === "RemoteStopTransaction" && inst.status === "charging") {
      setTimeout(() => stopTransaction(inst), 500);
    }
    return;
  }

  if (messageType === 4) {
    pushLog(inst, "in", "CALLERROR", parsed);
    log("warn", "OCPP <- server CALLERROR", { id: inst.id, payload: parsed });
    return;
  }
}

// ============================================================
// OCPP-Lifecycle pro Simulator
// ============================================================
function startBootSequence(inst: SimInstance): void {
  sendCall(
    inst,
    "BootNotification",
    {
      chargePointVendor: inst.vendor,
      chargePointModel: inst.model,
      firmwareVersion: "sim-1.1.0",
    },
    () => {
      inst.status = "online";
      sendCall(inst, "StatusNotification", {
        connectorId: 1,
        errorCode: "NoError",
        status: "Available",
      });
      const hb = setInterval(() => {
        sendCall(inst, "Heartbeat", {});
      }, 30_000);
      inst.intervals.push(hb);
    },
  );
}

function startTransaction(inst: SimInstance): void {
  if (inst.status !== "online") return;
  const meterStart = inst.meterWh;
  sendCall(
    inst,
    "StartTransaction",
    {
      connectorId: 1,
      idTag: inst.idTag,
      meterStart,
      timestamp: new Date().toISOString(),
    },
    (payload) => {
      const p = payload as { transactionId?: number; idTagInfo?: { status?: string } };
      if (p?.idTagInfo?.status === "Accepted" && typeof p.transactionId === "number") {
        inst.transactionId = p.transactionId;
        inst.status = "charging";
        inst.paused = false;
        sendCall(inst, "StatusNotification", {
          connectorId: 1,
          errorCode: "NoError",
          status: "Charging",
        });
        // MeterValues alle TICK_SECONDS, Wh-Zuwachs anhand powerKw
        const mv = setInterval(() => {
          if (inst.paused) return;
          const tickWh = (inst.powerKw * 1000 * TICK_SECONDS) / 3600;
          inst.meterWh += tickWh;
          sendCall(inst, "MeterValues", {
            connectorId: 1,
            transactionId: inst.transactionId,
            meterValue: [
              {
                timestamp: new Date().toISOString(),
                sampledValue: [
                  {
                    value: String(Math.round(inst.meterWh)),
                    context: "Sample.Periodic",
                    measurand: "Energy.Active.Import.Register",
                    unit: "Wh",
                  },
                  {
                    value: String(Math.round(inst.powerKw * 1000)),
                    context: "Sample.Periodic",
                    measurand: "Power.Active.Import",
                    unit: "W",
                  },
                ],
              },
            ],
          });
        }, TICK_SECONDS * 1000);
        inst.intervals.push(mv);
      } else {
        log("warn", "StartTransaction rejected", { id: inst.id, payload });
      }
    },
  );
}

function stopTransaction(inst: SimInstance): void {
  if (inst.status !== "charging" || inst.transactionId === null) return;
  sendCall(
    inst,
    "StopTransaction",
    {
      transactionId: inst.transactionId,
      idTag: inst.idTag,
      meterStop: Math.round(inst.meterWh),
      timestamp: new Date().toISOString(),
    },
    () => {
      inst.transactionId = null;
      inst.status = "online";
      inst.paused = false;
      // Tick-Intervalle stoppen, Heartbeat behalten
      // (intervals[0] = Heartbeat, alle weiteren = MeterValues etc.)
      if (inst.intervals.length > 1) {
        for (let i = 1; i < inst.intervals.length; i++) {
          clearInterval(inst.intervals[i]);
        }
        inst.intervals = inst.intervals.slice(0, 1);
      }
      sendCall(inst, "StatusNotification", {
        connectorId: 1,
        errorCode: "NoError",
        status: "Available",
      });
    },
  );
}

// Live-Steuerungs-Aktionen
function setPower(inst: SimInstance, kw: number): void {
  const clamped = Math.max(0, Math.min(350, kw));
  inst.powerKw = clamped;
  log("info", "Power changed", { id: inst.id, powerKw: clamped });
}

function pauseCharging(inst: SimInstance): void {
  if (inst.status !== "charging") return;
  inst.paused = true;
  sendCall(inst, "StatusNotification", {
    connectorId: 1,
    errorCode: "NoError",
    status: "SuspendedEV",
  });
}

function resumeCharging(inst: SimInstance): void {
  if (inst.status !== "charging") return;
  inst.paused = false;
  sendCall(inst, "StatusNotification", {
    connectorId: 1,
    errorCode: "NoError",
    status: "Charging",
  });
}

function unplug(inst: SimInstance): void {
  if (inst.status === "charging") stopTransaction(inst);
  setTimeout(() => {
    sendCall(inst, "StatusNotification", {
      connectorId: 1,
      errorCode: "NoError",
      status: "Finishing",
    });
    setTimeout(() => {
      sendCall(inst, "StatusNotification", {
        connectorId: 1,
        errorCode: "NoError",
        status: "Available",
      });
    }, 500);
  }, 300);
}

const VALID_ERRORS = new Set([
  "ConnectorLockFailure",
  "EVCommunicationError",
  "GroundFailure",
  "HighTemperature",
  "InternalError",
  "LocalListConflict",
  "NoError",
  "OtherError",
  "OverCurrentFailure",
  "OverVoltage",
  "PowerMeterFailure",
  "PowerSwitchFailure",
  "ReaderFailure",
  "ResetFailure",
  "UnderVoltage",
  "WeakSignal",
]);

function injectFault(inst: SimInstance, errorCode: string): void {
  const code = VALID_ERRORS.has(errorCode) ? errorCode : "OtherError";
  inst.status = "faulted";
  inst.lastError = code;
  sendCall(inst, "StatusNotification", {
    connectorId: 1,
    errorCode: code,
    status: "Faulted",
    info: `Simulated fault: ${code}`,
  });
}

function clearFault(inst: SimInstance): void {
  inst.lastError = null;
  inst.status = inst.transactionId !== null ? "charging" : "online";
  sendCall(inst, "StatusNotification", {
    connectorId: 1,
    errorCode: "NoError",
    status: inst.transactionId !== null ? "Charging" : "Available",
  });
}

function buildWebSocketUrl(inst: SimInstance): string {
  return `${inst.protocol}://${inst.serverHost}/${encodeURIComponent(inst.ocppId)}`;
}

function connectWebSocket(inst: SimInstance): void {
  const url = buildWebSocketUrl(inst);
  const headers: Record<string, string> = {};
  if (inst.ocppPassword) {
    const basic = Buffer.from(`${inst.ocppId}:${inst.ocppPassword}`).toString("base64");
    headers["Authorization"] = `Basic ${basic}`;
  }
  log("info", "Connecting WebSocket", { id: inst.id, url, withPassword: !!inst.ocppPassword });

  const ws = new WebSocket(url, ["ocpp1.6"], { headers });
  inst.ws = ws;

  ws.on("open", () => {
    log("info", "WebSocket open", { id: inst.id });
    startBootSequence(inst);
  });

  ws.on("message", (data) => handleIncoming(inst, data));

  ws.on("close", (code, reason) => {
    log("warn", "WebSocket closed", {
      id: inst.id,
      code,
      reason: reason?.toString() ?? "",
    });
    inst.status = code === 1000 ? "stopped" : "error";
    inst.lastError = `WebSocket closed (code ${code})`;
    inst.intervals.forEach(clearInterval);
    inst.intervals = [];
  });

  ws.on("error", (err) => {
    log("error", "WebSocket error", { id: inst.id, error: err.message });
    inst.status = "error";
    inst.lastError = err.message;
  });
}

function shutdownInstance(inst: SimInstance): void {
  inst.intervals.forEach(clearInterval);
  inst.intervals = [];
  if (inst.transactionId !== null) {
    try { stopTransaction(inst); } catch { /* ignore */ }
  }
  try { inst.ws?.close(1000, "Simulator stopped by API"); } catch { /* ignore */ }
  inst.status = "stopped";
}

// ============================================================
// HTTP-API
// ============================================================
type StartBody = {
  tenantId: string;
  ocppId: string;
  protocol?: "ws" | "wss";
  serverHost?: string;
  ocppPassword?: string | null;
  vendor?: string;
  model?: string;
  powerKw?: number;
  idTag?: string;
};

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function authOk(req: IncomingMessage): boolean {
  const auth = req.headers["authorization"];
  if (typeof auth !== "string") return false;
  if (!auth.startsWith("Bearer ")) return false;
  return auth.slice(7) === API_KEY;
}

function instanceToDto(inst: SimInstance) {
  return {
    id: inst.id,
    tenantId: inst.tenantId,
    ocppId: inst.ocppId,
    protocol: inst.protocol,
    serverHost: inst.serverHost,
    vendor: inst.vendor,
    model: inst.model,
    status: inst.status,
    lastError: inst.lastError,
    startedAt: inst.startedAt,
    meterWh: Math.round(inst.meterWh),
    transactionId: inst.transactionId,
    powerKw: inst.powerKw,
    idTag: inst.idTag,
    paused: inst.paused,
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, { ok: true, instances: instances.size, version: "1.1.0" });
  }

  if (!authOk(req)) {
    return send(res, 401, { error: "Unauthorized" });
  }

  const url = req.url ?? "";
  const parsedUrl = new URL(url, "http://localhost");
  const pathname = parsedUrl.pathname;

  // --- POST /start ----------------------------------------------------------
  if (req.method === "POST" && (pathname === "/start" || pathname === "/sim-api/start")) {
    let body: StartBody;
    try {
      body = (await readJson(req)) as StartBody;
    } catch {
      return send(res, 400, { error: "Invalid JSON" });
    }

    if (!body.tenantId || !body.ocppId) {
      return send(res, 400, { error: "tenantId and ocppId are required" });
    }
    if (instances.size >= MAX_TOTAL) {
      return send(res, 429, { error: `Global limit reached (${MAX_TOTAL})` });
    }
    if (instancesByTenant(body.tenantId).length >= MAX_PER_TENANT) {
      return send(res, 429, {
        error: `Tenant limit reached (${MAX_PER_TENANT} per tenant)`,
      });
    }

    const inst: SimInstance = {
      id: randomUUID(),
      tenantId: body.tenantId,
      ocppId: body.ocppId,
      protocol: body.protocol === "ws" ? "ws" : "wss",
      serverHost: body.serverHost ?? "ocpp.aicono.org",
      ocppPassword: body.ocppPassword ?? null,
      vendor: body.vendor ?? "AICONO",
      model: body.model ?? "Simulator",
      ws: null,
      status: "connecting",
      lastError: null,
      startedAt: new Date().toISOString(),
      meterWh: 0,
      transactionId: null,
      intervals: [],
      pendingCalls: new Map(),
      powerKw: typeof body.powerKw === "number" && body.powerKw > 0 ? body.powerKw : 11,
      idTag: body.idTag && body.idTag.length > 0 ? body.idTag : "SIM-IDTAG",
      paused: false,
      logRing: [],
    };
    instances.set(inst.id, inst);
    connectWebSocket(inst);
    return send(res, 200, instanceToDto(inst));
  }

  // --- POST /action ---------------------------------------------------------
  if (req.method === "POST" && (pathname === "/action" || pathname === "/sim-api/action")) {
    let body: { id?: string; action?: string; value?: number | string };
    try {
      body = (await readJson(req)) as { id?: string; action?: string; value?: number | string };
    } catch {
      return send(res, 400, { error: "Invalid JSON" });
    }
    const inst = body.id ? instances.get(body.id) : undefined;
    if (!inst) return send(res, 404, { error: "Instance not found" });
    const action = body.action;
    switch (action) {
      case "startTx": startTransaction(inst); break;
      case "stopTx": stopTransaction(inst); break;
      case "setPower": setPower(inst, Number(body.value ?? inst.powerKw)); break;
      case "pause": pauseCharging(inst); break;
      case "resume": resumeCharging(inst); break;
      case "unplug": unplug(inst); break;
      case "fault": injectFault(inst, String(body.value ?? "OtherError")); break;
      case "clearFault": clearFault(inst); break;
      default: return send(res, 400, { error: "Unknown action" });
    }
    return send(res, 200, instanceToDto(inst));
  }

  // --- POST /stop -----------------------------------------------------------
  if (req.method === "POST" && (pathname === "/stop" || pathname === "/sim-api/stop")) {
    let body: { id?: string };
    try {
      body = (await readJson(req)) as { id?: string };
    } catch {
      return send(res, 400, { error: "Invalid JSON" });
    }
    const inst = body.id ? instances.get(body.id) : undefined;
    if (!inst) return send(res, 404, { error: "Instance not found" });
    shutdownInstance(inst);
    instances.delete(inst.id);
    return send(res, 200, { ok: true, id: inst.id });
  }

  // --- GET /status ----------------------------------------------------------
  if (req.method === "GET" && (pathname === "/status" || pathname === "/sim-api/status")) {
    const tenantId = parsedUrl.searchParams.get("tenantId");
    const list = tenantId ? instancesByTenant(tenantId) : [...instances.values()];
    return send(res, 200, { instances: list.map(instanceToDto) });
  }

  // --- GET /logs?id=... -----------------------------------------------------
  if (req.method === "GET" && (pathname === "/logs" || pathname === "/sim-api/logs")) {
    const id = parsedUrl.searchParams.get("id");
    if (!id) return send(res, 400, { error: "id query param required" });
    const inst = instances.get(id);
    if (!inst) return send(res, 404, { error: "Instance not found" });
    return send(res, 200, { logs: inst.logRing });
  }

  return send(res, 404, { error: "Not found" });
});

server.listen(PORT, "0.0.0.0", () => {
  log("info", "OCPP Simulator API listening", {
    port: PORT,
    maxPerTenant: MAX_PER_TENANT,
    maxTotal: MAX_TOTAL,
    version: "1.1.0",
  });
});

// ============================================================
// Graceful shutdown
// ============================================================
function shutdownAll(signal: string): void {
  log("info", "Shutdown signal received", { signal });
  instances.forEach(shutdownInstance);
  instances.clear();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", () => shutdownAll("SIGTERM"));
process.on("SIGINT", () => shutdownAll("SIGINT"));
