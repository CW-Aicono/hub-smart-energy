import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface ChargerModel {
  id: string;
  vendor: string;
  model: string;
  protocol: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useChargerModels() {
  const queryClient = useQueryClient();

  const { data: chargerModels = [], isLoading } = useQuery({
    queryKey: ["charger-models"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charger_models")
        .select("*")
        .order("vendor")
        .order("model");
      if (error) throw error;
      return data as ChargerModel[];
    },
  });

  const vendors = [...new Set(chargerModels.filter(m => m.is_active).map(m => m.vendor))].sort();

  const getModelsForVendor = (vendor: string) =>
    chargerModels.filter(m => m.is_active && m.vendor === vendor);

  const addModel = useMutation({
    mutationFn: async (m: { vendor: string; model: string; protocol?: string; notes?: string }) => {
      const { data, error } = await supabase.from("charger_models").insert(m).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charger-models"] });
      toast({ title: "Modell erstellt" });
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  const updateModel = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ChargerModel> & { id: string }) => {
      const { error } = await supabase.from("charger_models").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charger-models"] });
      toast({ title: "Modell aktualisiert" });
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  const deleteModel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("charger_models").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["charger-models"] });
      toast({ title: "Modell gelöscht" });
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  return { chargerModels, isLoading, vendors, getModelsForVendor, addModel, updateModel, deleteModel };
}
