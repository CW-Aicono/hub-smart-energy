import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type RoadmapStatus = "backlog" | "next" | "in_progress" | "review" | "done";
export type RoadmapCategory = "stability" | "data_quality" | "feature" | "tech_debt";

export interface RoadmapItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  impact: number;
  effort: number;
  risk: number;
  rank: number;
  owner: string | null;
  due_date: string | null;
  plan_ref: string | null;
  tenant_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoadmapHistoryEntry {
  id: string;
  item_id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

/** Rang-Score: hohe Wirkung + hohes Risiko, geringer Aufwand => hoher Score. */
export function roadmapScore(item: Pick<RoadmapItem, "impact" | "effort" | "risk">) {
  return Number((((item.impact * 2 + item.risk) / Math.max(1, item.effort)) * 10).toFixed(0));
}

export function useRoadmapItems() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["roadmap-items"],
    queryFn: async (): Promise<RoadmapItem[]> => {
      const { data, error } = await supabase
        .from("roadmap_items")
        .select("*")
        .order("rank", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RoadmapItem[];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["roadmap-items"] });

  const createItem = useMutation({
    mutationFn: async (values: Partial<RoadmapItem>) => {
      const { error } = await supabase.from("roadmap_items").insert({
        title: values.title ?? "Neuer Eintrag",
        description: values.description ?? null,
        category: values.category ?? "feature",
        status: values.status ?? "backlog",
        impact: values.impact ?? 3,
        effort: values.effort ?? 3,
        risk: values.risk ?? 3,
        rank: values.rank ?? 999,
        owner: values.owner ?? null,
        due_date: values.due_date ?? null,
        plan_ref: values.plan_ref ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Eintrag angelegt");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, ...values }: Partial<RoadmapItem> & { id: string }) => {
      const { error } = await supabase.from("roadmap_items").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("roadmap_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Eintrag gelöscht");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
    createItem,
    updateItem,
    deleteItem,
  };
}

export function useRoadmapHistory(itemId: string | null) {
  return useQuery({
    queryKey: ["roadmap-history", itemId],
    enabled: !!itemId,
    queryFn: async (): Promise<RoadmapHistoryEntry[]> => {
      const { data, error } = await supabase
        .from("roadmap_item_history")
        .select("*")
        .eq("item_id", itemId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as RoadmapHistoryEntry[];
    },
  });
}
