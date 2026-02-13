import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface ChargingTariff {
  id: string;
  tenant_id: string;
  name: string;
  price_per_kwh: number;
  base_fee: number;
  idle_fee_per_minute: number;
  idle_fee_grace_minutes: number;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useChargingTariffs() {
  const queryClient = useQueryClient();

  const { data: tariffs = [], isLoading } = useQuery({
    queryKey: ["charging-tariffs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("charging_tariffs").select("*").order("name");
      if (error) throw error;
      return data as ChargingTariff[];
    },
  });

  const addTariff = useMutation({
    mutationFn: async (tariff: Partial<ChargingTariff> & { tenant_id: string; name: string }) => {
      const { data, error } = await supabase.from("charging_tariffs").insert(tariff).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charging-tariffs"] });
      toast({ title: "Tarif erstellt" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const updateTariff = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ChargingTariff> & { id: string }) => {
      const { error } = await supabase.from("charging_tariffs").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charging-tariffs"] });
      toast({ title: "Tarif aktualisiert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const deleteTariff = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("charging_tariffs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charging-tariffs"] });
      toast({ title: "Tarif gelöscht" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { tariffs, isLoading, addTariff, updateTariff, deleteTariff };
}
