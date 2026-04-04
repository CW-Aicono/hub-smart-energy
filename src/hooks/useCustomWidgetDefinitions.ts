import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export type ChartType = "line" | "bar" | "gauge" | "kpi" | "table";
export type AggregationType = "sum" | "avg" | "max" | "min";

export interface ThresholdConfig {
  value: number;
  label: string;
  color: string;
}

export interface CustomWidgetConfig {
  meter_ids: string[];
  aggregation: AggregationType;
  unit: string;
  thresholds: ThresholdConfig[];
  y_range: { min: number | null; max: number | null };
  series_colors: Record<string, string>;
}

export interface CustomWidgetDefinition {
  id: string;
  tenant_id: string;
  created_by: string;
  name: string;
  icon: string;
  color: string;
  chart_type: ChartType;
  config: CustomWidgetConfig;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

const QUERY_KEY = "custom_widget_definitions";

export function useCustomWidgetDefinitions() {
  const { tenant } = useTenant();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tenantId = tenant?.id;

  const { data: definitions = [], isLoading } = useQuery({
    queryKey: [QUERY_KEY, tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("custom_widget_definitions")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CustomWidgetDefinition[];
    },
    enabled: !!tenantId,
  });

  const createMutation = useMutation({
    mutationFn: async (input: Omit<CustomWidgetDefinition, "id" | "tenant_id" | "created_by" | "created_at" | "updated_at">) => {
      if (!tenantId || !user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("custom_widget_definitions")
        .insert({
          tenant_id: tenantId,
          created_by: user.id,
          name: input.name,
          icon: input.icon,
          color: input.color,
          chart_type: input.chart_type,
          config: input.config as any,
          is_shared: input.is_shared,
        })
        .select()
        .single();
      if (error) throw error;
      const created = data as unknown as CustomWidgetDefinition;

      // Auto-insert dashboard_widgets entry for the creator
      await supabase.from("dashboard_widgets").insert({
        user_id: user.id,
        widget_type: `custom_${created.id}`,
        position: 99,
        is_visible: true,
        widget_size: "full",
        config: {},
      });

      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-widgets"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...input }: Partial<CustomWidgetDefinition> & { id: string }) => {
      const { data, error } = await supabase
        .from("custom_widget_definitions")
        .update({
          ...input,
          config: input.config as any,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as CustomWidgetDefinition;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("custom_widget_definitions")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-widgets"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      const original = definitions.find((d) => d.id === id);
      if (!original || !tenantId || !user) throw new Error("Not found");
      const { data, error } = await supabase
        .from("custom_widget_definitions")
        .insert({
          tenant_id: tenantId,
          created_by: user.id,
          name: `${original.name} (Kopie)`,
          icon: original.icon,
          color: original.color,
          chart_type: original.chart_type,
          config: original.config as any,
          is_shared: original.is_shared,
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as CustomWidgetDefinition;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return {
    definitions,
    isLoading,
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    remove: deleteMutation.mutateAsync,
    duplicate: duplicateMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
}
