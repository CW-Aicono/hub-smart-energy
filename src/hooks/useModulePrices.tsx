import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getT } from "@/i18n/getT";

export interface ModulePrice {
  id: string;
  module_code: string;
  price_monthly: number;
  standard_price: number;
  created_at: string;
  updated_at: string;
}

export function useModulePrices() {
  const queryClient = useQueryClient();

  const { data: prices = [], isLoading } = useQuery({
    queryKey: ["module-prices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("module_prices")
        .select("*")
        .order("module_code");
      if (error) throw error;
      return data as ModulePrice[];
    },
  });

  const updatePrice = useMutation({
    mutationFn: async ({ moduleCode, priceMonthly, standardPrice }: { moduleCode: string; priceMonthly?: number; standardPrice?: number }) => {
      const updates: any = { module_code: moduleCode, updated_at: new Date().toISOString() };
      if (priceMonthly !== undefined) updates.price_monthly = priceMonthly;
      if (standardPrice !== undefined) updates.standard_price = standardPrice;
      const { error } = await supabase
        .from("module_prices")
        .upsert(updates, { onConflict: "module_code" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["module-prices"] });
      const t = getT();
      toast({ title: t("modulePrice.saved") });
    },
    onError: (e: Error) => {
      const t = getT();
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  const getPrice = (moduleCode: string): number => {
    const p = prices.find((pr) => pr.module_code === moduleCode);
    return p ? Number(p.price_monthly) : 0;
  };

  const getStandardPrice = (moduleCode: string): number => {
    const p = prices.find((pr) => pr.module_code === moduleCode);
    return p ? Number(p.standard_price) : 0;
  };

  return { prices, isLoading, updatePrice, getPrice, getStandardPrice };
}
