import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo } from "react";
import { useTenant } from "@/hooks/useTenant";

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
  const { tenant } = useTenant();
  const { data: chargingUsers = [] } = useQuery({
    queryKey: ["charging-users-for-tag-resolution", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charging_users")
        .select("name, rfid_tag, rfid_label, app_tag")
        .eq("tenant_id", tenant!.id)
        .neq("status", "archived");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const tagMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of chargingUsers) {
      const label = (u as any).rfid_label ? ` (${(u as any).rfid_label})` : "";
      if (u.rfid_tag) m.set(u.rfid_tag.toUpperCase(), u.name + label);
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
  const { tenant } = useTenant();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["charging-sessions", tenant?.id, chargePointId],
    enabled: !!tenant?.id,
    queryFn: async () => {
      let query = supabase
        .from("charging_sessions")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("start_time", { ascending: false });
      if (chargePointId) query = query.eq("charge_point_id", chargePointId);
      const { data, error } = await query;
      if (error) throw error;
      return data as ChargingSession[];
    },
  });

  useEffect(() => {
    if (!tenant?.id) return;
    const channel = supabase
      .channel("charging-sessions-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "charging_sessions", filter: `tenant_id=eq.${tenant.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["charging-sessions", tenant.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient, tenant?.id]);

  return { sessions, isLoading };
}
