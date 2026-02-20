import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { toast } from "./use-toast";

export function useArbitrageTrades() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const tenantId = tenant?.id;

  const { data: trades = [], isLoading } = useQuery({
    queryKey: ["arbitrage-trades", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("arbitrage_trades")
        .select("*, energy_storages(name), arbitrage_strategies(name)")
        .eq("tenant_id", tenantId!)
        .order("timestamp", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const createTrade = useMutation({
    mutationFn: async (values: {
      storage_id: string; strategy_id?: string; trade_type: string;
      energy_kwh: number; price_eur_mwh: number; revenue_eur: number; timestamp?: string;
    }) => {
      const { error } = await supabase.from("arbitrage_trades").insert({ ...values, tenant_id: tenantId! });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["arbitrage-trades", tenantId] });
      toast({ title: "Trade erfasst" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const totalRevenue = trades.reduce((sum, t) => sum + Number(t.revenue_eur || 0), 0);
  const totalEnergy = trades.reduce((sum, t) => sum + Number(t.energy_kwh || 0), 0);

  return { trades, isLoading, createTrade, totalRevenue, totalEnergy };
}
