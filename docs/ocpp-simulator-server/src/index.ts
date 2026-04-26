/**
 * AICONO EMS - OCPP 1.6 Wallbox-Simulator-Service
 * ------------------------------------------------
 * Laeuft als eigenstaendiger Container auf Hetzner.
 *
 * Verantwortlichkeiten:
 *  - HTTP-API zum Starten/Stoppen/Abfragen von simulierten Wallboxen
 *  - Pro Simulator-Instanz: WebSocket-Client gegen den OCPP-Zentralserver
 *    (wss://ocpp.aicono.org/<ocppId> oder ws://...)
 *  - Voller OCPP-1.6-Funktionsumfang:
 *      BootNotification, Heartbeat, StatusNotification,
 *      StartTransaction, MeterValues, StopTransaction
 *
 * Sicherheit:
 *  - Bearer-Token (SIMULATOR_API_KEY) auf jeder API-Anfrage erforderlich
 *  - Lauscht nur auf 127.0.0.1; oeffentliche Erreichbarkeit erfolgt
 *    ausschliesslich ueber den Reverse-Proxy (Caddy) unter
 *    https://ocpp.aicono.org/sim-api/
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
type SimStatus = "connecting" | "online" | "charging" | "stopped" | "error";

interface SimInstance {
  id: string;                    // interne ID (UUID)
  tenantId: string;              // zugehoeriger Tenant
  ocppId: string;                // OCPP-Identifier (Pfad-Suffix)
  protocol: "ws" | "wss";        // Verbindungsart
  serverHost: string;            // z. B. "ocpp.aicono.org"
  ocppPassword: string | null;   // optional, fuer HTTP Basic Auth
  vendor: string;
  model: string;
  ws: WebSocket | null;
  status: SimStatus;
  lastError: string | null;
  startedAt: string;
  meterWh: number;               // simulierter Zaehlerstand (Wh)
  transactionId: number | null;
  intervals: NodeJS.Timeout[];   // alle aktiven Intervalle (Heartbeat, MeterValues)
  pendingCalls: Map<string, (payload: unknown) => void>;
}

const instances = new Map<string, SimInstance>();

function instancesByTenant(tenantId: string): SimInstance[] {
  return [...instances.values()].filter((i) => i.tenantId === tenantId);
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

  // CALLRESULT (3): Antwort auf unseren Call
  if (messageType === 3) {
    const payload = parsed[2];
    const cb = inst.pendingCalls.get(messageId);
    if (cb) {
      inst.pendingCalls.delete(messageId);
      cb(payload);
    }
    return;
  }

  // CALL (2) vom Server (z. B. RemoteStartTransaction, ChangeConfiguration)
  if (messageType === 2) {
    const action = parsed[2] as string;
    log("info", "OCPP <- server CALL", { id: inst.id, action, messageId });
    // Generische Accept-Antwort, damit der Server zufrieden ist.
    const result =
      action === "RemoteStartTransaction" || action === "RemoteStopTransaction"
        ? { status: "Accepted" }
        : action === "GetConfiguration"
        ? { configurationKey: [], unknownKey: [] }
        : { status: "Accepted" };
    inst.ws?.send(JSON.stringify([3, messageId, result]));

    // Wenn der Server RemoteStart sendet, starten wir auch lokal eine Transaction.
    if (action === "RemoteStartTransaction" && inst.status === "online") {
      setTimeout(() => startTransaction(inst), 500);
    }
    if (action === "RemoteStopTransaction" && inst.status === "charging") {
      setTimeout(() => stopTransaction(inst), 500);
    }
    return;
  }

  // CALLERROR (4): wir loggen, ignorieren ansonsten
  if (messageType === 4) {
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
      firmwareVersion: "sim-1.0.0",
    },
    () => {
      inst.status = "online";
      // Direkt nach Boot: StatusNotification "Available"
      sendCall(inst, "StatusNotification", {
        connectorId: 1,
        errorCode: "NoError",
        status: "Available",
      });
      // Heartbeat alle 30s
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
      idTag: "SIM-IDTAG",
      meterStart,
      timestamp: new Date().toISOString(),
    },
    (payload) => {
      const p = payload as { transactionId?: number; idTagInfo?: { status?: string } };
      if (p?.idTagInfo?.status === "Accepted" && typeof p.transactionId === "number") {
        inst.transactionId = p.transactionId;
        inst.status = "charging";
        sendCall(inst, "StatusNotification", {
          connectorId: 1,
          errorCode: "NoError",
          status: "Charging",
        });
        // MeterValues alle 30s, +1000 Wh pro Tick (~120 kW gemittelt fuer Demo)
        const mv = setInterval(() => {
          inst.meterWh += 1000;
          sendCall(inst, "MeterValues", {
            connectorId: 1,
            transactionId: inst.transactionId,
            meterValue: [
              {
                timestamp: new Date().toISOString(),
                sampledValue: [
                  {
                    value: String(inst.meterWh),
                    context: "Sample.Periodic",
                    measurand: "Energy.Active.Import.Register",
                    unit: "Wh",
                  },
                ],
              },
            ],
          });
        }, 30_000);
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
      idTag: "SIM-IDTAG",
      meterStop: inst.meterWh,
      timestamp: new Date().toISOString(),
    },
    () => {
      inst.transactionId = null;
      inst.status = "online";
      sendCall(inst, "StatusNotification", {
        connectorId: 1,
        errorCode: "NoError",
        status: "Available",
      });
    },
  );
}

function buildWebSocketUrl(inst: SimInstance): string {
  const base = `${inst.protocol}://${inst.serverHost}/${encodeURIComponent(inst.ocppId)}`;
  return base;
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
    // best-effort StopTransaction
    try {
      stopTransaction(inst);
    } catch {
      /* ignore */
    }
  }
  try {
    inst.ws?.close(1000, "Simulator stopped by API");
  } catch {
    /* ignore */
  }
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
    meterWh: inst.meterWh,
    transactionId: inst.transactionId,
  };
}

