/**
 * Modbus-TCP ↔ OCPP-1.6J Bridge
 * Phase 5: per Wallbox eine eigene OCPP-Verbindung zum Cloud-Backend.
 *
 * Templates definieren read_map / write_map / status_map (siehe
 * wallbox_modbus_templates Tabelle). Eine Bridge-Instanz pollt die
 * Modbus-Register laut Template, übersetzt Werte in OCPP MeterValues /
 * StatusNotifications und mapped Befehle (RemoteStart/Stop, ChangeConfiguration)
 * zurück auf Modbus-Writes.
 *
 * Hinweis: dieses Modul vermeidet Top-Level externe Imports. Das `modbus-serial`
 * Package wird im HA-Addon-Container per dynamic require geladen, damit der
 * Cloud-Build (Lovable) ohne node_modules nicht bricht.
 */

type ReadEntry = {
  address: number;
  function_code: 3 | 4;
  data_type: "uint16" | "int16" | "uint32" | "int32" | "float32" | "float64" | "string";
  byte_order?: "big" | "little";
  length?: number;
  scale?: number;
  target_field: string;
  poll_group?: "fast" | "slow";
};

type WriteEntry = {
  address: number;
  function_code: 5 | 6 | 16;
  data_type: "uint16" | "int16" | "uint32" | "int32" | "float32";
  scale?: number;
  value?: number;
  min?: number;
  max?: number;
  unit?: string;
};

export interface WallboxTemplate {
  id: string;
  vendor: string;
  model: string;
  default_unit_id: number;
  default_port: number;
  read_map: ReadEntry[];
  write_map: {
    set_current?: WriteEntry;
    start_charge?: WriteEntry;
    stop_charge?: WriteEntry;
    unlock?: WriteEntry;
  };
  status_map: Record<string, string>;
  poll_intervals: { fast_ms: number; slow_ms: number };
}

export interface WallboxInstance {
  id: string;
  template_id: string;
  charge_point_ocpp_id: string;
  modbus_host: string;
  modbus_port: number;
  unit_id: number;
}

interface ParsedState {
  vendor_status?: string | number;
  power_total_w?: number;
  energy_total_kwh?: number;
  current_l1_a?: number;
  current_l2_a?: number;
  current_l3_a?: number;
  set_current_a?: number;
  [k: string]: unknown;
}

const OCPP_PROTOCOL = "ocpp1.6";

function decode(buf: number[], entry: ReadEntry): number | string {
  const big = entry.byte_order !== "little";
  const word = (idx: number) => buf[idx] & 0xffff;
  switch (entry.data_type) {
    case "uint16": return word(0);
    case "int16": { const v = word(0); return v >= 0x8000 ? v - 0x10000 : v; }
    case "uint32": return big
      ? (word(0) << 16) | word(1)
      : (word(1) << 16) | word(0);
    case "int32": {
      const v = big ? (word(0) << 16) | word(1) : (word(1) << 16) | word(0);
      return v >= 0x80000000 ? v - 0x100000000 : v;
    }
    case "float32": {
      const ab = new ArrayBuffer(4);
      const dv = new DataView(ab);
      if (big) { dv.setUint16(0, word(0)); dv.setUint16(2, word(1)); }
      else { dv.setUint16(0, word(1)); dv.setUint16(2, word(0)); }
      return dv.getFloat32(0);
    }
    case "float64": {
      const ab = new ArrayBuffer(8);
      const dv = new DataView(ab);
      const order = big ? [0, 1, 2, 3] : [3, 2, 1, 0];
      for (let i = 0; i < 4; i++) dv.setUint16(i * 2, word(order[i]));
      return dv.getFloat64(0);
    }
    case "string": {
      const chars: string[] = [];
      for (const w of buf) {
        chars.push(String.fromCharCode((w >> 8) & 0xff));
        chars.push(String.fromCharCode(w & 0xff));
      }
      return chars.join("").replace(/\0+$/, "").trim();
    }
  }
}

