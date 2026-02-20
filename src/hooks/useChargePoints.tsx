import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { getT } from "@/i18n/getT";

export interface ChargePointAccessSettings {
  free_charging: boolean;
  user_group_restriction: boolean;
  max_charging_duration_min: number;
}

export interface ChargePoint {
  id: string;
  tenant_id: string;
  location_id: string | null;
  group_id: string | null;
  ocpp_id: string;
  name: string;
  status: string;
  connector_count: number;
  max_power_kw: number;
  connector_type: string;
  last_heartbeat: string | null;
  firmware_version: string | null;
  vendor: string | null;
  model: string | null;
  photo_url: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  access_settings: ChargePointAccessSettings;
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
      return (data ?? []) as unknown as ChargePoint[];
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
      const { data, error } = await supabase.from("charge_points").insert(cp as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      const t = getT();
      queryClient.invalidateQueries({ queryKey: ["charge-points"] });
      toast({ title: t("chargePoint.created") });
    },
    onError: (e: Error) => {
      const t = getT();
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  const updateChargePoint = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ChargePoint> & { id: string }) => {
      const { error } = await supabase.from("charge_points").update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      const t = getT();
      queryClient.invalidateQueries({ queryKey: ["charge-points"] });
      toast({ title: t("chargePoint.updated") });
    },
    onError: (e: Error) => {
      const t = getT();
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
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
      const t = getT();
      queryClient.invalidateQueries({ queryKey: ["charge-points"] });
      toast({ title: t("chargePoint.deleted") });
    },
    onError: (e: Error) => {
      const t = getT();
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  return { chargePoints, isLoading, addChargePoint, updateChargePoint, deleteChargePoint };
}
