import {
  Zap, Thermometer, Droplets, Wind, Gauge, Sun, BatteryCharging,
  ToggleLeft, Activity, Lightbulb, Waves, CloudRain, Eye, Radio,
  DoorOpen, Flame,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { LoxoneSensor } from "@/hooks/useLoxoneSensors";
import type { Meter } from "@/hooks/useMeters";
import { getResolvedDeviceType, type DeviceType } from "@/lib/deviceClassification";

/**
 * Single source of truth for device icons across the app.
 * Everything showing a Zähler/Sensor/Aktor picks its lucide component from here
 * so the "Gefundene Geräte"-dialog and the Zähler/Sensoren/Aktoren tabs stay
 * visually consistent, and switching a device's type via EditMeterDialog is
 * reflected immediately.
 */

export interface DeviceIconInput {
  resolvedType: DeviceType;           // meter | sensor | actuator
  unit?: string | null;
  controlType?: string | null;
  haDomain?: string | null;           // e.g. "switch", "light", "sensor"
  category?: string | null;           // e.g. "Zähler", "Aktor"
  name?: string | null;
  energyType?: string | null;         // meters.energy_type
}

function normUnit(u?: string | null): string {
  return (u || "").toString().trim().toLowerCase();
}

function pickActuatorIcon(input: DeviceIconInput): LucideIcon {
  const ct = (input.controlType || "").toLowerCase();
  const dom = (input.haDomain || "").toLowerCase();
  if (dom === "light" || ct.includes("light") || ct.includes("dimmer")) return Lightbulb;
  if (dom === "cover" || dom === "valve" || ct.includes("blind") || ct.includes("jalousie") || ct.includes("gate")) return DoorOpen;
  return ToggleLeft;
}

function pickMeterIcon(input: DeviceIconInput): LucideIcon {
  const u = normUnit(input.unit);
  const et = (input.energyType || "").toLowerCase();
  if (et === "wasser" || u === "l" || u === "l/h") return Droplets;
  if (et === "gas") return Flame;
  if (et === "waerme" || et === "wärme") return Thermometer;
  if (u === "m³" || u === "m3" || u === "m³/h" || u === "m3/h") {
    // ambiguous: gas or water — prefer Droplets when name hints water
    const n = (input.name || "").toLowerCase();
    if (n.includes("gas")) return Flame;
    return Droplets;
  }
  if (u === "kwh" || u === "wh" || u === "mwh" || u === "kw" || u === "w" || u === "mw") return Zap;
  if (u === "v" || u === "a" || u === "va" || u === "var") return Zap;
  return Gauge;
}

function pickSensorIcon(input: DeviceIconInput): LucideIcon {
  const u = normUnit(input.unit);
  const ct = (input.controlType || "").toLowerCase();
  const n = (input.name || "").toLowerCase();
  if (u === "°c" || u === "°f" || u === "k" || ct.includes("temperature") || ct.includes("iroom")) return Thermometer;
  if (u === "%" && (n.includes("feuchte") || n.includes("humid"))) return Droplets;
  if (u === "lux" || u === "lx") return Sun;
  if (u === "m/s" || u === "km/h") return Wind;
  if (u === "mm" && n.includes("regen")) return CloudRain;
  if (u === "hz") return Waves;
  if (u === "bar" || u === "pa" || u === "hpa" || u === "mbar") return Gauge;
  if (u === "ppm" || u === "µg/m³" || u === "ppb") return Wind;
  if (ct.includes("battery") || n.includes("batterie") || n.includes("speicher")) return BatteryCharging;
  if (ct === "gateway" || ct === "access_point") return Radio;
  if (ct.includes("motion") || n.includes("bewegung")) return Activity;
  return Eye;
}

export function getDeviceIcon(input: DeviceIconInput): LucideIcon {
  switch (input.resolvedType) {
    case "actuator": return pickActuatorIcon(input);
    case "meter":    return pickMeterIcon(input);
    case "sensor":
    default:         return pickSensorIcon(input);
  }
}

/** Convenience for gateway/inventory sensors coming from `useLoxoneSensors`. */
export function getDeviceIconForSensor(
  sensor: LoxoneSensor,
  resolvedType: DeviceType,
): LucideIcon {
  const haDomain = sensor.id?.includes(".") ? sensor.id.split(".")[0] : null;
  return getDeviceIcon({
    resolvedType,
    unit: (sensor as any).unit,
    controlType: sensor.controlType,
    haDomain,
    category: (sensor as any).category,
    name: sensor.name,
  });
}

/** Convenience for rows coming from the `meters` table. */
export function getDeviceIconForMeter(m: Meter): LucideIcon {
  const dt = ((m as any).device_type as DeviceType | undefined) || "meter";
  return getDeviceIcon({
    resolvedType: dt,
    unit: m.unit,
    controlType: (m as any).control_type,
    haDomain: m.sensor_uuid?.includes(".") ? m.sensor_uuid.split(".")[0] : null,
    name: m.name,
    energyType: (m as any).energy_type,
  });
}

/** Resolved type helper re-export for callers building icon inputs. */
export { getResolvedDeviceType };
