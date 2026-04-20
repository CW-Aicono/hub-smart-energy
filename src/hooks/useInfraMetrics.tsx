import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface InfraMetric {
  id: string;
  metric_type: string;
  metric_name: string;
  metric_value: number | null;
  metadata: Record<string, any>;
  recorded_at: string;
}

export function useInfraMetrics() {
  const queryClient = useQueryClient();

  const { data: metrics = [], isLoading } = useQuery({
    queryKey: ["infrastructure-metrics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("infrastructure_metrics")
        .select("*")
        .order("recorded_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as unknown as InfraMetric[];
    },
    refetchInterval: 5 * 60_000,
  });

  const collectMetrics = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("collect-metrics");
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["infrastructure-metrics"] });
    },
  });

  // Get latest value for a specific metric
  const getLatest = (type: string, name: string): InfraMetric | undefined => {
    return metrics.find((m) => m.metric_type === type && m.metric_name === name);
  };

  // Get time series for a metric (last N entries)
  const getTimeSeries = (type: string, name: string, limit = 24): InfraMetric[] => {
    return metrics
      .filter((m) => m.metric_type === type && m.metric_name === name)
      .slice(0, limit)
      .reverse();
  };

  // Get latest health check
  const getHealthStatus = (): Record<string, string> => {
    const health = getLatest("system_health", "health_check");
    return (health?.metadata as Record<string, string>) ?? {};
  };

  // Get table sizes
  const getTableSizes = (): InfraMetric[] => {
    const seen = new Set<string>();
    return metrics.filter((m) => {
      if (m.metric_type !== "table_size") return false;
      if (seen.has(m.metric_name)) return false;
      seen.add(m.metric_name);
      return true;
    });
  };

  return {
    metrics,
    isLoading,
    collectMetrics,
    getLatest,
    getTimeSeries,
    getHealthStatus,
    getTableSizes,
  };
}
