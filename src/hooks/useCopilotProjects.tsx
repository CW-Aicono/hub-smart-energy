import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { toast } from "./use-toast";

export interface CopilotProject {
  id: string;
  tenant_id: string;
  analysis_id: string | null;
  location_id: string | null;
  title: string;
  technology: string | null;
  priority: number;
  estimated_investment: number;
  estimated_funding: number;
  estimated_roi_years: number | null;
  estimated_savings_year: number;
  status: string;
  target_year: number | null;
  notes: string | null;
  created_at: string;
}

export function useCopilotProjects() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const tenantId = tenant?.id;

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["copilot-projects", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("copilot_projects" as any)
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("priority", { ascending: true });
      if (error) throw error;
      return data as unknown as CopilotProject[];
    },
  });

  const createProject = useMutation({
    mutationFn: async (project: Omit<CopilotProject, "id" | "tenant_id" | "created_at" | "updated_at">) => {
      const { error } = await supabase.from("copilot_projects" as any).insert({
        ...project,
        tenant_id: tenantId!,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["copilot-projects", tenantId] });
      toast({ title: "Projekt erstellt" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const updateProjectStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("copilot_projects" as any).update({ status } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["copilot-projects", tenantId] });
      toast({ title: "Status aktualisiert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { projects, isLoading, createProject, updateProjectStatus };
}
