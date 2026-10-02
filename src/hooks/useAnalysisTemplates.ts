import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantQuery } from "./useTenantQuery";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { AnalysisBlock } from "./useAnalysisWorkspaces";

export interface AnalysisTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  icon: string | null;
  is_system: boolean;
  tenant_id: string | null;
  created_by: string | null;
  blocks: AnalysisBlock[];
  layout: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const KEY = "analysis-workspace-templates";

export function useAnalysisTemplates() {
  const { ready } = useTenantQuery();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: [KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analysis_workspace_templates" as any)
        .select("*")
        .order("is_system", { ascending: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AnalysisTemplate[];
    },
    enabled: ready,
  });

  const saveAsTemplate = useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string;
      category?: string;
      blocks: AnalysisBlock[];
      layout: Record<string, unknown>;
    }) => {
      const { tenantId } = await getTenant();
      if (!tenantId || !user) throw new Error("Nicht angemeldet");
      const { data, error } = await supabase
        .from("analysis_workspace_templates" as any)
        .insert({
          name: input.name,
          description: input.description ?? null,
          category: input.category ?? "custom",
          blocks: input.blocks,
          layout: input.layout,
          is_system: false,
          tenant_id: tenantId,
          created_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as AnalysisTemplate;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("analysis_workspace_templates" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    templates,
    isLoading,
    saveAsTemplate: saveAsTemplate.mutateAsync,
    removeTemplate: removeTemplate.mutateAsync,
  };
}

async function getTenant() {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return { tenantId: null as string | null };
  const { data: prof } = await supabase.from("profiles").select("tenant_id").eq("id", userId).maybeSingle();
  return { tenantId: (prof?.tenant_id as string | null) ?? null };
}
