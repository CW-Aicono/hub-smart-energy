import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";

export type LocationType = "einzelgebaeude" | "gebaeudekomplex" | "sonstiges";
export type LocationUsageType = "verwaltungsgebaeude" | "universitaet" | "schule" | "kindertageseinrichtung" | "sportstaette" | "jugendzentrum" | "sonstiges";

export interface Location {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  name: string;
  type: LocationType;
  usage_type: LocationUsageType | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  energy_sources: string[];
  show_on_map: boolean;
  is_main_location: boolean;
  created_at: string;
  updated_at: string;
  children?: Location[];
}

export type LocationInsert = Omit<Location, "id" | "tenant_id" | "created_at" | "updated_at" | "children">;

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
        .eq("is_archived", false)
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

  const createLocation = async (location: LocationInsert) => {
    if (!tenant) return { error: new Error("No tenant") };

    const { error: insertError } = await supabase
      .from("locations")
      .insert({
        ...location,
        tenant_id: tenant.id,
      } as any);

    if (!insertError) {
      await fetchLocations();
    }

    return { error: insertError as Error | null };
  };

  const updateLocation = async (id: string, updates: Partial<Location>) => {
    const { error: updateError } = await supabase
      .from("locations")
      .update(updates as any)
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
