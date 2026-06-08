import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { toast } from "sonner";

export interface DlmConfig {
  id: string;
  tenant_id: string;
  location_id: string;
  reference_meter_id: string | null;
  grid_limit_kw: number;
  safety_buffer_kw: number;
  fallback_kw_per_cp: number;
  control_interval_s: number;
  min_charge_kw: number;
  is_active: boolean;
  priority_order: string[];
  created_at: string;
  updated_at: string;
}

export interface DlmConfigInput {
  reference_meter_id: string | null;
  grid_limit_kw: number;
  safety_buffer_kw: number;
  fallback_kw_per_cp: number;
  min_charge_kw: number;
  is_active: boolean;
  priority_order: string[];
}

export interface DlmControlLogEntry {
  id: number;
  location_id: string;
  executed_at: string;
  measured_kw: number | null;
  available_kw: number | null;
  applied_profiles: Array<Record<string, unknown>>;
  reason: string | null;
}

export function useLocationDlmConfig(locationId: string | undefined) {
  const { tenant } = useTenant();
  const qc = useQueryClient();

  const configQuery = useQuery({
    queryKey: ["location-dlm-config", tenant?.id, locationId],
    enabled: !!tenant?.id && !!locationId,
    staleTime: 30_000,
    queryFn: async (): Promise<DlmConfig | null> => {
      const { data, error } = await (supabase as any)
        .from("location_dlm_config")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .eq("location_id", locationId!)
        .maybeSingle();
      if (error) throw error;
      return data as DlmConfig | null;
    },
  });

  const logQuery = useQuery({
    queryKey: ["location-dlm-log", tenant?.id, locationId],
    enabled: !!tenant?.id && !!locationId,
    staleTime: 10_000,
    queryFn: async (): Promise<DlmControlLogEntry[]> => {
      const { data, error } = await (supabase as any)
        .from("dlm_control_log")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .eq("location_id", locationId!)
        .order("executed_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as DlmControlLogEntry[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (input: DlmConfigInput) => {
      if (!tenant?.id || !locationId) throw new Error("Kein Mandant/Standort");
      const existing = configQuery.data;
      if (existing) {
        const { error } = await (supabase as any)
          .from("location_dlm_config")
          .update(input)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("location_dlm_config")
          .insert({ ...input, tenant_id: tenant.id, location_id: locationId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Dynamisches Lastmanagement gespeichert");
      qc.invalidateQueries({ queryKey: ["location-dlm-config"] });
    },
    onError: (e: any) => toast.error(`Speichern fehlgeschlagen: ${e.message ?? e}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!configQuery.data) return;
      const { error } = await (supabase as any)
        .from("location_dlm_config")
        .delete()
        .eq("id", configQuery.data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("DLM-Konfiguration entfernt");
      qc.invalidateQueries({ queryKey: ["location-dlm-config"] });
    },
  });

  return {
    config: configQuery.data ?? null,
    log: logQuery.data ?? [],
    isLoading: configQuery.isLoading,
    save: saveMutation.mutate,
    saving: saveMutation.isPending,
    remove: deleteMutation.mutate,
  };
}
