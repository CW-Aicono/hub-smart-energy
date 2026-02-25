import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type SensorPosInsertDB = Database["public"]["Tables"]["floor_sensor_positions"]["Insert"];
type SensorPosUpdateDB = Database["public"]["Tables"]["floor_sensor_positions"]["Update"];

export type LabelSize = 'small' | 'medium' | 'large';
export type LabelScale = number;

export interface FloorSensorPosition {
  id: string;
  floor_id: string;
  location_integration_id: string;
  sensor_uuid: string;
  sensor_name: string;
  position_x: number;
  position_y: number;
  label_size: LabelSize;
  label_scale: number;
  created_at: string;
  updated_at: string;
}

export type FloorSensorPositionInsert = Omit<FloorSensorPosition, "id" | "created_at" | "updated_at" | "label_size"> & { label_size?: LabelSize };

interface UseFloorSensorPositionsReturn {
  positions: FloorSensorPosition[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  addPosition: (position: FloorSensorPositionInsert) => Promise<{ data: FloorSensorPosition | null; error: Error | null }>;
  updatePosition: (id: string, updates: Partial<FloorSensorPosition>) => Promise<{ error: Error | null }>;
  deletePosition: (id: string) => Promise<{ error: Error | null }>;
  deleteByFloorAndSensor: (floorId: string, sensorUuid: string) => Promise<{ error: Error | null }>;
}

export function useFloorSensorPositions(floorId: string | undefined): UseFloorSensorPositionsReturn {
  const [positions, setPositions] = useState<FloorSensorPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPositions = useCallback(async () => {
    if (!floorId) {
      setPositions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("floor_sensor_positions")
        .select("*")
        .eq("floor_id", floorId);

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setPositions((data as FloorSensorPosition[]) || []);
      }
    } catch (err) {
      setError("Failed to fetch sensor positions");
    } finally {
      setLoading(false);
    }
  }, [floorId]);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  const addPosition = async (position: FloorSensorPositionInsert) => {
    const { data, error: insertError } = await supabase
      .from("floor_sensor_positions")
      .insert(position as SensorPosInsertDB)
      .select()
      .single();

    if (!insertError) {
      await fetchPositions();
    }

    return { data: data as FloorSensorPosition | null, error: insertError as Error | null };
  };

  const updatePosition = async (id: string, updates: Partial<FloorSensorPosition>) => {
    const { error: updateError } = await supabase
      .from("floor_sensor_positions")
      .update(updates as SensorPosUpdateDB)
      .eq("id", id);

    if (!updateError) {
      await fetchPositions();
    }

    return { error: updateError as Error | null };
  };

  const deletePosition = async (id: string) => {
    const { error: deleteError } = await supabase
      .from("floor_sensor_positions")
      .delete()
      .eq("id", id);

    if (!deleteError) {
      await fetchPositions();
    }

    return { error: deleteError as Error | null };
  };

  const deleteByFloorAndSensor = async (floorId: string, sensorUuid: string) => {
    const { error: deleteError } = await supabase
      .from("floor_sensor_positions")
      .delete()
      .eq("floor_id", floorId)
      .eq("sensor_uuid", sensorUuid);

    if (!deleteError) {
      await fetchPositions();
    }

    return { error: deleteError as Error | null };
  };

  return {
    positions,
    loading,
    error,
    refetch: fetchPositions,
    addPosition,
    updatePosition,
    deletePosition,
    deleteByFloorAndSensor,
  };
}

// Hook to get all positions for a location (across all floors)
export function useLocationFloorSensorPositions(locationId: string | undefined) {
  const [positions, setPositions] = useState<FloorSensorPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPositions = useCallback(async () => {
    if (!locationId) {
      setPositions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: floors, error: floorsError } = await supabase
        .from("floors")
        .select("id")
        .eq("location_id", locationId);

      if (floorsError) {
        setError(floorsError.message);
        setLoading(false);
        return;
      }

      if (!floors || floors.length === 0) {
        setPositions([]);
        setLoading(false);
        return;
      }

      const floorIds = floors.map((f) => f.id);
      
      const { data, error: fetchError } = await supabase
        .from("floor_sensor_positions")
        .select("*")
        .in("floor_id", floorIds);

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setPositions((data as FloorSensorPosition[]) || []);
      }
    } catch (err) {
      setError("Failed to fetch sensor positions");
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  return {
    positions,
    loading,
    error,
    refetch: fetchPositions,
  };
}
