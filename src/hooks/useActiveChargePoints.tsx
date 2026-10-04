import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Aktive Ladepunkte (Heartbeat in den letzten 30 Tagen) je Mandant – serverseitig berechtigungsgeprüft. */
export function useActiveChargePoints() {
  const { data = {}, isLoading } = useQuery({
    queryKey: ["active-charge-point-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_active_charge_point_counts");
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of (data ?? []) as { tenant_id: string; active_count: number }[]) map[r.tenant_id] = Number(r.active_count);
      return map;
    },
    staleTime: 5 * 60_000,
  });
  const total = Object.values(data).reduce((s, n) => s + n, 0);
  return { byTenant: data, total, isLoading };
}
