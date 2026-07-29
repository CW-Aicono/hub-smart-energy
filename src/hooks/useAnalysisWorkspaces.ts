import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantQuery } from "./useTenantQuery";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface AnalysisBlock {
  id: string;
  type: "timeseries" | "kpi" | "heatmap" | "correlation" | "comparison" | "formula";
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config: Record<string, unknown>;
}

export interface AnalysisWorkspace {
  id: string;
  tenant_id: string;
  created_by: string;
  name: string;
  description: string | null;
  layout: Record<string, unknown>;
  blocks: AnalysisBlock[];
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceInput {
  name: string;
  description?: string;
  layout?: Record<string, unknown>;
  blocks?: AnalysisBlock[];
  is_shared?: boolean;
}

const QUERY_KEY = "analysis-workspaces";

export function useAnalysisWorkspaces() {
  const { tenantId, ready } = useTenantQuery();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: workspaces = [], isLoading } = useQuery({
    queryKey: [QUERY_KEY, tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("analysis_workspaces" as any)
        .select("*")
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AnalysisWorkspace[];
    },
    enabled: ready,
  });

  const createMutation = useMutation({
    mutationFn: async (input: WorkspaceInput) => {
      if (!tenantId || !user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("analysis_workspaces" as any)
        .insert({
          tenant_id: tenantId,
          created_by: user.id,
          name: input.name,
          description: input.description ?? null,
          layout: input.layout ?? {},
          blocks: input.blocks ?? [],
          is_shared: input.is_shared ?? false,
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as AnalysisWorkspace;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY, tenantId] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...input }: Partial<WorkspaceInput> & { id: string }) => {
      const { data, error } = await supabase
        .from("analysis_workspaces" as any)
        .update({
          name: input.name,
          description: input.description,
          layout: input.layout,
          blocks: input.blocks,
          is_shared: input.is_shared,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as AnalysisWorkspace;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY, tenantId] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("analysis_workspaces" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY, tenantId] }),
    onError: (err: Error) => toast.error(err.message),
  });

  return {
    workspaces,
    isLoading,
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    remove: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
