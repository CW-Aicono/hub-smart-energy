import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface ChargePointConnector {
  id: string;
  charge_point_id: string;
  connector_id: number;
  status: string;
  connector_type: string;
  max_power_kw: number;
  last_status_at: string | null;
}

export function useChargePointConnectors(chargePointId?: string) {
  const queryClient = useQueryClient();
  const queryKey = ["charge-point-connectors", chargePointId];

  const { data: connectors = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!chargePointId) return [];
      const { data, error } = await supabase
        .from("charge_point_connectors")
        .select("*")
        .eq("charge_point_id", chargePointId)
        .order("connector_id");
      if (error) throw error;
      return (data ?? []) as unknown as ChargePointConnector[];
    },
    enabled: !!chargePointId,
  });

  useEffect(() => {
    if (!chargePointId) return;
    const channel = supabase
      .channel(`connectors-${chargePointId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "charge_point_connectors", filter: `charge_point_id=eq.${chargePointId}` },
        () => {
          queryClient.invalidateQueries({ queryKey });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [chargePointId, queryClient]);

  return { connectors, isLoading };
}
