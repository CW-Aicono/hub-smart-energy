import { useMemo, useState, useEffect } from "react";
import { useFloorSensorPositions, FloorSensorPosition } from "@/hooks/useFloorSensorPositions";
import { useLoxoneSensorsMulti } from "@/hooks/useLoxoneSensors";
import { supabase } from "@/integrations/supabase/client";

/** Detect if a string looks like a raw Shelly MAC/device ID (e.g. "3ce90e6f3b04") */
function looksLikeTechnicalId(name: string): boolean {
  if (!name) return false;
  // Pure hex string (MAC without colons) - 6-12 hex chars
  if (/^[0-9a-f]{6,12}$/i.test(name.trim())) return true;
  // Starts with hex ID followed by space (e.g. "3ce90e6f3b04 Leistung")
  if (/^[0-9a-f]{6,12}\s/i.test(name.trim())) return true;
  return false;
}

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

  // Resolve integration types for each integration ID
  const [integrationTypes, setIntegrationTypes] = useState<(string | undefined)[]>([]);
  useEffect(() => {
    if (integrationIds.length === 0) {
      setIntegrationTypes([]);
      return;
    }
    supabase
      .from("location_integrations")
      .select("id, integrations(type)")
      .in("id", integrationIds)
      .then(({ data }) => {
        const typeMap = new Map<string, string>();
        data?.forEach((row: any) => {
          if (row.integrations?.type) typeMap.set(row.id, row.integrations.type);
        });
        setIntegrationTypes(integrationIds.map((id) => typeMap.get(id)));
      });
  }, [integrationIds]);

  // Use centralized cached sensor queries (stable hook call via useQueries)
  const sensorQueries = useLoxoneSensorsMulti(integrationIds, integrationTypes);

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
        // Prefer live sensor name over stored DB name (which may be a stale device ID)
        const liveName = sensor.name && !looksLikeTechnicalId(sensor.name) ? sensor.name : null;
        const storedName = pos.sensor_name && !looksLikeTechnicalId(pos.sensor_name) ? pos.sensor_name : null;
        const displayName = liveName || storedName || sensor.name || pos.sensor_name;
        const val: LiveSensorValue = {
          id: sensor.id,
          name: displayName,
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
