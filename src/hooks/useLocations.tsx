import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";

export type LocationType = "standort" | "gebaeude" | "bereich";

export interface Location {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  name: string;
  type: LocationType;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  children?: Location[];
}

interface UseLocationsReturn {
  locations: Location[];
  hierarchicalLocations: Location[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createLocation: (location: Omit<Location, "id" | "tenant_id" | "created_at" | "updated_at">) => Promise<{ error: Error | null }>;
  updateLocation: (id: string, updates: Partial<Location>) => Promise<{ error: Error | null }>;
  deleteLocation: (id: string) => Promise<{ error: Error | null }>;
}

function buildHierarchy(locations: Location[]): Location[] {
  const map = new Map<string, Location>();
  const roots: Location[] = [];

  // First pass: create a map of all locations
  locations.forEach(loc => {
    map.set(loc.id, { ...loc, children: [] });
  });

  // Second pass: build the hierarchy
  locations.forEach(loc => {
    const current = map.get(loc.id)!;
    if (loc.parent_id && map.has(loc.parent_id)) {
      const parent = map.get(loc.parent_id)!;
      parent.children = parent.children || [];
      parent.children.push(current);
    } else {
      roots.push(current);
    }
  });

  return roots;
}

export function useLocations(): UseLocationsReturn {
  const { tenant } = useTenant();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLocations = useCallback(async () => {
    if (!tenant) {
      setLocations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("locations")
        .select("*")
        .order("name");

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setLocations((data as Location[]) || []);
      }
    } catch (err) {
      setError("Failed to fetch locations");
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const createLocation = async (location: Omit<Location, "id" | "tenant_id" | "created_at" | "updated_at">) => {
    if (!tenant) return { error: new Error("No tenant") };

    const { error: insertError } = await supabase
      .from("locations")
      .insert({
        ...location,
        tenant_id: tenant.id,
      });

    if (!insertError) {
      await fetchLocations();
    }

    return { error: insertError as Error | null };
  };

  const updateLocation = async (id: string, updates: Partial<Location>) => {
    const { error: updateError } = await supabase
      .from("locations")
      .update(updates)
      .eq("id", id);

    if (!updateError) {
      await fetchLocations();
    }

    return { error: updateError as Error | null };
  };

  const deleteLocation = async (id: string) => {
    const { error: deleteError } = await supabase
      .from("locations")
      .delete()
      .eq("id", id);

    if (!deleteError) {
      await fetchLocations();
    }

    return { error: deleteError as Error | null };
  };

  return {
    locations,
    hierarchicalLocations: buildHierarchy(locations),
    loading,
    error,
    refetch: fetchLocations,
    createLocation,
    updateLocation,
    deleteLocation,
  };
}
