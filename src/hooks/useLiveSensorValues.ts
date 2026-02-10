import { useState, useEffect, useCallback } from "react";
import { useFloorSensorPositions, FloorSensorPosition } from "@/hooks/useFloorSensorPositions";
import { supabase } from "@/integrations/supabase/client";

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
  const [sensorValues, setSensorValues] = useState<LiveSensorValue[]>([]);
  const [sensorValuesMap, setSensorValuesMap] = useState<Map<string, LiveSensorValue>>(new Map());
  const [loadingValues, setLoadingValues] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchSensorValues = useCallback(async () => {
    if (!positions.length) return;

    setLoadingValues(true);
    const allValues: LiveSensorValue[] = [];
    const valuesMap = new Map<string, LiveSensorValue>();

    try {
      // Group positions by integration
      const byIntegration = new Map<string, FloorSensorPosition[]>();
      positions.forEach((pos) => {
        const existing = byIntegration.get(pos.location_integration_id) || [];
        existing.push(pos);
        byIntegration.set(pos.location_integration_id, existing);
      });

      for (const [integrationId, intPositions] of byIntegration) {
        try {
          const { data, error } = await supabase.functions.invoke("loxone-api", {
            body: { locationIntegrationId: integrationId, action: "getSensors" },
          });
          if (error || !data?.success) continue;

          for (const pos of intPositions) {
            const sensor = data.sensors?.find((s: any) => s.id === pos.sensor_uuid);
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
        } catch (err) {
          console.warn(`Failed to fetch sensors for integration ${integrationId}:`, err);
        }
      }

      setSensorValues(allValues);
      setSensorValuesMap(valuesMap);
      setLastRefresh(new Date());
    } finally {
      setLoadingValues(false);
    }
  }, [positions]);

  // Auto-fetch and refresh every 5 minutes
  useEffect(() => {
    if (positions.length > 0) {
      fetchSensorValues();
      const interval = setInterval(fetchSensorValues, 300000);
      return () => clearInterval(interval);
    }
  }, [positions, fetchSensorValues]);

  return {
    positions,
    sensorValues,
    sensorValuesMap,
    loadingValues,
    lastRefresh,
    refreshSensorValues: fetchSensorValues,
  };
}
