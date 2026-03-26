import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocations } from "./useLocations";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";

export const ENERGY_TYPES = [
  { value: "strom", labelKey: "energy.electricity" },
  { value: "gas", labelKey: "energy.gas" },
  { value: "waerme", labelKey: "energy.districtHeating" },
  { value: "solar", labelKey: "energy.solar" },
  { value: "wasser", labelKey: "energy.water" },
  { value: "oel", labelKey: "energy.oil" },
  { value: "pellets", labelKey: "energy.pellets" },
  { value: "sonstige_erzeugung", labelKey: "energy.otherGeneration" },
  { value: "sonstiges", labelKey: "energy.other" },
] as const;

export interface LocationEnergySource {
  id: string;
  location_id: string;
  tenant_id: string;
  energy_type: string;
  custom_name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface LocationEnergySourceInsert {
  energy_type: string;
  custom_name: string;
  sort_order?: number;
}

export function useLocationEnergySources(locationId: string | null) {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const queryKey = ["location_energy_sources", locationId ?? "none"];

  const { data: sources = [], isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!locationId) return [];
      const { data, error } = await supabase
        .from("location_energy_sources")
        .select("*")
        .eq("location_id", locationId)
        .order("sort_order");
      if (error) throw error;
      return (data as LocationEnergySource[]) || [];
    },
    enabled: !!locationId && !!tenant,
    staleTime: 30_000,
  });

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["location_energy_sources"] });
  }, [queryClient]);

  const addSource = async (locationId: string, source: LocationEnergySourceInsert) => {
    if (!tenant) return { error: new Error("No tenant") };
    const { error } = await supabase.from("location_energy_sources").insert({
      location_id: locationId,
      tenant_id: tenant.id,
      energy_type: source.energy_type,
      custom_name: source.custom_name,
      sort_order: source.sort_order ?? 0,
    });
    if (!error) await invalidate();
    return { error: error as Error | null };
  };

  const updateSource = async (id: string, updates: Partial<LocationEnergySourceInsert>) => {
    const { error } = await supabase
      .from("location_energy_sources")
      .update(updates)
      .eq("id", id);
    if (!error) await invalidate();
    return { error: error as Error | null };
  };

  const deleteSource = async (id: string) => {
    const { error } = await supabase
      .from("location_energy_sources")
      .delete()
      .eq("id", id);
    if (!error) await invalidate();
    return { error: error as Error | null };
  };

  const saveBulk = async (locationId: string, items: LocationEnergySourceInsert[]) => {
    if (!tenant) return { error: new Error("No tenant") };
    // Delete existing and re-insert
    await supabase.from("location_energy_sources").delete().eq("location_id", locationId);
    if (items.length > 0) {
      const rows = items.map((item, idx) => ({
        location_id: locationId,
        tenant_id: tenant.id,
        energy_type: item.energy_type,
        custom_name: item.custom_name,
        sort_order: idx,
      }));
      const { error } = await supabase.from("location_energy_sources").insert(rows);
      if (error) return { error: error as Error | null };
    }
    await invalidate();
    return { error: null };
  };

  return { sources, loading: isLoading, error, addSource, updateSource, deleteSource, saveBulk, refetch: invalidate };
}

const ALL_ENERGY_TYPES = ["strom", "gas", "waerme", "wasser"] as const;

/**
 * Backward-compatible hook: returns a Set<string> of energy types for filtering.
 * Falls back to the locations.energy_sources array if no DB sources exist yet.
 */
export function useLocationEnergyTypesSet(locationId: string | null): Set<string> {
  const { sources } = useLocationEnergySources(locationId);
  const { locations } = useLocations();

  return useMemo(() => {
    // If we have sources from the new table, use them
    if (sources.length > 0) {
      return new Set(sources.map((s) => s.energy_type));
    }
    // Fallback to old array on location
    if (!locationId) return new Set(ALL_ENERGY_TYPES);
    const loc = locations.find((l) => l.id === locationId);
    if (!loc || !loc.energy_sources || loc.energy_sources.length === 0) {
      return new Set(ALL_ENERGY_TYPES);
    }
    return new Set(loc.energy_sources);
  }, [sources, locationId, locations]);
}
