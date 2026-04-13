import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantQuery } from "./useTenantQuery";
import { toast } from "sonner";

export interface SolarChargingConfig {
  id: string;
  tenant_id: string;
  location_id: string;
  reference_meter_id: string | null;
  min_charge_power_w: number;
  safety_buffer_w: number;
  priority_mode: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useSolarChargingConfig(locationId?: string) {
  const { tenantId } = useTenantQuery();
  const queryClient = useQueryClient();
  const queryKey = ["solar-charging-config", tenantId, locationId];

  const { data: config, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!tenantId || !locationId) return null;
      const { data, error } = await supabase
        .from("solar_charging_config")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("location_id", locationId)
        .maybeSingle();
      if (error) throw error;
      return data as SolarChargingConfig | null;
    },
    enabled: !!tenantId && !!locationId,
  });

  const upsert = useMutation({
    mutationFn: async (values: Partial<SolarChargingConfig> & { location_id: string }) => {
      if (!tenantId) throw new Error("No tenant");
      const payload = { ...values, tenant_id: tenantId };
      
      if (config?.id) {
        const { error } = await supabase
          .from("solar_charging_config")
          .update(payload as any)
          .eq("id", config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("solar_charging_config")
          .insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("PV-Überschussladen-Konfiguration gespeichert");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => {
      toast.error("Fehler beim Speichern: " + (err as Error).message);
    },
  });

  return { config, isLoading, upsert };
}

export function useSolarChargingLog(locationId?: string) {
  const { tenantId } = useTenantQuery();

  return useQuery({
    queryKey: ["solar-charging-log", tenantId, locationId],
    queryFn: async () => {
      if (!tenantId || !locationId) return [];
      const { data, error } = await supabase
        .from("solar_charging_log")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("location_id", locationId)
        .order("executed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!tenantId && !!locationId,
  });
}
