import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Floor {
  id: string;
  location_id: string;
  name: string;
  floor_number: number;
  floor_plan_url: string | null;
  description: string | null;
  area_sqm: number | null;
  model_3d_url: string | null;
  model_3d_mtl_url: string | null;
  created_at: string;
  updated_at: string;
}

export type FloorInsert = Omit<Floor, "id" | "created_at" | "updated_at" | "model_3d_url" | "model_3d_mtl_url">;

interface UseFloorsReturn {
  floors: Floor[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createFloor: (floor: FloorInsert) => Promise<{ data: Floor | null; error: Error | null }>;
  updateFloor: (id: string, updates: Partial<Floor>) => Promise<{ error: Error | null }>;
  deleteFloor: (id: string) => Promise<{ error: Error | null }>;
  uploadFloorPlan: (file: File, locationId: string, floorId: string) => Promise<{ url: string | null; error: Error | null }>;
  upload3DModel: (files: { main: File; mtl?: File }, locationId: string, floorId: string) => Promise<{ error: Error | null }>;
}

export function useFloors(locationId: string | undefined): UseFloorsReturn {
  const [floors, setFloors] = useState<Floor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFloors = useCallback(async () => {
    if (!locationId) {
      setFloors([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("floors")
        .select("*")
        .eq("location_id", locationId)
        .order("floor_number", { ascending: true });

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setFloors((data as Floor[]) || []);
      }
    } catch (err) {
      setError("Failed to fetch floors");
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    fetchFloors();
  }, [fetchFloors]);

  const createFloor = async (floor: FloorInsert) => {
    const { data, error: insertError } = await supabase
      .from("floors")
      .insert(floor as any)
      .select()
      .single();

    if (!insertError) {
      await fetchFloors();
    }

    return { data: data as Floor | null, error: insertError as Error | null };
  };

  const updateFloor = async (id: string, updates: Partial<Floor>) => {
    const { error: updateError } = await supabase
      .from("floors")
      .update(updates as any)
      .eq("id", id);

    if (!updateError) {
      await fetchFloors();
    }

    return { error: updateError as Error | null };
  };

  const deleteFloor = async (id: string) => {
    const { error: deleteError } = await supabase
      .from("floors")
      .delete()
      .eq("id", id);

    if (!deleteError) {
      await fetchFloors();
    }

    return { error: deleteError as Error | null };
  };

  const uploadFloorPlan = async (file: File, locationId: string, floorId: string) => {
    const fileExt = file.name.split('.').pop();
    const filePath = `${locationId}/${floorId}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('floor-plans')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      return { url: null, error: uploadError as Error };
    }

    const { data: { publicUrl } } = supabase.storage
      .from('floor-plans')
      .getPublicUrl(filePath);

    return { url: publicUrl, error: null };
  };

  const upload3DModel = async (
    files: { main: File; mtl?: File },
    locationId: string,
    floorId: string
  ) => {
    const mainExt = files.main.name.split('.').pop()?.toLowerCase();
    const mainPath = `${locationId}/${floorId}.${mainExt}`;

    // Upload main file (GLB or OBJ)
    const { error: mainError } = await supabase.storage
      .from('floor-3d-models')
      .upload(mainPath, files.main, { upsert: true });

    if (mainError) {
      return { error: mainError as Error };
    }

    const { data: { publicUrl: mainUrl } } = supabase.storage
      .from('floor-3d-models')
      .getPublicUrl(mainPath);

    let mtlUrl: string | null = null;

    // Upload MTL file if provided
    if (files.mtl) {
      const mtlPath = `${locationId}/${floorId}.mtl`;
      const { error: mtlError } = await supabase.storage
        .from('floor-3d-models')
        .upload(mtlPath, files.mtl, { upsert: true });

      if (mtlError) {
        return { error: mtlError as Error };
      }

      const { data: { publicUrl: mtlPublicUrl } } = supabase.storage
        .from('floor-3d-models')
        .getPublicUrl(mtlPath);

      mtlUrl = mtlPublicUrl;
    }

    // Update floor record
    const { error: updateError } = await supabase
      .from('floors')
      .update({
        model_3d_url: mainUrl,
        model_3d_mtl_url: mtlUrl,
      } as any)
      .eq('id', floorId);

    if (updateError) {
      return { error: updateError as Error };
    }

    await fetchFloors();
    return { error: null };
  };

  return {
    floors,
    loading,
    error,
    refetch: fetchFloors,
    createFloor,
    updateFloor,
    deleteFloor,
    uploadFloorPlan,
    upload3DModel,
  };
}
