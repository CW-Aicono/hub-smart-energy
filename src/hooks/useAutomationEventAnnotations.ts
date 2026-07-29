import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantQuery } from "./useTenantQuery";

export interface EventAnnotation {
  id: string;
  t: number;
  label: string;
  color: string;
}

/**
 * Loads automation-execution events (success + error) in a time window and
 * returns them as annotation-ready markers for the timeseries chart.
 */
export function useAutomationEventAnnotations(params: {
  fromMs: number | null;
  toMs: number | null;
  enabled: boolean;
}) {
  const { tenantId, ready } = useTenantQuery();
  const { fromMs, toMs, enabled } = params;

  return useQuery({
    queryKey: ["automation-event-annotations", tenantId, fromMs, toMs],
    enabled: enabled && ready && !!tenantId && !!fromMs && !!toMs,
    staleTime: 60_000,
    queryFn: async (): Promise<EventAnnotation[]> => {
      const { data: logs, error } = await supabase
        .from("automation_execution_log")
        .select("id, executed_at, status, error_message, automation_id")
        .eq("tenant_id", tenantId!)
        .gte("executed_at", new Date(fromMs!).toISOString())
        .lte("executed_at", new Date(toMs!).toISOString())
        .order("executed_at", { ascending: true })
        .limit(50);
      if (error) throw error;
      if (!logs || logs.length === 0) return [];
      const autoIds = [...new Set(logs.map((l: any) => l.automation_id).filter(Boolean))];
      const nameMap = new Map<string, string>();
      if (autoIds.length > 0) {
        const { data: autos } = await supabase
          .from("location_automations")
          .select("id, name")
          .in("id", autoIds);
        (autos ?? []).forEach((a: any) => nameMap.set(a.id, a.name));
      }
      return logs.map((l: any) => ({
        id: `evt-${l.id}`,
        t: new Date(l.executed_at).getTime(),
        label: nameMap.get(l.automation_id) ?? "Automation",
        color: l.status === "error" || l.status === "failed" ? "#ef4444" : "#10b981",
      }));
    },
  });
}
