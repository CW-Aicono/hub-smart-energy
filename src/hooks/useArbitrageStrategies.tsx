import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { toast } from "./use-toast";

export function useArbitrageStrategies() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const tenantId = tenant?.id;

  const { data: strategies = [], isLoading } = useQuery({
    queryKey: ["arbitrage-strategies", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("arbitrage_strategies")
        .select("*, energy_storages(name)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const activeStrategies = strategies.filter((s) => !s.is_archived);
  const archivedStrategies = strategies.filter((s) => s.is_archived);

  const archiveStrategy = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("arbitrage_strategies").update({ is_archived: true, is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["arbitrage-strategies", tenantId] });
      toast({ title: "Strategie archiviert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const createStrategy = useMutation({
    mutationFn: async (values: {
      name: string; storage_id: string;
      buy_below_eur_mwh: number; sell_above_eur_mwh: number;
      source?: string; valid_until?: string;
    }) => {
      const { error } = await supabase.from("arbitrage_strategies").insert({
        ...values,
        tenant_id: tenantId!,
        source: values.source || "manual",
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["arbitrage-strategies", tenantId] });
      toast({ title: "Strategie erstellt" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const updateStrategy = useMutation({
    mutationFn: async ({ id, ...values }: { id: string } & Partial<{
      name: string; buy_below_eur_mwh: number; sell_above_eur_mwh: number; is_active: boolean;
    }>) => {
      const { error } = await supabase.from("arbitrage_strategies").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["arbitrage-strategies", tenantId] });
      toast({ title: "Strategie aktualisiert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const deleteStrategy = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("arbitrage_strategies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["arbitrage-strategies", tenantId] });
      toast({ title: "Strategie gelöscht" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { strategies, activeStrategies, archivedStrategies, isLoading, createStrategy, updateStrategy, deleteStrategy, archiveStrategy };
}
