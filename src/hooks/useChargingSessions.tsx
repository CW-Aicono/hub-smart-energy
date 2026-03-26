import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo } from "react";

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

/** Resolves an id_tag to a charging user name (if known). */
export function useIdTagResolver() {
  const { data: chargingUsers = [] } = useQuery({
    queryKey: ["charging-users-for-tag-resolution"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charging_users")
        .select("name, rfid_tag, app_tag")
        .neq("status", "archived");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const tagMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of chargingUsers) {
      if (u.rfid_tag) m.set(u.rfid_tag.toUpperCase(), u.name);
      if (u.app_tag) m.set(u.app_tag.toUpperCase(), u.name);
    }
    return m;
  }, [chargingUsers]);

  return (idTag: string | null): string | null => {
    if (!idTag) return null;
    return tagMap.get(idTag.toUpperCase()) ?? null;
  };
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
