import type { LoxoneSensor } from "@/hooks/useLoxoneSensors";

export type DeviceType = "meter" | "sensor" | "actuator";

export const METER_CONTROL_TYPES = ["Meter", "EnergyManager", "EnergyManager2", "Fronius", "EnergyMonitor"];

// Home Assistant / AICONO Gateway domains that always represent actuators
const HA_ACTUATOR_DOMAINS = new Set([
  "switch", "light", "cover", "climate", "fan", "lock", "valve",
  "input_boolean", "scene", "script", "automation", "media_player", "siren",
]);

// Units that strongly indicate a meter (energy / power / volume of resource)
const METER_UNITS = new Set([
  "kwh", "wh", "mwh",
  "kw", "w", "mw",
  "m3", "m³",
  "l", "liter",
]);

function getHaDomain(entityId: string): string | null {
  if (!entityId || !entityId.includes(".")) return null;
  return entityId.split(".")[0].toLowerCase();
}

export function isMeterDevice(sensor: LoxoneSensor): boolean {
  if (METER_CONTROL_TYPES.includes(sensor.controlType)) return true;
  // HA inventory: classify by unit
  const unit = ((sensor as any).unit || "").toString().toLowerCase().trim();
  if (unit && METER_UNITS.has(unit)) {
    const domain = getHaDomain(sensor.id);
    // sensors with energy/power units = meters; switches with power = still actuators
    if (!domain || domain === "sensor") return true;
  }
  // Category hint coming from gateway-ws ("Zähler")
  if ((sensor as any).category === "Zähler") return true;
  return false;
}

export function isActuator(sensor: LoxoneSensor): boolean {
  if (isMeterDevice(sensor)) return false;

  const actuatorTypes = ["switch", "light", "blind", "button", "digital", "actuator"];
  const actuatorControlTypes = [
    "Switch", "Dimmer", "Jalousie", "LightController", "LightControllerV2",
    "Pushbutton", "IRoomController", "IRoomControllerV2", "Gate", "Ventilation",
    "Daytimer", "Alarm", "CentralAlarm", "Intercom", "AalSmartAlarm",
    "Sauna", "Pool", "Hourcounter",
  ];

  if (actuatorTypes.includes(sensor.type)) return true;
  if (actuatorControlTypes.includes(sensor.controlType)) return true;

  // HA domain-based detection (e.g. "switch.wohnzimmer", "light.kueche")
  const domain = getHaDomain(sensor.id);
  if (domain && HA_ACTUATOR_DOMAINS.has(domain)) return true;
  // controlType from gateway-ws may carry the lowercase HA domain
  if (HA_ACTUATOR_DOMAINS.has(String(sensor.controlType || "").toLowerCase())) return true;
  if ((sensor as any).category === "Aktor") return true;

  return false;
}

export function isSensorOnly(sensor: LoxoneSensor): boolean {
  return !isMeterDevice(sensor) && !isActuator(sensor);
}

export function getResolvedDeviceType(sensor: LoxoneSensor, deviceTypeMap?: Map<string, string>): DeviceType {
  const explicitType = deviceTypeMap?.get(sensor.id);

  if (explicitType === "meter" || explicitType === "sensor" || explicitType === "actuator") {
    return explicitType;
  }

  if (isMeterDevice(sensor)) return "meter";
  if (isActuator(sensor)) return "actuator";
  return "sensor";
}