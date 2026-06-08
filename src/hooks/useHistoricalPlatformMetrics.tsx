import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PlatformMetricRow = {
  id: string;
  recorded_at: string;
  metric_key: string;
  metric_value: number;
  dimension: string | null;
};

export function useHistoricalPlatformMetrics() {
  return useQuery({
    queryKey: ["platform-metrics-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_metrics" as any)
        .select("*")
        .order("recorded_at", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as unknown as PlatformMetricRow[];
    },
  });
}
