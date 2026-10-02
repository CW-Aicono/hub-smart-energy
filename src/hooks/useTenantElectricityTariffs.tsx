import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { toast } from "./use-toast";

export function useTenantElectricityTariffs(locationId?: string) {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const tenantId = tenant?.id;

  const { data: tariffs = [], isLoading } = useQuery({
    queryKey: ["te-tariffs", tenantId, locationId],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase
        .from("tenant_electricity_tariffs")
        .select("*, locations(name)")
        .eq("tenant_id", tenantId!)
        .order("valid_from", { ascending: false });
      if (locationId) q = q.eq("location_id", locationId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const createTariff = useMutation({
    mutationFn: async (values: {
      name: string; price_per_kwh_local: number; price_per_kwh_grid: number;
      base_fee_monthly: number; location_id: string; valid_from?: string; valid_until?: string;
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
      const { error } = await supabase.from("tenant_electricity_tariffs").update(values as any).eq("id", id);
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

  const getActiveTariffForLocation = (locId: string) => {
    const now = new Date();
    return tariffs.find(
      (t) => (t as any).location_id === locId && (!t.valid_until || new Date(t.valid_until) >= now)
    );
  };

  return { tariffs, activeTariff, isLoading, createTariff, updateTariff, deleteTariff, getActiveTariffForLocation };
}
