/**
 * Payload parsers for the AICONO MQTT bridge.
 * Extracted from index.ts in Phase 2 for clarity and testability.
 */

export type PayloadFormat =
  | "json"
  | "tasmota"
  | "esphome"
  | "homie"
  | "raw_value"
  | "shelly_gen2";

export interface Reading {
  meterId: string;
  powerW?: number;
  energyKwh?: number;
  rawValue?: number;
  unit?: string;
  recordedAt: string;
}

export function lookupMeterId(
  topic: string,
  mapping: Map<string, string>,
): string | null {
  if (mapping.has(topic)) return mapping.get(topic)!;
  for (const [pattern, meterId] of mapping) {
    if (pattern.endsWith("#") && topic.startsWith(pattern.slice(0, -1))) {
      return meterId;
    }
    if (pattern.includes("+")) {
      const re = new RegExp(
        "^" + pattern.replace(/\+/g, "[^/]+").replace(/#$/, ".*") + "$",
      );
      if (re.test(topic)) return meterId;
    }
  }
  return null;
}

export function parsePayload(
  topic: string,
  payload: Buffer,
  format: PayloadFormat,
  mapping: Map<string, string>,
): Reading[] {
  const text = payload.toString("utf8");
  const meterId = lookupMeterId(topic, mapping);
  if (!meterId) return [];
  const recordedAt = new Date().toISOString();

  switch (format) {
    case "json":
      return parseJson(text, meterId, recordedAt);
    case "tasmota":
      return parseTasmota(text, meterId, recordedAt);
    case "shelly_gen2":
      return parseShellyGen2(text, meterId, recordedAt);
    case "esphome":
    case "homie":
    case "raw_value": {
      const v = parseFloat(text);
      return Number.isFinite(v) ? [{ meterId, rawValue: v, recordedAt }] : [];
    }
    default:
      return [];
  }
}

function parseJson(text: string, meterId: string, recordedAt: string): Reading[] {
  try {
    const obj = JSON.parse(text);
    return [{
      meterId,
      powerW: typeof obj.power === "number" ? obj.power : undefined,
      energyKwh: typeof obj.energy === "number" ? obj.energy : undefined,
      rawValue: typeof obj.value === "number" ? obj.value : undefined,
      unit: typeof obj.unit === "string" ? obj.unit : undefined,
      recordedAt,
    }];
  } catch {
    return [];
  }
}

function parseTasmota(text: string, meterId: string, recordedAt: string): Reading[] {
  try {
    const obj = JSON.parse(text);
    const e = obj.ENERGY ?? obj.energy;
    if (!e) return [];
    return [{
      meterId,
      powerW: typeof e.Power === "number" ? e.Power : undefined,
      energyKwh: typeof e.Total === "number" ? e.Total : undefined,
      recordedAt,
    }];
  } catch {
    return [];
  }
}

/**
 * Shelly Gen2+ status payload (e.g. "shellies/<id>/status/em:0"):
 * { "id":0, "act_power":123.4, "voltage":230.1, "current":0.54, ... }
 * or aggregated EM data with total_act_energy.
 */
function parseShellyGen2(text: string, meterId: string, recordedAt: string): Reading[] {
  try {
    const obj = JSON.parse(text);
    const power =
      typeof obj.act_power === "number" ? obj.act_power
      : typeof obj.apower === "number" ? obj.apower
      : typeof obj.total_act_power === "number" ? obj.total_act_power
      : undefined;
    const energy =
      typeof obj.total_act_energy === "number" ? obj.total_act_energy / 1000 // Wh→kWh
      : typeof obj.aenergy?.total === "number" ? obj.aenergy.total / 1000
      : undefined;
    if (power === undefined && energy === undefined) return [];
    return [{ meterId, powerW: power, energyKwh: energy, recordedAt }];
  } catch {
    return [];
  }
}