function encode(value: number, entry: WriteEntry): number[] {
  switch (entry.data_type) {
    case "uint16":
    case "int16":
      return [value & 0xffff];
    case "uint32":
    case "int32":
      return [(value >>> 16) & 0xffff, value & 0xffff];
    case "float32": {
      const ab = new ArrayBuffer(4);
      const dv = new DataView(ab);
      dv.setFloat32(0, value);
      return [dv.getUint16(0), dv.getUint16(2)];
    }
  }
}

export class ModbusWallboxBridge {
  private inst: WallboxInstance;
  private tpl: WallboxTemplate;
  private cloudUrl: string;
  private cloudPassword: string;

  private modbus: any = null;
  private ws: WebSocket | null = null;
  private pollFast?: ReturnType<typeof setInterval>;
  private pollSlow?: ReturnType<typeof setInterval>;
  private state: ParsedState = {};
  private lastOcppStatus = "Available";
  private msgId = 1;
  private callbacks = new Map<string, (resp: unknown) => void>();
  private transactionId: number | null = null;
  private stopped = false;

  constructor(inst: WallboxInstance, tpl: WallboxTemplate, cloudUrl: string, cloudPassword: string) {
    this.inst = inst;
    this.tpl = tpl;
    this.cloudUrl = cloudUrl;
    this.cloudPassword = cloudPassword;
  }

  async start() {
    await this.connectModbus();
    this.connectOcpp();
    const fast = this.tpl.poll_intervals?.fast_ms ?? 3000;
    const slow = this.tpl.poll_intervals?.slow_ms ?? 30000;
    this.pollFast = setInterval(() => this.pollGroup("fast").catch((e) => console.error("[wb-bridge] fast", e?.message)), fast);
    this.pollSlow = setInterval(() => this.pollGroup("slow").catch((e) => console.error("[wb-bridge] slow", e?.message)), slow);
  }

  async stop() {
    this.stopped = true;
    if (this.pollFast) clearInterval(this.pollFast);
    if (this.pollSlow) clearInterval(this.pollSlow);
    try { this.ws?.close(); } catch { /* ignore */ }
    try { await this.modbus?.close?.(); } catch { /* ignore */ }
  }

