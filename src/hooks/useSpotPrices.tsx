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

  const currentPrice = (() => {
    if (prices.length === 0) return null;
    const now = Date.now();
    // Find the price entry whose hour contains "now" (timestamp <= now, next timestamp > now)
    for (let i = prices.length - 1; i >= 0; i--) {
      if (new Date(prices[i].timestamp).getTime() <= now) {
        return prices[i];
      }
    }
    return prices[0];
  })();

  return { prices, isLoading, currentPrice };
}
