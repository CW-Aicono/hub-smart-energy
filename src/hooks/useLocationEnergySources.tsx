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
 * - locationId set: returns types configured for that location (falls back to
 *   the legacy locations.energy_sources array, then to ALL_ENERGY_TYPES).
 * - locationId null ("Alle Liegenschaften"): returns the UNION of energy types
 *   across all tenant locations (both from location_energy_sources and the
 *   legacy locations.energy_sources array). Energy types that are not active
 *   at any location are excluded.
 */
export function useLocationEnergyTypesSet(locationId: string | null): Set<string> {
  const { tenant } = useTenant();
  const { sources } = useLocationEnergySources(locationId);
  const { locations } = useLocations();

  const { data: tenantSources = [] } = useQuery({
    queryKey: ["location_energy_sources", "tenant", tenant?.id ?? "none"],
    queryFn: async () => {
      if (!tenant) return [] as { energy_type: string }[];
      const { data, error } = await supabase
        .from("location_energy_sources")
        .select("energy_type")
        .eq("tenant_id", tenant.id);
      if (error) throw error;
      return (data ?? []) as { energy_type: string }[];
    },
    enabled: !locationId && !!tenant,
    staleTime: 30_000,
  });

  return useMemo(() => {
    if (locationId) {
      if (sources.length > 0) return new Set(sources.map((s) => s.energy_type));
      const loc = locations.find((l) => l.id === locationId);
      if (!loc || !loc.energy_sources || loc.energy_sources.length === 0) {
        return new Set(ALL_ENERGY_TYPES);
      }
      return new Set(loc.energy_sources);
    }
    // Alle Liegenschaften: Union über alle Locations
    const union = new Set<string>();
    for (const s of tenantSources) if (s.energy_type) union.add(s.energy_type);
    for (const loc of locations) {
      for (const t of loc.energy_sources ?? []) if (t) union.add(t);
    }
    // Fallback: wenn nichts konfiguriert ist, zeige Standard-Set
    if (union.size === 0) return new Set(ALL_ENERGY_TYPES);
    return union;
  }, [locationId, sources, locations, tenantSources]);
}

