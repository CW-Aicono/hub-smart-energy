import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import type { ChecklistItem, TaskPriority } from "@/hooks/useTasks";

export interface TaskTemplate {
  id: string;
  tenant_id: string;
  name: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  default_due_offset_days: number | null;
  recurrence_rule: string | null;
  checklist: ChecklistItem[];
  created_at: string;
  updated_at: string;
}

export interface TaskTemplateInput {
  name: string;
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  default_due_offset_days?: number | null;
  recurrence_rule?: string | null;
  checklist?: ChecklistItem[];
}

export const useTaskTemplates = () => {
  const { tenant } = useTenant();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["task-templates", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_templates")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as TaskTemplate[];
    },
  });

  const createTemplate = useMutation({
    mutationFn: async (input: TaskTemplateInput) => {
      const { error } = await supabase.from("task_templates").insert({
        tenant_id: tenant!.id,
        name: input.name,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority ?? "medium",
        default_due_offset_days: input.default_due_offset_days ?? null,
        recurrence_rule: input.recurrence_rule ?? null,
        checklist: (input.checklist ?? []) as any,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-templates", tenant?.id] });
      toast({ title: "Vorlage gespeichert" });
    },
    onError: () => toast({ title: "Fehler beim Speichern", variant: "destructive" }),
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<TaskTemplateInput>) => {
      const { error } = await supabase
        .from("task_templates")
        .update(patch as any)
        .eq("id", id)
        .eq("tenant_id", tenant!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-templates", tenant?.id] });
      toast({ title: "Vorlage aktualisiert" });
    },
    onError: () => toast({ title: "Fehler beim Aktualisieren", variant: "destructive" }),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("task_templates").delete().eq("id", id).eq("tenant_id", tenant!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-templates", tenant?.id] });
      toast({ title: "Vorlage gelöscht" });
    },
    onError: () => toast({ title: "Fehler beim Löschen", variant: "destructive" }),
  });

  return { templates, isLoading, createTemplate, updateTemplate, deleteTemplate };
};
