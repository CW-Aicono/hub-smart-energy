import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type SalesLocation = Database["public"]["Tables"]["sales_locations"]["Row"];
export type SalesLocationEnergySource =
  Database["public"]["Tables"]["sales_location_energy_sources"]["Row"];
export type SalesFloor = Database["public"]["Tables"]["sales_floors"]["Row"];
export type SalesRoom = Database["public"]["Tables"]["sales_rooms"]["Row"];

export interface SalesStructureData {
  locations: SalesLocation[];
  energySources: SalesLocationEnergySource[];
  floors: SalesFloor[];
  rooms: SalesRoom[];
}

export function useSalesStructure(projectId: string | undefined) {
  const qc = useQueryClient();
  const queryKey = ["sales-structure", projectId ?? "none"];

  const query = useQuery<SalesStructureData>({
    queryKey,
    enabled: !!projectId,
    queryFn: async () => {
      const [locs, floors] = await Promise.all([
        supabase
          .from("sales_locations")
          .select("*")
          .eq("project_id", projectId!)
          .order("sort_order")
          .order("created_at"),
        // we'll get floors after locations if needed, but easier: fetch by project via join
        Promise.resolve(null),
      ]);
      if (locs.error) throw locs.error;
      const locations = (locs.data ?? []) as SalesLocation[];
      const locIds = locations.map((l) => l.id);
      if (locIds.length === 0) {
        return { locations, energySources: [], floors: [], rooms: [] };
      }
      const [es, fs] = await Promise.all([
        supabase
          .from("sales_location_energy_sources")
          .select("*")
          .in("sales_location_id", locIds)
          .order("sort_order"),
        supabase
          .from("sales_floors")
          .select("*")
          .in("sales_location_id", locIds)
          .order("floor_number"),
      ]);
      const floorRows = (fs.data ?? []) as SalesFloor[];
      const floorIds = floorRows.map((f) => f.id);
      const rooms = floorIds.length
        ? await supabase
            .from("sales_rooms")
            .select("*")
            .in("sales_floor_id", floorIds)
            .order("sort_order")
        : { data: [], error: null };
      return {
        locations,
        energySources: (es.data ?? []) as SalesLocationEnergySource[],
        floors: floorRows,
        rooms: (rooms.data ?? []) as SalesRoom[],
      };
    },
    staleTime: 15_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey });

  return { ...query, invalidate };
}
