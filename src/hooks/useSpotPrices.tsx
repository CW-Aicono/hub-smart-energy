import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useSpotPrices(marketArea = "DE-LU", hours = 48) {
  const { data: prices = [], isLoading } = useQuery({
    queryKey: ["spot-prices", marketArea, hours],
    queryFn: async () => {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("spot_prices")
        .select("*")
        .eq("market_area", marketArea)
        .gte("timestamp", since)
        .order("timestamp", { ascending: true });
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const currentPrice = prices.length > 0 ? prices[prices.length - 1] : null;

  return { prices, isLoading, currentPrice };
}
