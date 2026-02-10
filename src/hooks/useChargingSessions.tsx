import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface ChargingSession {
  id: string;
  tenant_id: string;
  charge_point_id: string;
  connector_id: number;
  transaction_id: number | null;
  id_tag: string | null;
  start_time: string;
  stop_time: string | null;
  energy_kwh: number;
  meter_start: number | null;
  meter_stop: number | null;
  stop_reason: string | null;
  status: string;
  created_at: string;
}

export function useChargingSessions(chargePointId?: string) {
  const queryClient = useQueryClient();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["charging-sessions", chargePointId],
    queryFn: async () => {
      let query = supabase.from("charging_sessions").select("*").order("start_time", { ascending: false });
      if (chargePointId) query = query.eq("charge_point_id", chargePointId);
      const { data, error } = await query;
      if (error) throw error;
      return data as ChargingSession[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("charging-sessions-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "charging_sessions" }, () => {
        queryClient.invalidateQueries({ queryKey: ["charging-sessions"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return { sessions, isLoading };
}
