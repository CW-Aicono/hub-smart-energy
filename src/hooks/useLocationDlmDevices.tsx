import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { toast } from "sonner";

export type DlmDeviceKind = "charge_point" | "heat_pump" | "battery" | "generic_actuator";

export interface DlmDevice {
  id: string;
  tenant_id: string;
  location_id: string;
  device_kind: DlmDeviceKind;
  device_ref_id: string;
  display_name: string | null;
  min_power_kw: number;
  max_power_kw: number;
  priority: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DlmDeviceInput {
  device_kind: DlmDeviceKind;
  device_ref_id: string;
  display_name?: string | null;
  min_power_kw?: number;
  max_power_kw?: number;
  priority?: number;
}

export function useLocationDlmDevices(locationId: string | undefined) {
  const { tenant } = useTenant();
  const qc = useQueryClient();

  const queryKey = ["location-dlm-devices", tenant?.id, locationId];

  const listQuery = useQuery({
    queryKey,
    enabled: !!tenant?.id && !!locationId,
    staleTime: 30_000,
    queryFn: async (): Promise<DlmDevice[]> => {
      const { data, error } = await (supabase as any)
        .from("location_dlm_devices")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .eq("location_id", locationId!)
        .order("priority", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DlmDevice[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (input: DlmDeviceInput) => {
      if (!tenant?.id || !locationId) throw new Error("Kein Mandant/Standort");
      const current = listQuery.data ?? [];
      const nextPrio = input.priority ?? (current.length > 0
        ? Math.max(...current.map((d) => d.priority)) + 10
        : 10);
      const { error } = await (supabase as any).from("location_dlm_devices").insert({
        tenant_id: tenant.id,
        location_id: locationId,
        device_kind: input.device_kind,
        device_ref_id: input.device_ref_id,
        display_name: input.display_name ?? null,
        min_power_kw: input.min_power_kw ?? 0,
        max_power_kw: input.max_power_kw ?? 11,
        priority: nextPrio,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: any) => toast.error(`Gerät hinzufügen fehlgeschlagen: ${e.message ?? e}`),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("location_dlm_devices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (e: any) => toast.error(`Löschen fehlgeschlagen: ${e.message ?? e}`),
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      // Prioritäten in 10er-Schritten neu vergeben.
      const updates = orderedIds.map((id, i) =>
        (supabase as any).from("location_dlm_devices").update({ priority: (i + 1) * 10 }).eq("id", id),
      );
      const results = await Promise.all(updates);
      const failed = results.find((r: any) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (e: any) => toast.error(`Reihenfolge speichern fehlgeschlagen: ${e.message ?? e}`),
  });

  return {
    devices: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    add: addMutation.mutate,
    remove: removeMutation.mutate,
    reorder: reorderMutation.mutate,
    saving: addMutation.isPending || removeMutation.isPending || reorderMutation.isPending,
  };
}
