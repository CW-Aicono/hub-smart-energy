import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type AlertRule = {
  id: string;
  metric_category: string;
  metric_name: string;
  comparator: ">" | ">=" | "<" | "<=";
  threshold: number;
  severity: "info" | "warning" | "critical";
  enabled: boolean;
  notify_email: string | null;
  created_at: string;
  updated_at: string;
};

export type AlertRuleInput = Omit<AlertRule, "id" | "created_at" | "updated_at">;

export function useMonitoringAlertRules() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["monitoring-alert-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monitoring_alert_rules" as any)
        .select("*")
        .order("metric_category", { ascending: true })
        .order("metric_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AlertRule[];
    },
  });

  const create = useMutation({
    mutationFn: async (input: AlertRuleInput) => {
      const { data: userData } = await supabase.auth.getUser();
      const payload = { ...input, created_by: userData.user?.id ?? null };
      const { error } = await supabase.from("monitoring_alert_rules" as any).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Regel angelegt");
      qc.invalidateQueries({ queryKey: ["monitoring-alert-rules"] });
    },
    onError: (e: Error) => toast.error(`Fehler: ${e.message}`),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<AlertRuleInput> }) => {
      const { error } = await supabase
        .from("monitoring_alert_rules" as any)
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["monitoring-alert-rules"] });
    },
    onError: (e: Error) => toast.error(`Fehler: ${e.message}`),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("monitoring_alert_rules" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Regel gelöscht");
      qc.invalidateQueries({ queryKey: ["monitoring-alert-rules"] });
    },
    onError: (e: Error) => toast.error(`Fehler: ${e.message}`),
  });

  return { ...query, create, update, remove };
}
