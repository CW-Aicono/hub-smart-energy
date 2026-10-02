import type { LoxoneSensor } from "@/hooks/useLoxoneSensors";
import type { Meter } from "@/hooks/useMeters";

/**
 * Single source of truth for "which gateway-reported devices are visible in
 * the user-facing lists (Messstellen / Sensoren / Aktoren / Automation)".
 *
 * A gateway device counts as **assigned** as soon as it has a corresponding
 * row in the `meters` table that links its `sensor_uuid`. Devices that the
 * gateway reports but the user has NOT explicitly chosen via the
 * "Gefundene Geräte"-dialog stay hidden from these lists – they only show up
 * inside that dialog where the user can opt them in.
 *
 * This rule applies to ALL current and future gateway integrations
 * (Loxone, AICONO Gateway / Home Assistant Add-on, Shelly Cloud, ABB,
 * Schneider, Siemens, Brighthub, …).
 */
export function getAssignedSensorIds(meters: Pick<Meter, "sensor_uuid">[]): Set<string> {
  const ids = new Set<string>();
  for (const m of meters) {
    if (m.sensor_uuid) ids.add(m.sensor_uuid);
  }
  return ids;
}

/** Filter a list of gateway-reported devices to only those the user has assigned. */
export function filterAssignedGatewayDevices<T extends Pick<LoxoneSensor, "id">>(
  devices: T[],
  meters: Pick<Meter, "sensor_uuid">[],
): T[] {
  const assigned = getAssignedSensorIds(meters);
  return devices.filter((d) => assigned.has(d.id));
}
