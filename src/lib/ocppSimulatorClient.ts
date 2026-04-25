// OCPP 1.6 simulator client (browser-side).
// Connects via the ocpp-simulator-proxy Edge Function so that Basic Auth
// and TLS are handled server-side.

import { supabase } from "@/integrations/supabase/client";

export type FrameDirection = "out" | "in" | "info" | "error";

export interface FrameLogEntry {
  id: string;
  ts: number;
  direction: FrameDirection;
  action?: string;
  raw: string;
}

export interface SimulatorOptions {
  /** Target OCPP server (e.g. "wss://ocpp.aicono.org") */
  target: string;
  /** Charge point OCPP id (e.g. "11111111") */
  ocppId: string;
  /** Heartbeat interval seconds; auto-updated from BootNotification response */
  defaultHeartbeatSec?: number;
  /** Vendor / Model used in BootNotification payload */
  vendor?: string;
  model?: string;
  serial?: string;
  firmware?: string;
}

type CallResolver = (result: { ok: boolean; payload?: any; errorCode?: string; errorDescription?: string }) => void;

export class OcppSimulatorClient {
  private ws: WebSocket | null = null;
  private heartbeatTimer: number | null = null;
  private meterTimer: number | null = null;
  private heartbeatSec: number;
  private pendingCalls = new Map<string, CallResolver>();

  // Active transaction state
  private activeTransactionId: number | null = null;
  private meterStartWh = 0;
  private meterCurrentWh = 0;
  private chargingPowerKw = 11;
  private transactionStartedAt = 0;
  private connectorId = 1;

  // Listeners
  private logListeners = new Set<(entry: FrameLogEntry) => void>();
  private statusListeners = new Set<(s: ConnectionStatus) => void>();
  private status: ConnectionStatus = "idle";

  constructor(private opts: SimulatorOptions) {
    this.heartbeatSec = opts.defaultHeartbeatSec ?? 30;
  }

  // ─── Public API ────────────────────────────────────────────────────────