  private async connectModbus() {
    // Dynamisch laden, damit Cloud-Build ohne modbus-serial nicht bricht.
    let ModbusRTU: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      ModbusRTU = require("modbus-serial");
    } catch (e) {
      throw new Error(`modbus-serial package missing in addon: ${(e as Error).message}`);
    }
    this.modbus = new ModbusRTU();
    await this.modbus.connectTCP(this.inst.modbus_host, { port: this.inst.modbus_port });
    this.modbus.setID(this.inst.unit_id);
    this.modbus.setTimeout(2000);
    console.log(`[wb-bridge] Modbus connected ${this.inst.modbus_host}:${this.inst.modbus_port} unit=${this.inst.unit_id}`);
  }

  private connectOcpp() {
    const auth = "Basic " + Buffer.from(`${this.inst.charge_point_ocpp_id}:${this.cloudPassword}`).toString("base64");
    const url = `${this.cloudUrl.replace(/\/$/, "")}/${this.inst.charge_point_ocpp_id}`;
    // Use global WebSocket if available (Deno/Bun); otherwise dynamic require ws.
    const WS: any = (globalThis as any).WebSocket ?? require("ws");
    this.ws = new WS(url, OCPP_PROTOCOL, { headers: { Authorization: auth } });
    this.ws!.onopen = () => {
      console.log(`[wb-bridge] OCPP connected ${this.inst.charge_point_ocpp_id}`);
      this.sendCall("BootNotification", {
        chargePointVendor: this.tpl.vendor.slice(0, 20),
        chargePointModel: this.tpl.model.slice(0, 20),
        firmwareVersion: "modbus-bridge-v1",
      });
    };
    this.ws!.onmessage = (ev: MessageEvent) => this.handleOcppFrame(ev.data);
    this.ws!.onclose = () => {
      if (this.stopped) return;
      console.warn(`[wb-bridge] OCPP closed for ${this.inst.charge_point_ocpp_id}, reconnecting in 5s`);
      setTimeout(() => this.connectOcpp(), 5000);
    };
    this.ws!.onerror = (err: any) => console.error("[wb-bridge] ws error", err?.message);
  }

  private sendCall(action: string, payload: Record<string, unknown>) {
    if (!this.ws || this.ws.readyState !== 1) return;
    const id = `wb-${this.msgId++}`;
    const frame = JSON.stringify([2, id, action, payload]);
    this.ws.send(frame);
  }

  private async handleOcppFrame(raw: string | ArrayBuffer) {
    try {
      const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
      const arr = JSON.parse(text);
      if (!Array.isArray(arr)) return;
      const [type, msgId, payload, payload2] = arr;
      if (type === 3) {
        const cb = this.callbacks.get(msgId);
        if (cb) { this.callbacks.delete(msgId); cb(payload); }
        return;
      }
      if (type === 2) {
        const action = payload;
        const data = payload2 ?? {};
        const resp = await this.handleRemoteCall(action, data);
        this.ws?.send(JSON.stringify([3, msgId, resp]));
      }
    } catch (e) {
      console.error("[wb-bridge] frame error", (e as Error).message);
    }
  }

  private async handleRemoteCall(action: string, data: any): Promise<any> {
    switch (action) {
      case "RemoteStartTransaction":
        await this.startCharge();
        return { status: "Accepted" };
      case "RemoteStopTransaction":
        await this.stopCharge();
        return { status: "Accepted" };
      case "ChangeConfiguration":
        if ((data?.key || "").toLowerCase().includes("current")) {
          await this.setCurrent(Number(data.value));
          return { status: "Accepted" };
        }
        return { status: "NotSupported" };
      case "Reset":
        return { status: "Accepted" };
      case "TriggerMessage":
        return { status: "Accepted" };
      default:
        return { status: "NotImplemented" };
    }
  }

  private async pollGroup(group: "fast" | "slow") {
    const entries = (this.tpl.read_map ?? []).filter((e) => (e.poll_group ?? "fast") === group);
    for (const entry of entries) {
      try {
        const fn = entry.function_code === 3 ? this.modbus.readHoldingRegisters : this.modbus.readInputRegisters;
        const len = entry.data_type === "uint32" || entry.data_type === "int32" || entry.data_type === "float32"
          ? 2
          : entry.data_type === "float64"
            ? 4
            : entry.data_type === "string"
              ? (entry.length ?? 4)
              : 1;
        const res = await fn.call(this.modbus, entry.address, len);
        const raw = decode(res.data, entry);
        const scaled = typeof raw === "number" && entry.scale != null ? raw * entry.scale : raw;
        this.state[entry.target_field] = scaled;
      } catch (e) {
        console.warn(`[wb-bridge] read fail @${entry.address}`, (e as Error).message);
      }
    }
    if (group === "fast") this.pushStatusAndMeter();
  }

  private pushStatusAndMeter() {
    // Map vendor status -> OCPP status
    const vs = String(this.state.vendor_status ?? "");
    const ocppStatus = this.tpl.status_map?.[vs] ?? "Available";
    if (ocppStatus !== this.lastOcppStatus) {
      this.lastOcppStatus = ocppStatus;
      this.sendCall("StatusNotification", {
        connectorId: 1,
        status: ocppStatus,
        errorCode: "NoError",
        timestamp: new Date().toISOString(),
      });
      // auto start/stop transaction tracking
      if (ocppStatus === "Charging" && this.transactionId == null) {
        this.transactionId = Math.floor(Date.now() / 1000);
        this.sendCall("StartTransaction", {
          connectorId: 1,
          idTag: "GATEWAY",
          meterStart: Math.round((this.state.energy_total_kwh ?? 0) * 1000),
          timestamp: new Date().toISOString(),
        });
      } else if (ocppStatus !== "Charging" && this.transactionId != null) {
        this.sendCall("StopTransaction", {
          transactionId: this.transactionId,
          meterStop: Math.round((this.state.energy_total_kwh ?? 0) * 1000),
          timestamp: new Date().toISOString(),
        });
        this.transactionId = null;
      }
    }
    // MeterValues
    if (this.state.power_total_w != null || this.state.energy_total_kwh != null) {
      const sampledValue: any[] = [];
      if (this.state.power_total_w != null) {
        sampledValue.push({
          value: String(this.state.power_total_w),
          measurand: "Power.Active.Import",
          unit: "W",
        });
      }
      if (this.state.energy_total_kwh != null) {
        sampledValue.push({
          value: String(Math.round((this.state.energy_total_kwh as number) * 1000)),
          measurand: "Energy.Active.Import.Register",
          unit: "Wh",
        });
      }
      this.sendCall("MeterValues", {
        connectorId: 1,
        transactionId: this.transactionId ?? undefined,
        meterValue: [{ timestamp: new Date().toISOString(), sampledValue }],
      });
    }
  }

  async setCurrent(amps: number) {
    const w = this.tpl.write_map?.set_current;
    if (!w) throw new Error("Template has no set_current");
    const clamped = Math.min(Math.max(amps, w.min ?? 6), w.max ?? 32);
    const scaled = Math.round(clamped * (w.scale ?? 1));
    const regs = encode(scaled, w);
    if (w.function_code === 6) {
      await this.modbus.writeRegister(w.address, regs[0]);
    } else {
      await this.modbus.writeRegisters(w.address, regs);
    }
  }

  async startCharge() {
    const w = this.tpl.write_map?.start_charge;
    if (!w) return;
    await this.modbus.writeRegister(w.address, w.value ?? 1);
  }

  async stopCharge() {
    const w = this.tpl.write_map?.stop_charge;
    if (!w) return;
    await this.modbus.writeRegister(w.address, w.value ?? 0);
  }

  getState(): ParsedState { return { ...this.state, ocpp_status: this.lastOcppStatus }; }
  getInstance(): WallboxInstance { return this.inst; }
  getTemplate(): WallboxTemplate { return this.tpl; }
  isOcppConnected(): boolean { return !!this.ws && this.ws.readyState === 1; }
  isModbusConnected(): boolean {
    try { return !!this.modbus?.isOpen; } catch { return false; }
  }
  getTransactionId(): number | null { return this.transactionId; }
}

