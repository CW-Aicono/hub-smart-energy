import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AnalyticsKpi {
  label: string;
  value: number | string;
  unit: string;
}
export interface AnalyticsChartPoint { x: string; y: number }
export interface AnalyticsChartSeries { name: string; unit?: string; data: AnalyticsChartPoint[] }
export interface AnalyticsChart {
  type: "bar" | "line" | "pie" | "table";
  x_label: string;
  y_label: string;
  unit?: string;
  series: AnalyticsChartSeries[];
}
export interface AnalyticsResult {
  title: string;
  kpis: AnalyticsKpi[];
  chart: AnalyticsChart;
  insight_markdown: string;
  sources: string[];
}
export interface AnalyticsQuery {
  id: string;
  tenant_id: string;
  user_id: string | null;
  title: string;
  prompt: string;
  location_id: string | null;
  period_start: string | null;
  period_end: string | null;
  result_json: AnalyticsResult | null;
  is_pinned: boolean;
  model_used: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface RunAnalyticsArgs {
  prompt: string;
  location_id?: string | null;
  period_start?: string;
  period_end?: string;
}

export function useCopilotAnalyticsList() {
  return useQuery({
    queryKey: ["copilot-analytics-queries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("copilot_analytics_queries" as any)
        .select("*")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as AnalyticsQuery[];
    },
  });
}

export function useRunCopilotAnalytics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: RunAnalyticsArgs) => {
      const { data, error } = await supabase.functions.invoke("copilot-analytics", { body: args });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      return (data as any).query as AnalyticsQuery;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["copilot-analytics-queries"] });
      toast.success("Analyse erstellt und gespeichert");
    },
    onError: (e: any) => {
      toast.error(e?.message ?? "Analyse fehlgeschlagen");
    },
  });
}

export function useTogglePinAnalytics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_pinned }: { id: string; is_pinned: boolean }) => {
      const { error } = await supabase
        .from("copilot_analytics_queries" as any)
        .update({ is_pinned })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["copilot-analytics-queries"] }),
  });
}

export function useDeleteAnalytics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("copilot_analytics_queries" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["copilot-analytics-queries"] });
      toast.success("Analyse gelöscht");
    },
  });
}

export function useRenameAnalytics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase
        .from("copilot_analytics_queries" as any)
        .update({ title })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["copilot-analytics-queries"] }),
  });
}
