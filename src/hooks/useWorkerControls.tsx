import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface WorkerControl {
  worker_key: string;
  display_name: string;
  description: string | null;
  enabled: boolean;
  paused_at: string | null;
  paused_by: string | null;
  note: string | null;
  updated_at: string;
}

export function useWorkerControls() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["worker-controls"],
    queryFn: async (): Promise<WorkerControl[]> => {
      const { data, error } = await supabase
        .from("worker_controls")
        .select("*")
        .order("display_name");
      if (error) throw error;
      return (data ?? []) as WorkerControl[];
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const setEnabled = useMutation({
    mutationFn: async ({ worker_key, enabled, note }: { worker_key: string; enabled: boolean; note?: string | null }) => {
      const { error } = await supabase
        .from("worker_controls")
        .update({ enabled, note: note ?? null })
        .eq("worker_key", worker_key);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["worker-controls"] });
      toast({
        title: variables.enabled ? "Worker aktiviert" : "Worker pausiert",
        description: `${variables.worker_key} → ${variables.enabled ? "aktiv" : "pausiert"}`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Fehler",
        description: err?.message ?? "Unbekannter Fehler",
        variant: "destructive",
      });
    },
  });

  return { ...query, setEnabled };
}
