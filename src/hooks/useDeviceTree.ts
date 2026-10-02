import { useMemo } from "react";
import { useMeters } from "./useMeters";
import { useLocations } from "./useLocations";

export interface DeviceTreeNode {
  id: string;
  type: "location" | "meter" | "sensor" | "actuator" | "wallbox" | "virtual";
  label: string;
  energyType?: string | null;
  unit?: string | null;
  locationId?: string;
  captureType?: string;
  deviceType?: string | null;
  parentId?: string | null;
  icon?: string;
}

export function useDeviceTree() {
  const { meters, loading: metersLoading } = useMeters();
  const { locations, loading: locationsLoading } = useLocations();

  const nodes = useMemo<DeviceTreeNode[]>(() => {
    const out: DeviceTreeNode[] = [];

    for (const loc of locations) {
      out.push({
        id: `loc-${loc.id}`,
        type: "location",
        label: loc.name,
      });

      const locMeters = meters.filter((m) => m.location_id === loc.id && !m.is_archived);
      for (const m of locMeters) {
        let nodeType: DeviceTreeNode["type"] = "meter";
        if (m.capture_type === "virtual") nodeType = "virtual";
        else if (m.device_type === "sensor") nodeType = "sensor";
        else if (m.device_type === "actuator") nodeType = "actuator";
        else if (m.energy_type === "strom" && (m.name.toLowerCase().includes("wallbox") || m.name.toLowerCase().includes("ladepunkt"))) {
          nodeType = "wallbox";
        }

        out.push({
          id: m.id,
          type: nodeType,
          label: m.name,
          energyType: m.energy_type,
          unit: m.unit,
          locationId: m.location_id,
          captureType: m.capture_type,
          deviceType: m.device_type,
          parentId: `loc-${loc.id}`,
        });
      }
    }

    // Meters without location
    const orphanMeters = meters.filter((m) => !m.location_id && !m.is_archived);
    if (orphanMeters.length > 0) {
      out.push({ id: "loc-orphan", type: "location", label: "Ohne Standort" });
      for (const m of orphanMeters) {
        out.push({
          id: m.id,
          type: m.capture_type === "virtual" ? "virtual" : "meter",
          label: m.name,
          energyType: m.energy_type,
          unit: m.unit,
          locationId: m.location_id ?? undefined,
          captureType: m.capture_type,
          deviceType: m.device_type,
          parentId: "loc-orphan",
        });
      }
    }

    return out;
  }, [meters, locations]);

  const meterMap = useMemo(() => {
    const map: Record<string, DeviceTreeNode> = {};
    for (const n of nodes) {
      if (n.type !== "location") map[n.id] = n;
    }
    return map;
  }, [nodes]);

  return { nodes, meterMap, loading: metersLoading || locationsLoading };
}
