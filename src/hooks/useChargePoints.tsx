import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useEffect } from "react";

export interface ChargePoint {
  id: string;
  tenant_id: string;
  location_id: string | null;
  ocpp_id: string;
  name: string;
  status: string;
  connector_count: number;
  max_power_kw: number;
  last_heartbeat: string | null;
  firmware_version: string | null;
  vendor: string | null;
  model: string | null;
  photo_url: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
}

export function useChargePoints() {
  const queryClient = useQueryClient();

  const { data: chargePoints = [], isLoading } = useQuery({
    queryKey: ["charge-points"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charge_points")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as ChargePoint[];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("charge-points-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "charge_points" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["charge-points"] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const addChargePoint = useMutation({
    mutationFn: async (cp: Partial<ChargePoint> & { tenant_id: string; ocpp_id: string; name: string }) => {
      const { data, error } = await supabase.from("charge_points").insert(cp).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charge-points"] });
      toast({ title: "Ladepunkt erstellt" });
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  const updateChargePoint = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ChargePoint> & { id: string }) => {
      const { error } = await supabase.from("charge_points").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charge-points"] });
      toast({ title: "Ladepunkt aktualisiert" });
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  const deleteChargePoint = useMutation({
    mutationFn: async (id: string) => {
      // Find ocpp_id to delete logs
      const cp = queryClient.getQueryData<ChargePoint[]>(["charge-points"])?.find(c => c.id === id);
      if (cp) {
        await supabase.from("ocpp_message_log").delete().eq("charge_point_id", cp.ocpp_id);
      }
      // Delete charging invoices linked to sessions of this charge point
      const { data: sessionIds } = await supabase.from("charging_sessions").select("id").eq("charge_point_id", id);
      if (sessionIds && sessionIds.length > 0) {
        await supabase.from("charging_invoices").delete().in("session_id", sessionIds.map(s => s.id));
      }
      const { error } = await supabase.from("charge_points").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charge-points"] });
      toast({ title: "Ladepunkt gelöscht" });
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  return { chargePoints, isLoading, addChargePoint, updateChargePoint, deleteChargePoint };
}
