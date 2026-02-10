import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FloorRoom {
  id: string;
  floor_id: string;
  name: string;
  position_x: number;
  position_y: number;
  width: number;
  depth: number;
  wall_height: number;
  color: string;
  polygon_points: { x: number; y: number }[] | null;
  created_at: string;
  updated_at: string;
}

export type FloorRoomInsert = Omit<FloorRoom, "id" | "created_at" | "updated_at" | "polygon_points"> & { polygon_points?: { x: number; y: number }[] | null };

interface UseFloorRoomsReturn {
  rooms: FloorRoom[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  addRoom: (room: FloorRoomInsert) => Promise<{ data: FloorRoom | null; error: Error | null }>;
  updateRoom: (id: string, updates: Partial<FloorRoom>) => Promise<{ error: Error | null }>;
  deleteRoom: (id: string) => Promise<{ error: Error | null }>;
}

export function useFloorRooms(floorId: string | undefined): UseFloorRoomsReturn {
  const [rooms, setRooms] = useState<FloorRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRooms = useCallback(async () => {
    if (!floorId) {
      setRooms([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("floor_rooms")
        .select("*")
        .eq("floor_id", floorId)
        .order("name");

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setRooms((data as FloorRoom[]) || []);
      }
    } catch (err) {
      setError("Failed to fetch rooms");
    } finally {
      setLoading(false);
    }
  }, [floorId]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const addRoom = async (room: FloorRoomInsert) => {
    const { data, error: insertError } = await supabase
      .from("floor_rooms")
      .insert(room as any)
      .select()
      .single();

    if (!insertError) {
      await fetchRooms();
    }

    return { data: data as FloorRoom | null, error: insertError as Error | null };
  };

  const updateRoom = async (id: string, updates: Partial<FloorRoom>) => {
    const { error: updateError } = await supabase
      .from("floor_rooms")
      .update(updates as any)
      .eq("id", id);

    if (!updateError) {
      await fetchRooms();
    }

    return { error: updateError as Error | null };
  };

  const deleteRoom = async (id: string) => {
    const { error: deleteError } = await supabase
      .from("floor_rooms")
      .delete()
      .eq("id", id);

    if (!deleteError) {
      await fetchRooms();
    }

    return { error: deleteError as Error | null };
  };

  return {
    rooms,
    loading,
    error,
    refetch: fetchRooms,
    addRoom,
    updateRoom,
    deleteRoom,
  };
}
