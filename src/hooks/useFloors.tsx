import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type FloorInsertDB = Database["public"]["Tables"]["floors"]["Insert"];
type FloorUpdateDB = Database["public"]["Tables"]["floors"]["Update"];

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
  model_3d_rotation: number | null;
  created_at: string;
  updated_at: string;
}

export type FloorInsert = Omit<Floor, "id" | "created_at" | "updated_at" | "model_3d_url" | "model_3d_mtl_url" | "model_3d_rotation">;

type ProgressCallback = (progress: number) => void;

/**
 * Upload a file to Supabase Storage with XHR progress tracking.
 * Returns the public URL on success.
 */
async function uploadWithProgress(
  bucket: string,
  path: string,
  file: File,
  onProgress?: ProgressCallback,
): Promise<{ publicUrl: string | null; error: Error | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const url = `${supabaseUrl}/storage/v1/object/${bucket}/${path}`;

  const xhrResult = await new Promise<{ publicUrl: string | null; error: Error | null }>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Authorization", `Bearer ${token || anonKey}`);
    xhr.setRequestHeader("apikey", anonKey);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
    }

    xhr.addEventListener("load", async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const { data: publicData } = supabase.storage
          .from(bucket)
          .getPublicUrl(path);
        resolve({ publicUrl: publicData?.publicUrl ?? null, error: null });
      } else {
        console.error("Storage upload failed:", xhr.status, xhr.responseText);
        resolve({ publicUrl: null, error: new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`) });
      }
    });

    xhr.addEventListener("error", () => {
      resolve({ publicUrl: null, error: new Error("Network error during upload") });
    });

    xhr.send(file);
  });

  // Fallback to Supabase SDK if XHR failed
  if (xhrResult.error) {
    console.warn("XHR upload failed, falling back to SDK upload:", xhrResult.error.message);
    onProgress?.(0);
    const { error: sdkError } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true });

    if (sdkError) {
      console.error("SDK upload also failed:", sdkError.message);
      return { publicUrl: null, error: sdkError as unknown as Error };
    }

    const { data: publicData } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);
    onProgress?.(100);
    return { publicUrl: publicData?.publicUrl ?? null, error: null };
  }

  return xhrResult;
}

interface UseFloorsReturn {
  floors: Floor[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createFloor: (floor: FloorInsert) => Promise<{ data: Floor | null; error: Error | null }>;
  updateFloor: (id: string, updates: Partial<Floor>) => Promise<{ error: Error | null }>;
  deleteFloor: (id: string) => Promise<{ error: Error | null }>;
  uploadFloorPlan: (file: File, locationId: string, floorId: string, onProgress?: ProgressCallback) => Promise<{ url: string | null; error: Error | null }>;
  upload3DModel: (files: { main: File; mtl?: File }, locationId: string, floorId: string, onProgress?: ProgressCallback) => Promise<{ error: Error | null }>;
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
      .insert(floor as FloorInsertDB)
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
      .update(updates as FloorUpdateDB)
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

  const uploadFloorPlan = async (
    file: File,
    locationId: string,
    floorId: string,
    onProgress?: ProgressCallback,
  ) => {
    const fileExt = file.name.split('.').pop();
    const filePath = `${locationId}/${floorId}.${fileExt}`;

    const { publicUrl, error } = await uploadWithProgress(
      'floor-plans',
      filePath,
      file,
      onProgress,
    );

    return { url: publicUrl, error };
  };

  const upload3DModel = async (
    files: { main: File; mtl?: File },
    locationId: string,
    floorId: string,
    onProgress?: ProgressCallback,
  ) => {
    const mainExt = files.main.name.split('.').pop()?.toLowerCase();
    const mainPath = `${locationId}/${floorId}.${mainExt}`;

    const totalSize = files.main.size + (files.mtl?.size || 0);
    let mainLoaded = 0;
    let mtlLoaded = 0;

    const reportCombinedProgress = () => {
      if (onProgress && totalSize > 0) {
        onProgress(Math.round(((mainLoaded + mtlLoaded) / totalSize) * 100));
      }
    };

    const { publicUrl: mainUrl, error: mainError } = await uploadWithProgress(
      'floor-3d-models',
      mainPath,
      files.main,
      (p) => {
        mainLoaded = (p / 100) * files.main.size;
        reportCombinedProgress();
      },
    );

    if (mainError) {
      return { error: mainError };
    }

    let mtlUrl: string | null = null;

    if (files.mtl) {
      const mtlPath = `${locationId}/${floorId}.mtl`;
      const { publicUrl: mtlPublicUrl, error: mtlError } = await uploadWithProgress(
        'floor-3d-models',
        mtlPath,
        files.mtl,
        (p) => {
          mtlLoaded = (p / 100) * files.mtl!.size;
          reportCombinedProgress();
        },
      );

      if (mtlError) {
        return { error: mtlError };
      }

      mtlUrl = mtlPublicUrl;
    }

    // Update floor record with proper DB types
    const { error: updateError } = await supabase
      .from('floors')
      .update({
        model_3d_url: mainUrl,
        model_3d_mtl_url: mtlUrl,
      } satisfies FloorUpdateDB)
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
