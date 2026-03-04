import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { useDemoMode } from "@/contexts/DemoMode";
import { useEffect } from "react";

export interface IntegrationError {
  id: string;
  tenant_id: string;
  location_id: string | null;
  location_integration_id: string | null;
  integration_type: string;
  error_type: string;
  error_message: string;
  severity: string;
  sensor_name: string | null;
  sensor_type: string | null;
  is_resolved: boolean;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  task_id: string | null;
}

export function useIntegrationErrors() {
  const { tenant } = useTenant();
  const isDemo = useDemoMode();

  const queryKey = ["integration-errors", tenant?.id ?? "none"];

  const { data: errors = [], isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      if (isDemo) return [];
      const { data, error } = await supabase
        .from("integration_errors")
        .select("*, task:tasks!integration_errors_task_id_fkey(status)")
        .eq("tenant_id", tenant!.id)
        .eq("is_resolved", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Only show errors whose linked task is still "open" (or has no task)
      return ((data || []) as any[])
        .filter((e) => {
          const taskStatus = e.task?.status;
          return !taskStatus || taskStatus === "open";
        })
        .map(({ task, ...rest }) => rest as IntegrationError);
    },
    enabled: !isDemo && !!tenant,
    staleTime: 60_000,
  });

  // Subscribe to realtime changes
  useEffect(() => {
    if (isDemo || !tenant) return;
    const channel = supabase
      .channel("integration-errors-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "integration_errors" },
        () => { refetch(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenant, isDemo, refetch]);

  // Set of location IDs with active errors
  const errorLocationIds = new Set(
    errors.filter((e) => e.location_id).map((e) => e.location_id!)
  );

  return { errors, loading: isLoading, refetch, errorLocationIds };
}
