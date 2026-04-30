import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { useTenantQuery } from "./useTenantQuery";
import { useDemoMode } from "@/contexts/DemoMode";
import type { Database } from "@/integrations/supabase/types";

type LocationRow = Database["public"]["Tables"]["locations"]["Row"];
type LocationInsertDB = Database["public"]["Tables"]["locations"]["Insert"];
type LocationUpdateDB = Database["public"]["Tables"]["locations"]["Update"];

export type LocationType = "einzelgebaeude" | "gebaeudekomplex" | "sonstiges";
export type LocationUsageType = "verwaltungsgebaeude" | "universitaet" | "schule" | "kindertageseinrichtung" | "sportstaette" | "jugendzentrum" | "gewerbe" | "privat" | "sonstiges";

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
  construction_year: number | null;
  renovation_year: number | null;
  net_floor_area: number | null;
  gross_floor_area: number | null;
  heating_type: string | null;
  photo_url: string | null;
  grid_limit_kw?: number | null;
  created_at: string;
  updated_at: string;
  children?: Location[];
}

export type LocationInsert = Omit<Location, "id" | "tenant_id" | "created_at" | "updated_at" | "children" | "construction_year" | "renovation_year" | "net_floor_area" | "gross_floor_area" | "heating_type" | "photo_url"> & {
  construction_year?: number | null;
  renovation_year?: number | null;
  net_floor_area?: number | null;
  gross_floor_area?: number | null;
  heating_type?: string | null;
  photo_url?: string | null;
};

interface UseLocationsReturn {
  locations: Location[];
  hierarchicalLocations: Location[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createLocation: (location: LocationInsert) => Promise<{ error: Error | null; id?: string }>;
  updateLocation: (id: string, updates: Partial<Location>) => Promise<{ error: Error | null }>;
  deleteLocation: (id: string) => Promise<{ error: Error | null }>;
}

function buildHierarchy(locations: Location[]): Location[] {
  const map = new Map<string, Location>();
  const roots: Location[] = [];

  locations.forEach(loc => {
    map.set(loc.id, { ...loc, children: [] });
  });

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

const DEMO_LOCATIONS: Location[] = [
  { id: "demo-loc-1", tenant_id: "demo-tenant-id", parent_id: null, name: "Hauptverwaltung", type: "einzelgebaeude", usage_type: "verwaltungsgebaeude", address: "Musterstraße 1", city: "München", postal_code: "80331", country: "DE", latitude: 48.137, longitude: 11.576, description: "Hauptgebäude der Stadtverwaltung", contact_person: "Max Mustermann", contact_email: "verwaltung@musterstadt.de", contact_phone: "+49 89 11111", energy_sources: ["strom", "gas", "solar"], show_on_map: true, is_main_location: true, construction_year: 1975, renovation_year: 2018, net_floor_area: 4200, gross_floor_area: 5100, heating_type: "Gas-Brennwert", photo_url: null, created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z" },
  { id: "demo-loc-2", tenant_id: "demo-tenant-id", parent_id: null, name: "Schulzentrum Nord", type: "gebaeudekomplex", usage_type: "schule", address: "Schulstraße 15", city: "München", postal_code: "80335", country: "DE", latitude: 48.152, longitude: 11.568, description: "Schulkomplex mit Turnhalle", contact_person: "Anna Schmidt", contact_email: "schule@musterstadt.de", contact_phone: "+49 89 22222", energy_sources: ["strom", "gas"], show_on_map: true, is_main_location: false, construction_year: 1992, renovation_year: 2020, net_floor_area: 6800, gross_floor_area: 8200, heating_type: "Fernwärme", photo_url: null, created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z" },
  { id: "demo-loc-3", tenant_id: "demo-tenant-id", parent_id: null, name: "Sportpark Süd", type: "einzelgebaeude", usage_type: "sportstaette", address: "Sportplatzweg 8", city: "München", postal_code: "80339", country: "DE", latitude: 48.125, longitude: 11.545, description: "Sportanlage mit Schwimmhalle", contact_person: "Peter Weber", contact_email: "sport@musterstadt.de", contact_phone: "+49 89 33333", energy_sources: ["strom", "gas", "fernwaerme"], show_on_map: true, is_main_location: false, construction_year: 2005, renovation_year: null, net_floor_area: 3500, gross_floor_area: 4100, heating_type: "Gas-Brennwert", photo_url: null, created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z" },
  { id: "demo-loc-4", tenant_id: "demo-tenant-id", parent_id: null, name: "Rathaus", type: "einzelgebaeude", usage_type: "verwaltungsgebaeude", address: "Rathausplatz 1", city: "München", postal_code: "80331", country: "DE", latitude: 48.139, longitude: 11.577, description: "Historisches Rathaus", contact_person: "Lisa Müller", contact_email: "rathaus@musterstadt.de", contact_phone: "+49 89 44444", energy_sources: ["strom", "fernwaerme"], show_on_map: true, is_main_location: false, construction_year: 1890, renovation_year: 2015, net_floor_area: 2800, gross_floor_area: 3400, heating_type: "Fernwärme", photo_url: null, created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z" },
];

export function useLocations(): UseLocationsReturn {
  const { tenant } = useTenant();
  const isDemo = useDemoMode();
  const { ready, insert: tenantInsert } = useTenantQuery();
  const queryClient = useQueryClient();

  const queryKey = ["locations", tenant?.id ?? "none"];

  const { data: locations = [], isLoading, error: queryError } = useQuery({
    queryKey,
    queryFn: async () => {
      if (isDemo) return DEMO_LOCATIONS;
      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .eq("is_archived", false)
        .order("name");
      if (error) throw error;
      return (data as Location[]) || [];
    },
    enabled: isDemo || !!tenant,
    staleTime: 30_000,
  });

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["locations"] });
  }, [queryClient]);

  const createLocation = async (location: LocationInsert) => {
    if (!ready) return { error: new Error("No tenant") };
    const { data, error: insertError } = await supabase
      .from("locations")
      .insert({ ...location, tenant_id: tenant!.id } as LocationInsertDB)
      .select("id")
      .single();
    if (!insertError && data) {
      // Auto-create ground floor (Erdgeschoss)
      await supabase.from("floors").insert({
        location_id: data.id,
        name: "Erdgeschoss",
        floor_number: 0,
        description: null,
        area_sqm: null,
        floor_plan_url: null,
      });
      await invalidate();
    }
    return { error: insertError as Error | null, id: data?.id };
  };

  const updateLocation = async (id: string, updates: Partial<Location>) => {
    const { children: _children, ...dbUpdates } = updates;
    const { error: updateError } = await supabase
      .from("locations")
      .update(dbUpdates as LocationUpdateDB)
      .eq("id", id);
    if (!updateError) await invalidate();
    return { error: updateError as Error | null };
  };

  const deleteLocation = async (id: string) => {
    const { error: deleteError } = await supabase
      .from("locations")
      .delete()
      .eq("id", id);
    if (!deleteError) await invalidate();
    return { error: deleteError as Error | null };
  };

  return {
    locations,
    hierarchicalLocations: buildHierarchy(locations),
    loading: isLoading,
    error: queryError ? (queryError as Error).message : null,
    refetch: invalidate,
    createLocation,
    updateLocation,
    deleteLocation,
  };
}