  onLog(cb: (entry: FrameLogEntry) => void) { this.logListeners.add(cb); return () => this.logListeners.delete(cb); }
  onStatus(cb: (s: ConnectionStatus) => void) { this.statusListeners.add(cb); cb(this.status); return () => this.statusListeners.delete(cb); }

  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      throw new Error("Already connected");
    }
    this.setStatus("connecting");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Not authenticated");

    const projectRef = (import.meta.env.VITE_SUPABASE_PROJECT_ID as string) || "";
    const proxyUrl = new URL(`https://${projectRef}.functions.supabase.co/ocpp-simulator-proxy`);
    proxyUrl.searchParams.set("target", this.opts.target);
    proxyUrl.searchParams.set("cp", this.opts.ocppId);
    proxyUrl.searchParams.set("access_token", token);
    // wss not https
    const wsUrl = proxyUrl.toString().replace(/^https:/, "wss:");

    this.log("info", `Connecting via proxy → ${this.opts.target}/${this.opts.ocppId}`);

    const ws = new WebSocket(wsUrl, ["ocpp1.6"]);
    this.ws = ws;

    return new Promise((resolve, reject) => {
      const onErr = (e: Event) => {
        this.log("error", `WebSocket error: ${(e as any)?.message ?? "unknown"}`);
        reject(new Error("WebSocket error"));
      };
      ws.addEventListener("error", onErr, { once: true });

      ws.onopen = () => {
        ws.removeEventListener("error", onErr);
        this.setStatus("connected");
        this.log("info", `Connected (subprotocol: ${ws.protocol || "—"})`);
        resolve();
      };
      ws.onmessage = (ev) => this.handleIncoming(typeof ev.data === "string" ? ev.data : "");
      ws.onclose = (ev) => {
        this.stopHeartbeat();
        this.stopMeterStream();
        this.setStatus("idle");
        this.log("info", `Disconnected (code=${ev.code}${ev.reason ? `, ${ev.reason}` : ""})`);
        this.ws = null;
      };
    });
  }

  disconnect() {
    this.stopHeartbeat();
    this.stopMeterStream();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(1000, "Client disconnect");
    }
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ─── OCPP message senders ──────────────────────────────────────────────

  async sendBootNotification(): Promise<void> {
    const r = await this.call("BootNotification", {
      chargePointVendor: this.opts.vendor ?? "AICONO",
      chargePointModel: this.opts.model ?? "SimBox",
      chargePointSerialNumber: this.opts.serial ?? this.opts.ocppId,
      firmwareVersion: this.opts.firmware ?? "1.0.0",
    });
    if (r.ok && r.payload?.interval) {
      this.heartbeatSec = Number(r.payload.interval) || this.heartbeatSec;
      this.startHeartbeat();
    }
  }

  async sendHeartbeat(): Promise<void> {
    await this.call("Heartbeat", {});
  }

  async sendStatusNotification(status: string, errorCode = "NoError", connectorId = 1): Promise<void> {
    await this.call("StatusNotification", {
      connectorId,
      status,
      errorCode,
      info: "",
      timestamp: new Date().toISOString(),
    });
  }

  async startTransaction(opts: { idTag: string; connectorId?: number; meterStartWh?: number; powerKw?: number; intervalSec?: number }): Promise<void> {
    if (this.activeTransactionId !== null) throw new Error("Transaction already running");
    this.connectorId = opts.connectorId ?? 1;
    this.meterStartWh = opts.meterStartWh ?? 0;
    this.meterCurrentWh = this.meterStartWh;
    this.chargingPowerKw = Math.max(0.5, Math.min(opts.powerKw ?? 11, 350));
    this.transactionStartedAt = Date.now();

    await this.sendStatusNotification("Preparing", "NoError", this.connectorId);

    const r = await this.call("StartTransaction", {
      connectorId: this.connectorId,
      idTag: opts.idTag,
      meterStart: this.meterStartWh,
      timestamp: new Date().toISOString(),
    });

    if (!r.ok) {
      this.log("error", "StartTransaction rejected");
      return;
    }

    const txId = r.payload?.transactionId;
    if (typeof txId !== "number") {
      this.log("error", "No transactionId in response");
      return;
    }
    this.activeTransactionId = txId;
    this.log("info", `Transaction ${txId} started`);

    await this.sendStatusNotification("Charging", "NoError", this.connectorId);
    this.startMeterStream(opts.intervalSec ?? 60);
  }

  async stopTransaction(idTag = "APP_USER"): Promise<void> {
    if (this.activeTransactionId === null) throw new Error("No active transaction");
    this.stopMeterStream();
    // One last MeterValues
    this.tickMeter();
    await this.call("StopTransaction", {
      transactionId: this.activeTransactionId,
      meterStop: Math.round(this.meterCurrentWh),
      timestamp: new Date().toISOString(),
      idTag,
      reason: "Local",
    });
    const tx = this.activeTransactionId;
    this.activeTransactionId = null;
    await this.sendStatusNotification("Finishing", "NoError", this.connectorId);
    setTimeout(() => this.sendStatusNotification("Available", "NoError", this.connectorId).catch(() => {}), 500);
    this.log("info", `Transaction ${tx} stopped at ${Math.round(this.meterCurrentWh)} Wh`);
  }

  async sendCustomFrame(payload: string): Promise<void> {
    if (!this.isConnected()) throw new Error("Not connected");
    this.ws!.send(payload);
    this.log("out", payload);
  }

  // ─── Internals ────────────────────────────────────────────────────────

  private call(action: string, payload: Record<string, unknown>): Promise<{ ok: boolean; payload?: any; errorCode?: string; errorDescription?: string }> {
    return new Promise((resolve) => {
      if (!this.isConnected()) {
        resolve({ ok: false, errorCode: "NotConnected", errorDescription: "WebSocket not open" });
        return;
      }
      const id = crypto.randomUUID().slice(0, 18);
      const frame = JSON.stringify([2, id, action, payload]);
      this.pendingCalls.set(id, resolve);
      this.ws!.send(frame);
      this.log("out", frame, action);
      // Timeout 30 s
      setTimeout(() => {
        if (this.pendingCalls.has(id)) {
          this.pendingCalls.delete(id);
          resolve({ ok: false, errorCode: "Timeout", errorDescription: `No reply within 30s for ${action}` });
        }
      }, 30_000);
    });
  }

  private handleIncoming(text: string) {
    this.log("in", text);
    let arr: any;
    try { arr = JSON.parse(text); } catch { return; }
    if (!Array.isArray(arr) || arr.length < 3) return;
    const [type, id] = arr;

    if (type === 3) {
      // CALLRESULT
      const cb = this.pendingCalls.get(id);
      if (cb) { this.pendingCalls.delete(id); cb({ ok: true, payload: arr[2] }); }
    } else if (type === 4) {
      // CALLERROR
      const cb = this.pendingCalls.get(id);
      if (cb) { this.pendingCalls.delete(id); cb({ ok: false, errorCode: arr[2], errorDescription: arr[3] }); }
    } else if (type === 2) {
      // CALL from server → respond
      const action = arr[2] as string;
      const payload = arr[3] ?? {};
      this.handleServerCall(id, action, payload);
    }
  }

  private async handleServerCall(id: string, action: string, payload: any) {
    let response: any = {};
    let isError = false;
    let errorCode = "";
    let errorDescription = "";

    switch (action) {
      case "RemoteStartTransaction": {
        response = { status: "Accepted" };
        // Auto-start
        setTimeout(() => {
          this.startTransaction({
            idTag: payload?.idTag ?? "APP_USER",
            connectorId: payload?.connectorId ?? 1,
            meterStartWh: this.meterCurrentWh,
            powerKw: this.chargingPowerKw,
          }).catch((e) => this.log("error", `Auto-start failed: ${e.message}`));
        }, 200);
        break;
      }
      case "RemoteStopTransaction": {
        response = { status: this.activeTransactionId === payload?.transactionId ? "Accepted" : "Rejected" };
        if (this.activeTransactionId === payload?.transactionId) {
          setTimeout(() => this.stopTransaction().catch((e) => this.log("error", `Auto-stop failed: ${e.message}`)), 200);
        }
        break;
      }
      case "Reset": {
        response = { status: "Accepted" };
        setTimeout(() => { try { this.disconnect(); } catch { /* ignore */ } }, 500);
        break;
      }
      case "ChangeAvailability":
      case "ChangeConfiguration":
      case "UnlockConnector":
        response = { status: "Accepted" };
        break;
      case "GetConfiguration":
        response = { configurationKey: [], unknownKey: payload?.key ?? [] };
        break;
      case "TriggerMessage": {
        response = { status: "Accepted" };
        const req = payload?.requestedMessage;
        setTimeout(() => {
          if (req === "Heartbeat") this.sendHeartbeat();
          else if (req === "BootNotification") this.sendBootNotification();
          else if (req === "StatusNotification") this.sendStatusNotification("Available", "NoError", this.connectorId);
        }, 200);
        break;
      }
      default:
        isError = true;
        errorCode = "NotImplemented";
        errorDescription = `Action ${action} not implemented in simulator`;
    }

    const frame = isError
      ? JSON.stringify([4, id, errorCode, errorDescription, {}])
      : JSON.stringify([3, id, response]);
    this.ws?.send(frame);
    this.log("out", frame, isError ? `ERROR:${action}` : `RESPONSE:${action}`);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      this.sendHeartbeat().catch(() => {});
    }, this.heartbeatSec * 1000);
    this.log("info", `Auto-Heartbeat every ${this.heartbeatSec}s`);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private startMeterStream(intervalSec: number) {
    this.stopMeterStream();
    this.meterTimer = window.setInterval(() => this.tickMeter(), intervalSec * 1000);
  }

  private stopMeterStream() {
    if (this.meterTimer !== null) {
      clearInterval(this.meterTimer);
      this.meterTimer = null;
    }
  }

  private tickMeter() {
    if (this.activeTransactionId === null) return;
    const elapsedH = (Date.now() - this.transactionStartedAt) / 3_600_000;
    this.meterCurrentWh = this.meterStartWh + elapsedH * this.chargingPowerKw * 1000;
    const meterValueFrame = {
      connectorId: this.connectorId,
      transactionId: this.activeTransactionId,
      meterValue: [{
        timestamp: new Date().toISOString(),
        sampledValue: [
          { value: String(Math.round(this.meterCurrentWh)), unit: "Wh", measurand: "Energy.Active.Import.Register" },
          { value: String(Math.round(this.chargingPowerKw * 1000)), unit: "W", measurand: "Power.Active.Import" },
        ],
      }],
    };
    this.call("MeterValues", meterValueFrame).catch(() => {});
  }

  private setStatus(s: ConnectionStatus) {
    this.status = s;
    this.statusListeners.forEach((cb) => cb(s));
  }

  private log(direction: FrameDirection, raw: string, action?: string) {
    const entry: FrameLogEntry = {
      id: crypto.randomUUID().slice(0, 8),
      ts: Date.now(),
      direction,
      action,
      raw,
    };
    this.logListeners.forEach((cb) => cb(entry));
  }
}

export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";