const server = http.createServer(async (req, res) => {
  // Health-Endpoint (ohne Auth) fuer Container-/Reverse-Proxy-Checks
  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, { ok: true, instances: instances.size });
  }

  if (!authOk(req)) {
    return send(res, 401, { error: "Unauthorized" });
  }

  const url = req.url ?? "";

  // --- POST /start ----------------------------------------------------------
  if (req.method === "POST" && (url === "/start" || url === "/sim-api/start")) {
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
    };
    instances.set(inst.id, inst);
    connectWebSocket(inst);
    return send(res, 200, instanceToDto(inst));
  }

  // --- POST /action ---------------------------------------------------------
  // Manuelles Triggern: { id, action: "startTx" | "stopTx" }
  if (req.method === "POST" && (url === "/action" || url === "/sim-api/action")) {
    let body: { id?: string; action?: string };
    try {
      body = (await readJson(req)) as { id?: string; action?: string };
    } catch {
      return send(res, 400, { error: "Invalid JSON" });
    }
    const inst = body.id ? instances.get(body.id) : undefined;
    if (!inst) return send(res, 404, { error: "Instance not found" });
    if (body.action === "startTx") startTransaction(inst);
    else if (body.action === "stopTx") stopTransaction(inst);
    else return send(res, 400, { error: "Unknown action" });
    return send(res, 200, instanceToDto(inst));
  }

  // --- POST /stop -----------------------------------------------------------
  if (req.method === "POST" && (url === "/stop" || url === "/sim-api/stop")) {
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
  if (req.method === "GET" && (url.startsWith("/status") || url.startsWith("/sim-api/status"))) {
    const tenantId = new URL(url, "http://localhost").searchParams.get("tenantId");
    const list = tenantId ? instancesByTenant(tenantId) : [...instances.values()];
    return send(res, 200, { instances: list.map(instanceToDto) });
  }

  return send(res, 404, { error: "Not found" });
});

server.listen(PORT, "0.0.0.0", () => {
  log("info", "OCPP Simulator API listening", {
    port: PORT,
    maxPerTenant: MAX_PER_TENANT,
    maxTotal: MAX_TOTAL,
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
