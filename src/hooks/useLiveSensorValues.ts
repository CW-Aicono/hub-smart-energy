import { useMemo } from "react";
import { useFloorSensorPositions, FloorSensorPosition } from "@/hooks/useFloorSensorPositions";
import { useLoxoneSensorsMulti } from "@/hooks/useLoxoneSensors";

export interface LiveSensorValue {
  id: string;
  name: string;
  value: string;
  unit: string;
}

interface UseLiveSensorValuesReturn {
  positions: FloorSensorPosition[];
  sensorValues: LiveSensorValue[];
  sensorValuesMap: Map<string, LiveSensorValue>;
  loadingValues: boolean;
  lastRefresh: Date | null;
  refreshSensorValues: () => Promise<void>;
}

export function useLiveSensorValues(floorId: string | undefined): UseLiveSensorValuesReturn {
  const { positions } = useFloorSensorPositions(floorId);

  // Group positions by integration (stable array)
  const integrationIds = useMemo(() => {
    const ids = new Set<string>();
    positions.forEach((pos) => ids.add(pos.location_integration_id));
    return Array.from(ids);
  }, [positions]);

  // Use centralized cached sensor queries (stable hook call via useQueries)
  const sensorQueries = useLoxoneSensorsMulti(integrationIds);

  const { sensorValues, sensorValuesMap } = useMemo(() => {
    const allValues: LiveSensorValue[] = [];
    const valuesMap = new Map<string, LiveSensorValue>();

    const sensorsByIntegration = new Map<string, any[]>();
    integrationIds.forEach((id, idx) => {
      const query = sensorQueries[idx];
      if (query?.data) {
        sensorsByIntegration.set(id, query.data);
      }
    });

    for (const pos of positions) {
      const sensors = sensorsByIntegration.get(pos.location_integration_id);
      if (!sensors) continue;

      const sensor = sensors.find((s: any) => s.id === pos.sensor_uuid);
      if (sensor) {
        const val: LiveSensorValue = {
          id: sensor.id,
          name: pos.sensor_name,
          value: sensor.value,
          unit: sensor.unit,
        };
        allValues.push(val);
        valuesMap.set(pos.sensor_uuid, val);
      }
    }

    return { sensorValues: allValues, sensorValuesMap: valuesMap };
  }, [positions, integrationIds, sensorQueries]);

  const loadingValues = sensorQueries.some((q) => q.isLoading);
  const lastRefresh = sensorQueries.some((q) => q.data)
    ? new Date(Math.max(...sensorQueries.filter((q) => q.dataUpdatedAt).map((q) => q.dataUpdatedAt)))
    : null;

  const refreshSensorValues = async () => {
    await Promise.all(sensorQueries.map((q) => q.refetch()));
  };

  return {
    positions,
    sensorValues,
    sensorValuesMap,
    loadingValues,
    lastRefresh,
    refreshSensorValues,
  };
}
