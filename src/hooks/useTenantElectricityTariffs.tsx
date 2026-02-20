import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { toast } from "./use-toast";

export function useTenantElectricityTariffs() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const tenantId = tenant?.id;

  const { data: tariffs = [], isLoading } = useQuery({
    queryKey: ["te-tariffs", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_electricity_tariffs")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("valid_from", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createTariff = useMutation({
    mutationFn: async (values: {
      name: string; price_per_kwh_local: number; price_per_kwh_grid: number;
      base_fee_monthly: number; valid_from?: string; valid_until?: string;
    }) => {
      const { error } = await supabase.from("tenant_electricity_tariffs").insert({ ...values, tenant_id: tenantId! });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["te-tariffs", tenantId] });
      toast({ title: "Tarif erstellt" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const updateTariff = useMutation({
    mutationFn: async ({ id, ...values }: { id: string } & Record<string, any>) => {
      const { error } = await supabase.from("tenant_electricity_tariffs").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["te-tariffs", tenantId] });
      toast({ title: "Tarif aktualisiert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const deleteTariff = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tenant_electricity_tariffs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["te-tariffs", tenantId] });
      toast({ title: "Tarif gelöscht" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const activeTariff = tariffs.find((t) => !t.valid_until || new Date(t.valid_until) >= new Date());

  return { tariffs, activeTariff, isLoading, createTariff, updateTariff, deleteTariff };
}
