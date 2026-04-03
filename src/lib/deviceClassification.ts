import type { LoxoneSensor } from "@/hooks/useLoxoneSensors";

export type DeviceType = "meter" | "sensor" | "actuator";

export const METER_CONTROL_TYPES = ["Meter", "EnergyManager", "EnergyManager2", "Fronius", "EnergyMonitor"];

export function isMeterDevice(sensor: LoxoneSensor): boolean {
  return METER_CONTROL_TYPES.includes(sensor.controlType);
}

export function isActuator(sensor: LoxoneSensor): boolean {
  if (isMeterDevice(sensor)) return false;

  const actuatorTypes = ["switch", "light", "blind", "button", "digital"];
  const actuatorControlTypes = [
    "Switch", "Dimmer", "Jalousie", "LightController", "LightControllerV2",
    "Pushbutton", "IRoomController", "IRoomControllerV2", "Gate", "Ventilation",
    "Daytimer", "Alarm", "CentralAlarm", "Intercom", "AalSmartAlarm",
    "Sauna", "Pool", "Hourcounter",
  ];

  return actuatorTypes.includes(sensor.type) || actuatorControlTypes.includes(sensor.controlType);
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