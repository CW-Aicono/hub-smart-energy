import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useTenant } from "@/hooks/useTenant";

export interface CheapChargingConfig {
  enabled: boolean;
  max_price_eur_mwh: number;
  limit_kw: number;
  use_fallback_window: boolean;
  fallback_time_from: string; // "HH:mm"
  fallback_time_to: string;   // "HH:mm"
}

export interface ChargePointGroupEnergySettings {
  dynamic_load_management: boolean;
  power_limit_kw: number | null;
  pv_surplus_charging: boolean;
  scheduled_availability: boolean;
  cheap_charging_mode: boolean; // legacy flag (kept for backward compat)
  cheap_charging?: CheapChargingConfig;
}

export interface ChargePointGroupAccessSettings {
  free_charging: boolean;
  user_group_restriction: boolean;
  max_charging_duration_min: number;
}

export interface ChargePointGroup {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  energy_settings: ChargePointGroupEnergySettings;
  access_settings: ChargePointGroupAccessSettings;
  created_at: string;
  updated_at: string;
}

export function useChargePointGroups() {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["charge-point-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charge_point_groups")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as ChargePointGroup[];

    },
    enabled: !!tenant?.id,
  });

  const createGroup = useMutation({
    mutationFn: async (group: { name: string; description?: string }) => {
      if (!tenant?.id) throw new Error("No tenant");
      const { data, error } = await supabase
        .from("charge_point_groups")
        .insert({ tenant_id: tenant.id, ...group } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ChargePointGroup;

    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charge-point-groups"] });
      toast({ title: "Gruppe erstellt" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const updateGroup = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ChargePointGroup> & { id: string }) => {
      const { error } = await supabase
        .from("charge_point_groups")
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;

    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charge-point-groups"] });
      toast({ title: "Gruppe gespeichert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("charge_point_groups")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charge-point-groups"] });
      queryClient.invalidateQueries({ queryKey: ["charge-points"] });
      toast({ title: "Gruppe gelöscht" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const assignChargePointToGroup = useMutation({
    mutationFn: async ({ chargePointId, groupId }: { chargePointId: string; groupId: string | null }) => {
      const { error } = await supabase
        .from("charge_points")
        .update({ group_id: groupId })
        .eq("id", chargePointId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charge-points"] });
      queryClient.invalidateQueries({ queryKey: ["charge-point-groups"] });
      toast({ title: "Gruppe zugewiesen" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { groups, isLoading, createGroup, updateGroup, deleteGroup, assignChargePointToGroup };
}
