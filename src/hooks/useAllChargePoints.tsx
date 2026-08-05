import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ChargePoint } from "@/hooks/useChargePoints";
import type { ChargePointConnector } from "@/hooks/useChargePointConnectors";
import type { ChargingSession } from "@/hooks/useChargingSessions";

/**
 * Mandantenübergreifende Ladepunkt-Daten für den Super-Admin.
 * Bewusst OHNE tenant_id-Filter — nur in Super-Admin-Ansichten verwenden.
 */
export function useAllChargePoints() {
  const queryClient = useQueryClient();

  const { data: chargePoints = [], isLoading } = useQuery({
    queryKey: ["sa-all-charge-points"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charge_points")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as ChargePoint[];
    },
    staleTime: 30_000,
  });

  const { data: connectors = [] } = useQuery({
    queryKey: ["sa-all-charge-point-connectors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charge_point_connectors")
        .select("*")
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as unknown as ChargePointConnector[];
    },
    staleTime: 30_000,
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["sa-all-charging-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charging_sessions")
        .select("*")
        .order("start_time", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as ChargingSession[];
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("sa-all-charge-points-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "charge_points" }, () => {
        queryClient.invalidateQueries({ queryKey: ["sa-all-charge-points"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "charge_point_connectors" }, () => {
        queryClient.invalidateQueries({ queryKey: ["sa-all-charge-point-connectors"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return { chargePoints, connectors, sessions, isLoading };
}