/** Bridge-Manager: hält alle Bridges des Gateways. */
export class WallboxBridgeManager {
  private bridges = new Map<string, ModbusWallboxBridge>();
  constructor(private cloudWsUrl: string, private cloudPassword: string) {}

  async provision(inst: WallboxInstance, tpl: WallboxTemplate) {
    await this.remove(inst.id);
    const bridge = new ModbusWallboxBridge(inst, tpl, this.cloudWsUrl, this.cloudPassword);
    await bridge.start();
    this.bridges.set(inst.id, bridge);
  }

  async remove(id: string) {
    const b = this.bridges.get(id);
    if (b) { await b.stop(); this.bridges.delete(id); }
  }

  list(): string[] { return [...this.bridges.keys()]; }
  get(id: string): ModbusWallboxBridge | undefined { return this.bridges.get(id); }

  /** Liefert alle Bridges samt aktuellem Live-Status für die lokale UI. */
  listDetails(): Array<{
    id: string;
    ocpp_id: string;
    vendor: string;
    model: string;
    modbus_host: string;
    modbus_port: number;
    unit_id: number;
    modbus_connected: boolean;
    ocpp_connected: boolean;
    ocpp_status: string;
    transaction_id: number | null;
    state: Record<string, unknown>;
  }> {
    const out: ReturnType<WallboxBridgeManager["listDetails"]> = [];
    for (const [id, b] of this.bridges.entries()) {
      const inst = b.getInstance();
      const tpl = b.getTemplate();
      const st = b.getState();
      out.push({
        id,
        ocpp_id: inst.charge_point_ocpp_id,
        vendor: tpl.vendor,
        model: tpl.model,
        modbus_host: inst.modbus_host,
        modbus_port: inst.modbus_port,
        unit_id: inst.unit_id,
        modbus_connected: b.isModbusConnected(),
        ocpp_connected: b.isOcppConnected(),
        ocpp_status: String(st.ocpp_status ?? "Unknown"),
        transaction_id: b.getTransactionId(),
        state: st,
      });
    }
    return out;
  }
}
