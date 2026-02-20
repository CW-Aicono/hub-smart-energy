import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { toast } from "./use-toast";

export function useEnergyStorages() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const tenantId = tenant?.id;

  const { data: storages = [], isLoading } = useQuery({
    queryKey: ["energy-storages", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("energy_storages")
        .select("*, locations(name)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createStorage = useMutation({
    mutationFn: async (values: {
      name: string;
      location_id?: string;
      capacity_kwh: number;
      max_charge_kw: number;
      max_discharge_kw: number;
      efficiency_pct: number;
    }) => {
      const { error } = await supabase
        .from("energy_storages")
        .insert({ ...values, tenant_id: tenantId! });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["energy-storages", tenantId] });
      toast({ title: "Speicher erstellt" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const updateStorage = useMutation({
    mutationFn: async ({ id, ...values }: { id: string } & Partial<{
      name: string; location_id: string; capacity_kwh: number;
      max_charge_kw: number; max_discharge_kw: number; efficiency_pct: number; status: string;
    }>) => {
      const { error } = await supabase.from("energy_storages").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["energy-storages", tenantId] });
      toast({ title: "Speicher aktualisiert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const deleteStorage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("energy_storages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["energy-storages", tenantId] });
      toast({ title: "Speicher gelöscht" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { storages, isLoading, createStorage, updateStorage, deleteStorage };
}
