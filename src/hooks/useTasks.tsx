import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export type TaskStatus = "open" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "critical";
export type TaskSourceType = "manual" | "alert" | "charging" | "automation";

export interface Task {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_to: string | null;
  assigned_to_name: string | null;
  external_contact_name: string | null;
  external_contact_email: string | null;
  external_contact_phone: string | null;
  source_type: TaskSourceType;
  source_id: string | null;
  source_label: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskHistory {
  id: string;
  task_id: string;
  tenant_id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  old_value: string | null;
  new_value: string | null;
  comment: string | null;
  created_at: string;
}

export interface TenantUser {
  user_id: string;
  email: string;
  contact_person: string | null;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  assigned_to?: string;
  assigned_to_name?: string;
  external_contact_name?: string;
  external_contact_email?: string;
  external_contact_phone?: string;
  source_type?: TaskSourceType;
  source_id?: string;
  source_label?: string;
  due_date?: string;
}

export const useTasks = () => {
  const { tenant } = useTenant();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Task[];
    },
  });

  // Load all users of this tenant for assignment dropdown
  const { data: tenantUsers = [] } = useQuery({
    queryKey: ["tenant-users-for-tasks", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, email, contact_person")
        .eq("tenant_id", tenant!.id);
      if (error) throw error;
      return data as TenantUser[];
    },
  });

  const createTask = useMutation({
    mutationFn: async (input: CreateTaskInput) => {
      const { data, error } = await supabase.from("tasks").insert({
        tenant_id: tenant!.id,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority ?? "medium",
        status: "open",
        assigned_to: input.assigned_to ?? null,
        assigned_to_name: input.assigned_to_name ?? null,
        external_contact_name: input.external_contact_name ?? null,
        external_contact_email: input.external_contact_email ?? null,
        external_contact_phone: input.external_contact_phone ?? null,
        source_type: input.source_type ?? "manual",
        source_id: input.source_id ?? null,
        source_label: input.source_label ?? null,
        due_date: input.due_date ?? null,
        created_by: user?.id ?? null,
        created_by_name: user?.email ?? null,
      }).select().single();
      if (error) throw error;
      // Write history entry
      if (data) {
        await supabase.from("task_history").insert({
          task_id: data.id,
          tenant_id: tenant!.id,
          actor_id: user?.id ?? null,
          actor_name: user?.email ?? null,
          action: "created",
          new_value: input.title,
        });
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", tenant?.id] });
      toast({ title: "Aufgabe erstellt" });
    },
    onError: () => {
      toast({ title: "Fehler beim Erstellen", variant: "destructive" });
    },
  });

  const updateTask = useMutation({
    mutationFn: async ({
      id,
      historyAction,
      historyOldValue,
      historyNewValue,
      historyComment,
      ...updates
    }: Partial<Task> & {
      id: string;
      historyAction?: string;
      historyOldValue?: string;
      historyNewValue?: string;
      historyComment?: string;
    }) => {
      const { error } = await supabase
        .from("tasks")
        .update(updates)
        .eq("id", id)
        .eq("tenant_id", tenant!.id);
      if (error) throw error;

      if (historyAction) {
        await supabase.from("task_history").insert({
          task_id: id,
          tenant_id: tenant!.id,
          actor_id: user?.id ?? null,
          actor_name: user?.email ?? null,
          action: historyAction,
          old_value: historyOldValue ?? null,
          new_value: historyNewValue ?? null,
          comment: historyComment ?? null,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", tenant?.id] });
      queryClient.invalidateQueries({ queryKey: ["task-history"] });
    },
    onError: () => {
      toast({ title: "Fehler beim Aktualisieren", variant: "destructive" });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenant!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", tenant?.id] });
      toast({ title: "Aufgabe gelöscht" });
    },
    onError: () => {
      toast({ title: "Fehler beim Löschen", variant: "destructive" });
    },
  });

  const addComment = useMutation({
    mutationFn: async ({ taskId, comment }: { taskId: string; comment: string }) => {
      const { error } = await supabase.from("task_history").insert({
        task_id: taskId,
        tenant_id: tenant!.id,
        actor_id: user?.id ?? null,
        actor_name: user?.email ?? null,
        action: "comment",
        comment,
      });
      if (error) throw error;
    },
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ["task-history", taskId] });
    },
    onError: () => {
      toast({ title: "Fehler beim Speichern des Kommentars", variant: "destructive" });
    },
  });

  return { tasks, isLoading, tenantUsers, createTask, updateTask, deleteTask, addComment };
};

export const useTaskHistory = (taskId: string) => {
  const { tenant } = useTenant();
  return useQuery({
    queryKey: ["task-history", taskId],
    enabled: !!tenant?.id && !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_history")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as TaskHistory[];
    },
  });
};
